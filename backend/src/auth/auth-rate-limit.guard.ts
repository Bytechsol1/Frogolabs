import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { requireEmail, requireLoginEmail } from '../common/email-validation';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const action = request.route?.path || request.path;
        // Validate before rate-limit writes and before Passport reads credentials.
        // Profile updates may omit email; all other auth POSTs require it.
        if (request.method === 'POST' || Object.prototype.hasOwnProperty.call(request.body || {}, 'email')) {
            const email = action.endsWith('/login') ? requireLoginEmail(request.body?.email) : requireEmail(request.body?.email);
            request.body.email = email;
        }
        const sending = !action.endsWith('/verify') && !action.endsWith('/login');
        const limit = sending ? 10 : 30;
        const windowMs = 15 * 60 * 1000;
        const keys = [{ value: `${sending ? 'send' : action}:ip:${request.ip || request.socket?.remoteAddress || 'unknown'}`, limit, windowMs }];
        if (sending && typeof request.body?.email === 'string') {
            const email = request.body.email.trim().toLowerCase().slice(0, 254);
            keys.push({ value: `send:email:${email}`, limit: 10, windowMs });
            keys.push({ value: `send:cooldown:${email}`, limit: 1, windowMs: 60000 });
        }
        for (const rawKey of keys) {
            const key = createHash('sha256').update(rawKey.value).digest('hex');
            const now = new Date();
            const reset = new Date(now.getTime() + rawKey.windowMs);
            const [bucket] = await this.prisma.$queryRaw<{ attempts: number; resets_at: Date }[]>`
                INSERT INTO "AuthRateLimit" ("key", "attempts", "resets_at") VALUES (${key}, 1, ${reset})
                ON CONFLICT ("key") DO UPDATE SET
                  "attempts" = CASE WHEN "AuthRateLimit"."resets_at" <= ${now} THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
                  "resets_at" = CASE WHEN "AuthRateLimit"."resets_at" <= ${now} THEN ${reset} ELSE "AuthRateLimit"."resets_at" END
                RETURNING "attempts", "resets_at"`;
            if (bucket.attempts > rawKey.limit) {
                const retryAfter = Math.max(1, Math.ceil((bucket.resets_at.getTime() - now.getTime()) / 1000));
                response.setHeader('Retry-After', retryAfter);
                throw new HttpException({ code: rawKey.limit === 1 ? 'OTP_COOLDOWN' : 'RATE_LIMITED', message: rawKey.limit === 1 ? 'Please wait before requesting another code.' : 'Too many requests. Please try again later.', retry_after: retryAfter }, 429);
            }
        }
        await this.prisma.authRateLimit.deleteMany({ where: { resets_at: { lt: new Date() } } });
        return true;
    }
}

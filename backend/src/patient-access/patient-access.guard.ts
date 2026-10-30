import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

@Injectable()
export class PatientAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<
        Request<Record<string, string>, unknown, { result_id?: unknown }>
      >();
    const identifiers = [
      'ip:' + String(request.ip || request.socket?.remoteAddress || 'unknown'),
    ];
    if (typeof request.body?.result_id === 'string')
      identifiers.push(
        'result:' + request.body.result_id.trim().toUpperCase().slice(0, 128),
      );
    const now = new Date();
    const reset = new Date(Date.now() + 15 * 60 * 1000);
    for (const identifier of identifiers) {
      const key =
        'patient-access:' +
        createHash('sha256').update(identifier).digest('hex');
      const [bucket] = await this.prisma.$queryRaw<{ attempts: number }[]>`
            INSERT INTO "AuthRateLimit" ("key", "attempts", "resets_at") VALUES (${key}, 1, ${reset})
            ON CONFLICT ("key") DO UPDATE SET
              "attempts" = CASE WHEN "AuthRateLimit"."resets_at" <= ${now} THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
              "resets_at" = CASE WHEN "AuthRateLimit"."resets_at" <= ${now} THEN ${reset} ELSE "AuthRateLimit"."resets_at" END
            RETURNING "attempts"`;
      if (bucket.attempts > 60)
        throw new HttpException(
          'Too many report access attempts. Try again later.',
          429,
        );
    }
    return true;
  }
}

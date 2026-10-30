import { readJwtSecret } from '../jwt.config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: readJwtSecret(),
        });
    }

    async validate(payload: any) {
        if (typeof payload.sub !== 'string') throw new UnauthorizedException('Invalid session.');
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: {
            id: true, email: true, role: true, clinic_id: true, name: true, email_verified: true,
            is_clinic_admin: true,
            clinic: { select: { status: true, name: true } },
        } });
        if (!user || user.clinic?.status === 'Inactive') throw new UnauthorizedException('This session is no longer available.');
        if (!user.email_verified) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Your email has not been verified.' });
        if (user.role !== 'ADMIN' && (!user.clinic_id || !user.clinic)) throw new ForbiddenException('An active clinic membership is required.');
        const { clinic, ...profile } = user;
        return { ...profile, clinic_name: clinic?.name ?? null };
    }
}

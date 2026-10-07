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
            secretOrKey: process.env.JWT_SECRET || 'secretKey',
        });
    }

    async validate(payload: any) {
        if (typeof payload.sub !== 'string') throw new UnauthorizedException('Invalid session.');
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: {
            id: true, email: true, role: true, clinic_id: true, name: true, email_verified: true,
            clinic: { select: { status: true } },
        } });
        if (!user || user.clinic?.status === 'Inactive') throw new UnauthorizedException('This session is no longer available.');
        if (!user.email_verified) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Your email has not been verified.' });
        const { clinic, ...profile } = user;
        return profile;
    }
}

import { readJwtSecret } from '../jwt.config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sessionProfile } from '../session-profile';

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
        return sessionProfile(user);
    }
}

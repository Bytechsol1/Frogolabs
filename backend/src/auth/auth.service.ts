import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailOtpService } from './email-otp.service';
import { AuthDtoPipe, RegisterDto, registrationSchema, profileSchema } from './auth.dto';
import * as bcrypt from 'bcrypt';
import { requireEmail, requireLoginEmail } from '../common/email-validation';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private prisma: PrismaService,
        private emailOtp: EmailOtpService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        email = requireLoginEmail(email);
        if (typeof email !== 'string' || typeof pass !== 'string' || Buffer.byteLength(pass, 'utf8') > 72) return null;
        const user = await this.usersService.findOne(email.trim().toLowerCase());
        if (!user || !(await bcrypt.compare(pass, user.password_hash))) {
            return null;
        }
        if (user.clinic?.status === 'Inactive') {
            throw new UnauthorizedException('Your clinic account has been disabled. Please contact Frigo Labs.');
        }
        this.requireVerified(user);
        const { password_hash, clinic, ...result } = user;
        return result;
    }

    private requireVerified(user: { email_verified: boolean }) {
        if (!user.email_verified) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Your email has not been verified.' });
    }

    async login(user: any) {
        this.requireVerified(user);
        const payload = { email: user.email, sub: user.id, role: user.role, clinic_id: user.clinic_id ?? null, name: user.name };
        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
        };
    }

    async initiateRegistration(data: RegisterDto) {
        return this.emailOtp.register(new AuthDtoPipe(registrationSchema).transform(data) as RegisterDto);
    }

    async verifyOtp(email: string, otp: string) {
        const user = await this.emailOtp.verify(email, otp);
        return { ...await this.login(user), message: 'Email verified successfully.' };
    }

    async resendOtp(email: string) {
        return this.emailOtp.resend(email);
    }

    async updateProfile(userId: string, data: { name?: string; email?: string }) {
        data = profileSchema.parse(new AuthDtoPipe(profileSchema).transform(data));
        if (data.email !== undefined) data = { ...data, email: requireEmail(data.email) };
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (data.email && data.email.toLowerCase() !== user.email.toLowerCase()) {
            if (data.name) await this.usersService.update(userId, { name: data.name });
            return this.emailOtp.changeEmail(userId, data.email);
        }
        const updated = await this.usersService.update(userId, { ...(data.name ? { name: data.name } : {}) });
        return this.login(updated);
    }
}

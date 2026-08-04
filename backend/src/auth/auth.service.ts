import { Injectable, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private clinicsService: ClinicsService,
        private jwtService: JwtService,
        private prisma: PrismaService,
        private mailService: MailService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findOne(email);
        if (!user || !(await bcrypt.compare(pass, user.password_hash))) {
            return null;
        }
        if (user.clinic?.status === 'Inactive') {
            throw new UnauthorizedException('Your clinic account has been disabled. Please contact Frigo Labs.');
        }
        const { password_hash, clinic, ...result } = user;
        return result;
    }

    async login(user: any) {
        const payload = { email: user.email, sub: user.id, role: user.role, clinic_id: user.clinic_id ?? null, name: user.name };
        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
        };
    }

    async initiateRegistration(data: {
        clinicName: string;
        contactName: string;
        email: string;
        phone: string;
        password: string;
    }) {
        const existing = await this.usersService.findOne(data.email);
        if (existing) {
            throw new ConflictException('An account with this email already exists');
        }

        const passwordHash = await bcrypt.hash(data.password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const pendingObj = JSON.stringify({
            clinicName: data.clinicName,
            contactName: data.contactName,
            phone: data.phone,
            passwordHash,
        });

        await this.prisma.otpVerification.upsert({
            where: { email: data.email },
            create: {
                email: data.email,
                otp,
                expires_at: expiresAt,
                pending_data: pendingObj,
            },
            update: {
                otp,
                expires_at: expiresAt,
                pending_data: pendingObj,
            },
        });

        await this.mailService.sendOtp(data.email, otp, data.contactName);

        const isDev = process.env.NODE_ENV !== 'production';
        return {
            message: 'Verification code sent to your email address.',
            ...(isDev && { dev_otp: otp }),
        };
    }

    async verifyOtp(email: string, otp: string) {
        const record = await this.prisma.otpVerification.findUnique({ where: { email } });

        if (!record) {
            throw new BadRequestException('No pending registration found. Please sign up again.');
        }
        if (new Date() > record.expires_at) {
            await this.prisma.otpVerification.delete({ where: { email } });
            throw new BadRequestException('Verification code has expired. Please sign up again.');
        }
        if (record.otp !== otp) {
            throw new BadRequestException('Incorrect verification code. Please try again.');
        }

        const pendingData = typeof record.pending_data === 'string' ? JSON.parse(record.pending_data) : (record.pending_data as any);

        const clinic = await this.clinicsService.create({
            name: pendingData.clinicName,
            contact_name: pendingData.contactName,
            email,
            phone: pendingData.phone,
            status: 'Active',
        });

        const user = await this.usersService.create({
            name: pendingData.contactName,
            email,
            password_hash: pendingData.passwordHash,
            role: 'CLINIC_USER',
            clinic: { connect: { id: clinic.id } },
        });

        await this.prisma.otpVerification.delete({ where: { email } });

        const payload = { email: user.email, sub: user.id, role: user.role, clinic_id: clinic.id, name: user.name };
        return { access_token: this.jwtService.sign(payload) };
    }

    async updateProfile(userId: string, data: { name?: string; email?: string }) {
        const updated = await this.usersService.update(userId, data);
        const payload = { email: updated.email, sub: updated.id, role: updated.role, clinic_id: updated.clinic_id ?? null, name: updated.name };
        return { access_token: this.jwtService.sign(payload) };
    }
}

import { BadRequestException, ConflictException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './auth.dto';
import { requireEmail } from '../common/email-validation';

const EXPIRY_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const sentResponse = () => ({
    message: 'If this email is eligible, a verification code has been sent.',
    resend_after: 60,
    expires_in: 600,
});
type Delivery = { email: string; otp: string; hash: string; name: string };

@Injectable()
export class EmailOtpService {
    private readonly logger = new Logger(EmailOtpService.name);
    constructor(private readonly prisma: PrismaService, private readonly mail: MailService) { }

    private locked<T>(email: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
        return this.prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`email-otp:${email}`}))`;
            return work(tx);
        }, { timeout: 15000 });
    }

    private async reserve(tx: Prisma.TransactionClient, email: string, user: { id: string; name: string }, purpose = 'EMAIL_VERIFICATION'): Promise<Delivery> {
        const now = new Date();
        const previous = await tx.otpVerification.findUnique({ where: { email } });
        if (previous?.last_sent_at && now.getTime() - previous.last_sent_at.getTime() < COOLDOWN_MS) {
            const wait = Math.ceil((COOLDOWN_MS - (now.getTime() - previous.last_sent_at.getTime())) / 1000);
            throw new HttpException({ code: 'OTP_COOLDOWN', message: 'Please wait before requesting another code.', retry_after: wait }, 429);
        }
        let otp = randomInt(100000, 1000000).toString();
        while (previous?.otp_hash && await bcrypt.compare(otp, previous.otp_hash)) {
            otp = randomInt(100000, 1000000).toString();
        }
        const hash = await bcrypt.hash(otp, 12);
        const data = {
            user_id: user.id, otp_hash: hash, purpose, attempt_count: 0,
            expires_at: new Date(now.getTime() + EXPIRY_MS), last_sent_at: now,
            verified_at: null, invalidated_at: null, created_at: now,
            pending_data: Prisma.JsonNull,
        };
        // One row per email: replacing the hash immediately invalidates the old code.
        await tx.otpVerification.upsert({ where: { email }, create: { email, ...data }, update: data });
        return { email, otp, hash, name: user.name };
    }

    private async deliver(delivery: Delivery | null) {
        if (!delivery) return sentResponse(); // Same response for unknown/already verified accounts.
        try {
            await this.mail.sendOtp(delivery.email, delivery.otp, delivery.name);
        } catch {
            // Never invalidate a newer code if a previous SMTP request finishes late.
            await this.prisma.otpVerification.updateMany({
                where: { email: delivery.email, otp_hash: delivery.hash, verified_at: null },
                data: { invalidated_at: new Date() },
            });
            throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send verification email. Please try again.', retry_after: 60 });
        }
        return sentResponse();
    }

    async register(data: RegisterDto) {
        data = { ...data, email: requireEmail(data.email) };
        const delivery = await this.locked(data.email, async tx => {
            const existing = await tx.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } } });
            if (existing) {
                throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please use another email or sign in.' });
            }
            const clinicExists = await tx.clinic.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } }, select: { id: true } });
            if (clinicExists) throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please use another email or sign in.' });
            const clinic = await tx.clinic.create({ data: {
                name: data.clinicName, contact_name: data.contactName, email: data.email,
                phone: data.phone, status: 'Active',
            } });
            const user = await tx.user.create({ data: {
                email: data.email, name: data.contactName, password_hash: await bcrypt.hash(data.password, 12),
                email_verified: false, role: 'CLINIC_USER', clinic_id: clinic.id, is_clinic_admin: true,
            } });
            return this.reserve(tx, data.email, user);
        });
        return this.deliver(delivery);
    }

    async resend(email: string) {
        email = requireEmail(email);
        const delivery = await this.locked(email, async tx => {
            const user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
            if (user && !user.email_verified) return this.reserve(tx, email, user);
            const pending = await tx.otpVerification.findUnique({ where: { email } });
            if (!user && pending?.purpose === 'EMAIL_CHANGE' && pending.user_id && !pending.verified_at) {
                const owner = await tx.user.findUnique({ where: { id: pending.user_id } });
                if (owner) return this.reserve(tx, email, owner, 'EMAIL_CHANGE');
            }
            return null;
        });
        return this.deliver(delivery);
    }

    async changeEmail(userId: string, email: string) {
        email = requireEmail(email);
        const delivery = await this.locked(email, async tx => {
            const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            const occupied = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
            if (occupied) throw new BadRequestException('Unable to use this email address.');
            return this.reserve(tx, email, owner, 'EMAIL_CHANGE');
        });
        // Keep the original verified address until the new address is confirmed.
        return { ...await this.deliver(delivery), requires_verification: true, email };
    }

    async verify(email: string, otp: string) {
        // Service validation also protects non-controller callers.
        email = requireEmail(email);
        if (!/^\d{6}$/.test(otp)) throw new BadRequestException('Enter the 6-digit verification code.');
        const result = await this.locked(email, async tx => {
            const record = await tx.otpVerification.findUnique({ where: { email } });
            const error = (code: string, message: string) => ({ error: { code, message } });
            if (!record || record.verified_at || !record.otp_hash || !record.user_id) {
                return error('OTP_INVALID', 'No active verification code. Please request a new code.');
            }
            if (record.attempt_count >= MAX_ATTEMPTS) return error('OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Please request a new code.');
            if (record.invalidated_at) return error('OTP_INVALID', 'No active verification code. Please request a new code.');
            if (record.expires_at.getTime() <= Date.now()) {
                await tx.otpVerification.update({ where: { id: record.id }, data: { invalidated_at: new Date() } });
                return error('OTP_EXPIRED', 'Verification code has expired. Please request a new code.');
            }
            if (!await bcrypt.compare(otp, record.otp_hash)) {
                const attempts = record.attempt_count + 1;
                await tx.otpVerification.update({ where: { id: record.id }, data: {
                    attempt_count: attempts, ...(attempts >= MAX_ATTEMPTS ? { invalidated_at: new Date() } : {}),
                } });
                return attempts >= MAX_ATTEMPTS
                    ? error('OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Please request a new code.')
                    : error('OTP_INCORRECT', 'Incorrect verification code.');
            }
            const user = await tx.user.findUnique({ where: { id: record.user_id } });
            if (!user || !['EMAIL_VERIFICATION', 'EMAIL_CHANGE'].includes(record.purpose)
                || (record.purpose === 'EMAIL_VERIFICATION' && (user.email.toLowerCase() !== email || user.email_verified))) {
                return error('OTP_INVALID', 'No active verification code. Please request a new code.');
            }
            if (record.purpose === 'EMAIL_CHANGE') {
                const occupied = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } } });
                if (occupied) return error('OTP_INVALID', 'Unable to verify this email address.');
            }
            const verified = await tx.user.update({ where: { id: user.id }, data: { email, email_verified: true } });
            await tx.otpVerification.update({ where: { id: record.id }, data: { verified_at: new Date(), invalidated_at: new Date(), otp_hash: null } });
            return { user: verified };
        });
        // Throw after commit so failed-attempt counts and invalidation persist.
        if ('error' in result) {
            this.logger.warn('OTP verification failed.');
            throw new BadRequestException(result.error);
        }
        this.logger.log('OTP verification successful.');
        return result.user;
    }
}

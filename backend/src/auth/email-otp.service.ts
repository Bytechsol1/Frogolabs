import { BadRequestException, ConflictException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, registrationSchema } from './auth.dto';
import { z } from 'zod';
import { requireEmail } from '../common/email-validation';

const EXPIRY_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const ORPHAN_REGISTRATION = 'ORPHAN_REGISTRATION';
const recoverySchema = registrationSchema.omit({ email: true, password: true }).extend({
    password_hash: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/),
}).strict();
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
        }, { timeout: 30000 });
    }

    private async reserve(tx: Prisma.TransactionClient, email: string, user: { id: string; name: string }, purpose = 'EMAIL_VERIFICATION', pendingData?: Prisma.InputJsonValue): Promise<Delivery> {
        const [owner] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${user.id} FOR KEY SHARE`;
        if (!owner) throw new BadRequestException('This account is no longer available. Please register again.');
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
            pending_data: pendingData ?? Prisma.JsonNull,
        };
        // One row per email: replacing the hash immediately invalidates the old code.
        await tx.otpVerification.upsert({ where: { email }, create: { email, ...data }, update: data });
        return { email, otp, hash, name: user.name };
    }

    private async deliver(delivery: Delivery | null, rollbackOnFailure = false) {
        if (!delivery) return sentResponse(); // Same response for unknown/already verified accounts.
        try {
            await this.mail.sendOtp(delivery.email, delivery.otp, delivery.name);
        } catch {
            // Never invalidate a newer code if a previous SMTP request finishes late.
            if (!rollbackOnFailure) {
                await this.prisma.otpVerification.updateMany({
                    where: { email: delivery.email, otp_hash: delivery.hash, verified_at: null },
                    data: { invalidated_at: new Date() },
                });
            }
            // Registration calls this inside its transaction: the account, clinic
            // and challenge are rolled back together if delivery is rejected.
            throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: rollbackOnFailure
                ? 'Registration was not saved because the verification email could not be sent. Please try again.'
                : 'Unable to send verification email. Please try again.', retry_after: 60 });
        }
        return sentResponse();
    }

    async register(data: RegisterDto) {
        data = { ...data, email: requireEmail(data.email) };
        return this.locked(data.email, async tx => {
            const matches = await tx.user.findMany({ where: { email: { equals: data.email, mode: 'insensitive' } } });
            if (matches.length > 1) throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please use another email or sign in.' });
            const existing = matches[0];
            if (existing?.role === 'CLINIC_USER' && existing.clinic_id === null) {
                const reservedClinic = await tx.clinic.count({ where: { email: { equals: data.email, mode: 'insensitive' } } });
                if (reservedClinic) throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please use another email or sign in.' });
                // Manual Clinic deletion sets User.clinic_id to NULL. Preserve that
                // account until the mailbox owner proves ownership with a fresh OTP.
                const recovery = recoverySchema.parse({ clinicName: data.clinicName, contactName: data.contactName, phone: data.phone, password_hash: await bcrypt.hash(data.password, 12) });
                return this.deliver(await this.reserve(tx, data.email, { id: existing.id, name: data.contactName }, ORPHAN_REGISTRATION, recovery), true);
            }
            if (existing) {
                if (!existing.email_verified) {
                    throw new ConflictException({ code: 'EMAIL_NOT_VERIFIED', message: 'This account is awaiting email verification. Request a new code to continue.' });
                }
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
            return this.deliver(await this.reserve(tx, data.email, user), true);
        });
    }

    async resend(email: string) {
        email = requireEmail(email);
        const delivery = await this.locked(email, async tx => {
            const user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
            const pending = await tx.otpVerification.findUnique({ where: { email } });
            if (user?.role === 'CLINIC_USER' && user.clinic_id === null && pending?.purpose === ORPHAN_REGISTRATION && pending.user_id === user.id && !pending.verified_at) {
                const recovery = recoverySchema.safeParse(pending.pending_data);
                if (!recovery.success) throw new BadRequestException('Please return to signup and enter your clinic details again.');
                return this.reserve(tx, email, { id: user.id, name: recovery.data.contactName }, ORPHAN_REGISTRATION, recovery.data);
            }
            if (user && !user.email_verified) return this.reserve(tx, email, user);
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
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${record.user_id} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: record.user_id } });
            if (record.purpose === ORPHAN_REGISTRATION) {
                const recovery = recoverySchema.safeParse(record.pending_data);
                const occupiedClinic = await tx.clinic.count({ where: { email: { equals: email, mode: 'insensitive' } } });
                const otherAccount = await tx.user.count({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: record.user_id } } });
                if (!recovery.success || !user || user.role !== 'CLINIC_USER' || user.clinic_id !== null || user.email.toLowerCase() !== email || occupiedClinic || otherAccount) {
                    await tx.otpVerification.update({ where: { id: record.id }, data: { invalidated_at: new Date(), pending_data: Prisma.JsonNull } });
                    return error('OTP_INVALID', 'Registration details have changed. Please return to signup.');
                }
                // A fresh user ID prevents old JWTs from gaining access to the new clinic.
                // All replacement writes commit only after valid mailbox proof.
                await tx.user.delete({ where: { id: user.id, clinic_id: null, role: 'CLINIC_USER' } });
                const clinic = await tx.clinic.create({ data: { name: recovery.data.clinicName, contact_name: recovery.data.contactName, email, phone: recovery.data.phone, status: 'Active' } });
                const fresh = await tx.user.create({ data: { email, name: recovery.data.contactName, password_hash: recovery.data.password_hash, email_verified: true, role: 'CLINIC_USER', clinic_id: clinic.id, is_clinic_admin: true }, include: { clinic: { select: { name: true, status: true } } } });
                await tx.otpVerification.deleteMany({ where: { user_id: user.id, id: { not: record.id } } });
                await tx.otpVerification.update({ where: { id: record.id }, data: { user_id: fresh.id, verified_at: new Date(), invalidated_at: new Date(), otp_hash: null, pending_data: Prisma.JsonNull } });
                return { user: fresh };
            }
            if (!user || !['EMAIL_VERIFICATION', 'EMAIL_CHANGE'].includes(record.purpose)
                || (record.purpose === 'EMAIL_VERIFICATION' && (user.email.toLowerCase() !== email || user.email_verified))) {
                return error('OTP_INVALID', 'No active verification code. Please request a new code.');
            }
            if (record.purpose === 'EMAIL_CHANGE') {
                const occupied = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } } });
                if (occupied) return error('OTP_INVALID', 'Unable to verify this email address.');
            }
            const verified = await tx.user.update({ where: { id: user.id }, data: { email, email_verified: true }, include: { clinic: { select: { name: true, status: true } } } });
            await tx.otpVerification.update({ where: { id: record.id }, data: { verified_at: new Date(), invalidated_at: new Date(), otp_hash: null, pending_data: Prisma.JsonNull } });
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

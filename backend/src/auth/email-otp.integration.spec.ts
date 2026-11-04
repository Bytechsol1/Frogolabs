import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailOtpService } from './email-otp.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

// Explicit opt-in to a disposable local database only; never use live application data.
const testDatabaseUrl = process.env.EMAIL_TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
integration('Persistent email verification', () => {
    if (testDatabaseUrl) {
        const target = new URL(testDatabaseUrl);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/^\/frigo_otp_test_[a-f0-9]+$/.test(target.pathname)) {
            throw new Error('Email tests require a fresh disposable local database.');
        }
    }
    const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    const emails: string[] = [];
    const codes = new Map<string, string>();
    const deliver = async (email: string, code: string) => { codes.set(email, code); };
    const mail = { sendOtp: jest.fn(deliver) };
    const service = new EmailOtpService(prisma as any, mail as any);
    const fixture = (domain = 'gmail.com') => {
        const email = `otp-${randomUUID()}+clinic@${domain}`;
        emails.push(email);
        return { email, clinicName: 'OTP Test Fixture', contactName: 'OTP Test', phone: '+12025550123', password: 'fixture-password' };
    };
    const cooldown = (email: string) => prisma.otpVerification.update({ where: { email }, data: { last_sent_at: new Date(Date.now() - 61000) } });
    beforeEach(() => { mail.sendOtp.mockReset().mockImplementation(deliver); });
    afterAll(async () => {
        try {
            await prisma.otpVerification.deleteMany({ where: { email: { in: emails } } });
            await prisma.user.deleteMany({ where: { email: { in: emails } } });
            await prisma.clinic.deleteMany({ where: { email: { in: emails } } });
        } finally { await prisma.$disconnect(); }
    });

    it.each(['gmail.com', 'yahoo.com', 'outlook.com', 'clinic.com'])('registers, stores, resends, verifies and logs in an account at %s', async domain => {
        const data = fixture(domain);
        const auth = new AuthService(new UsersService(prisma as any), new JwtService({ secret: 'fixture-only-secret' }), prisma as any, service);
        await auth.initiateRegistration(data);
        expect(mail.sendOtp).toHaveBeenCalledWith(data.email, expect.any(String), data.contactName);
        const stored = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
        expect(stored.email).toBe(data.email);
        expect((await prisma.clinic.findUniqueOrThrow({ where: { id: stored.clinic_id! } })).email).toBe(data.email);
        await expect(auth.validateUser(data.email, data.password)).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
        await cooldown(data.email);
        await auth.resendOtp(data.email);
        expect((await auth.verifyOtp(data.email, codes.get(data.email)!)).access_token).toEqual(expect.any(String));
        const user = await auth.validateUser(data.email.toUpperCase(), data.password);
        expect(user.email).toBe(data.email);
        expect((await auth.login(user)).access_token).toEqual(expect.any(String));
        await expect(auth.initiateRegistration(data)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_ALREADY_REGISTERED' } });
    });
    it('creates an active clinic with an unverified account, stores only a hash, then verifies once', async () => {
        const data = fixture();
        const result = await service.register(data);
        expect(result).not.toHaveProperty('otp');
        const user = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
        expect(user.email_verified).toBe(false);
        expect((await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinic_id! } })).status).toBe('Active');
        const record = await prisma.otpVerification.findUniqueOrThrow({ where: { email: data.email } });
        expect(record.otp_hash).not.toBe(codes.get(data.email));
        expect(await bcrypt.compare(codes.get(data.email)!, record.otp_hash!)).toBe(true);
        expect(record.expires_at.getTime() - record.last_sent_at!.getTime()).toBe(600000);
        const [legacy] = await prisma.$queryRaw<{ otp: string | null }[]>`SELECT otp FROM "OtpVerification" WHERE email = ${data.email}`;
        expect(legacy.otp).toBeNull();
        expect((await service.verify(data.email, codes.get(data.email)!)).email_verified).toBe(true);
        expect((await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinic_id! } })).status).toBe('Active');
        await expect(service.verify(data.email, codes.get(data.email)!)).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
    });
    it('returns an authorized profile with the verification JWT and still enforces later account revocation', async () => {
        const data = fixture();
        const jwt = new JwtService({ secret: 'fixture-only-session-secret' });
        const auth = new AuthService(new UsersService(prisma as any), jwt, prisma as any, service);
        await auth.initiateRegistration(data);
        const session = await auth.verifyOtp(data.email, codes.get(data.email)!);
        expect(session.user).toMatchObject({ email: data.email, email_verified: true, clinic_name: data.clinicName, is_clinic_admin: true });
        expect(session.user).not.toHaveProperty('password_hash');
        expect(session.user).not.toHaveProperty('otp_hash');
        const claims = jwt.verify(session.access_token);
        expect(claims).toMatchObject({ sub: session.user.id, clinic_id: session.user.clinic_id, role: session.user.role });
        expect(await JwtStrategy.prototype.validate.call({ prisma } as any, claims)).toEqual(session.user);
        await prisma.clinic.update({ where: { id: session.user.clinic_id! }, data: { status: 'Inactive' } });
        await expect(JwtStrategy.prototype.validate.call({ prisma } as any, claims)).rejects.toMatchObject({ status: 401 });
        expect(mail.sendOtp).toHaveBeenCalledTimes(1);
    });
    it('does not re-enable an admin-disabled clinic when email is verified', async () => {
        const data = fixture();
        await service.register(data);
        const user = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
        await prisma.clinic.update({ where: { id: user.clinic_id! }, data: { status: 'Inactive' } });
        await service.verify(data.email, codes.get(data.email)!);
        expect((await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinic_id! } })).status).toBe('Inactive');
    });
    it('persists five concurrent wrong attempts and invalidates the code', async () => {
        const data = fixture();
        await service.register(data);
        const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => service.verify(data.email, '000000')));
        expect(attempts.every(result => result.status === 'rejected')).toBe(true);
        const record = await prisma.otpVerification.findUniqueOrThrow({ where: { email: data.email } });
        expect(record.attempt_count).toBe(5);
        expect(record.invalidated_at).not.toBeNull();
        await expect(service.verify(data.email, codes.get(data.email)!)).rejects.toMatchObject({ response: { code: 'OTP_ATTEMPTS_EXCEEDED' } });
    });
    it('rejects an expired code', async () => {
        const data = fixture();
        await service.register(data);
        await prisma.otpVerification.update({ where: { email: data.email }, data: { expires_at: new Date(Date.now() - 1000) } });
        await expect(service.verify(data.email, codes.get(data.email)!)).rejects.toMatchObject({ response: { code: 'OTP_EXPIRED' } });
    });
    it('enforces the resend cooldown and replaces the previous code', async () => {
        const data = fixture();
        await service.register(data);
        const oldCode = codes.get(data.email)!;
        await expect(service.resend(data.email)).rejects.toMatchObject({ status: 429 });
        expect(mail.sendOtp).toHaveBeenCalledTimes(1);
        await cooldown(data.email);
        await service.resend(data.email);
        expect(codes.get(data.email)).not.toBe(oldCode);
        await expect(service.verify(data.email, oldCode)).rejects.toMatchObject({ response: { code: 'OTP_INCORRECT' } });
        expect((await service.verify(data.email, codes.get(data.email)!)).email_verified).toBe(true);
    });
    it('survives service restart and permits only one concurrent redemption', async () => {
        const data = fixture();
        await service.register(data);
        const restarted = new EmailOtpService(prisma as any, mail as any);
        const results = await Promise.allSettled([service.verify(data.email, codes.get(data.email)!), restarted.verify(data.email, codes.get(data.email)!)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    });
    it('keeps verification through restart and later password logins without sending a second code', async () => {
        const data = fixture();
        await service.register(data);
        const auth = new AuthService(new UsersService(prisma as any), new JwtService({ secret: 'fixture-only-secret' }), prisma as any, service);
        await auth.verifyOtp(data.email, codes.get(data.email)!);
        const restarted = new AuthService(new UsersService(prisma as any), new JwtService({ secret: 'fixture-only-secret' }), prisma as any, new EmailOtpService(prisma as any, mail as any));
        expect((await prisma.user.findUniqueOrThrow({ where: { email: data.email } })).email_verified).toBe(true);
        const profile = await restarted.validateUser(data.email, data.password);
        expect((await restarted.login(profile)).access_token).toEqual(expect.any(String));
        await restarted.resendOtp(data.email);
        expect(mail.sendOtp).toHaveBeenCalledTimes(1);
        await expect(restarted.verifyOtp(data.email, codes.get(data.email)!)).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
        expect((await restarted.login(await restarted.validateUser(data.email, data.password))).access_token).toEqual(expect.any(String));
    });
    it('rolls back the new clinic, account and challenge on delivery failure and permits signup retry', async () => {
        const data = fixture();
        mail.sendOtp.mockImplementationOnce(async (email, code) => { await deliver(email, code); throw new Error('private SMTP detail'); });
        await expect(service.register(data)).rejects.toMatchObject({ status: 503, response: { code: 'EMAIL_DELIVERY_FAILED' } });
        expect(await prisma.user.count({ where: { email: data.email } })).toBe(0);
        expect(await prisma.clinic.count({ where: { email: data.email } })).toBe(0);
        expect(await prisma.otpVerification.count({ where: { email: data.email } })).toBe(0);
        await expect(service.verify(data.email, codes.get(data.email)!)).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
        await service.register(data);
        expect((await service.verify(data.email, codes.get(data.email)!)).email_verified).toBe(true);
    });
    it('keeps resend responses generic but rejects registered signup emails', async () => {
        const data = fixture();
        await service.register(data);
        await service.verify(data.email, codes.get(data.email)!);
        mail.sendOtp.mockClear();
        expect(await service.resend(data.email)).toEqual(await service.resend(fixture().email));
        await expect(service.register({ ...data, email: data.email.toUpperCase() })).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_ALREADY_REGISTERED' } });
        expect(mail.sendOtp).not.toHaveBeenCalled();
    });
    it('routes an unverified duplicate to email recovery without changing its password or creating another clinic', async () => {
        const data = fixture();
        await service.register(data);
        const previousUser = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
        const previousOtp = await prisma.otpVerification.findUniqueOrThrow({ where: { email: data.email } });
        mail.sendOtp.mockClear();
        await expect(service.register({ ...data, clinicName: 'Replacement', password: 'replacement-pass' })).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_NOT_VERIFIED' } });
        expect(await prisma.user.findUniqueOrThrow({ where: { email: data.email } })).toEqual(previousUser);
        expect(await prisma.otpVerification.findUniqueOrThrow({ where: { email: data.email } })).toEqual(previousOtp);
        expect(await prisma.clinic.count({ where: { email: data.email } })).toBe(1);
        expect(mail.sendOtp).not.toHaveBeenCalled();
        await cooldown(data.email);
        await service.resend(data.email);
        expect((await service.verify(data.email, codes.get(data.email)!)).email_verified).toBe(true);
        expect((await prisma.user.findUniqueOrThrow({ where: { email: data.email } })).password_hash).toBe(previousUser.password_hash);
    });
    it('keeps a failed verification-email resend recoverable without granting login or changing the existing account', async () => {
        const data = fixture();
        await service.register(data);
        const user = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
        await cooldown(data.email);
        mail.sendOtp.mockRejectedValueOnce(new Error('Synthetic provider outage'));
        await expect(service.resend(data.email)).rejects.toMatchObject({ status: 503, response: { code: 'EMAIL_DELIVERY_FAILED' } });
        expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email_verified).toBe(false);
        await cooldown(data.email);
        await service.resend(data.email);
        expect((await service.verify(data.email, codes.get(data.email)!)).email_verified).toBe(true);
    });
    it('rejects an email registered to a clinic even without a user account', async () => {
        const data = fixture();
        await prisma.clinic.create({ data: { name: data.clinicName, contact_name: data.contactName, email: data.email } });
        await expect(service.register(data)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_ALREADY_REGISTERED' } });
        expect(await prisma.user.count({ where: { email: data.email } })).toBe(0);
        expect(mail.sendOtp).not.toHaveBeenCalled();
    });
    it('requires verification before changing a verified profile email', async () => {
        const data = fixture();
        await service.register(data);
        const user = await service.verify(data.email, codes.get(data.email)!);
        const nextEmail = fixture().email;
        await service.changeEmail(user.id, nextEmail);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(data.email);
        expect((await service.verify(nextEmail, codes.get(nextEmail)!)).email).toBe(nextEmail);
    });
    it('persists rate limits across guard instances, including unknown accounts', async () => {
        const email = fixture().email;
        const ip = `fixture-${randomUUID()}`;
        const setHeader = jest.fn();
        const ctx = { switchToHttp: () => ({ getRequest: () => ({ route: { path: '/auth/register/resend' }, ip, body: { email } }), getResponse: () => ({ setHeader }) }) };
        const keys = [`send:ip:${ip}`, `send:email:${email}`, `send:cooldown:${email}`].map(key => createHash('sha256').update(key).digest('hex'));
        try {
            expect(await new AuthRateLimitGuard(prisma as any).canActivate(ctx as any)).toBe(true);
            await expect(new AuthRateLimitGuard(prisma as any).canActivate(ctx as any)).rejects.toMatchObject({ status: 429 });
            expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        } finally { await prisma.authRateLimit.deleteMany({ where: { key: { in: keys } } }); }
    });
});

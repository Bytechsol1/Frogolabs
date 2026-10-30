import { randomBytes } from 'node:crypto';
﻿import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthDtoPipe, registrationSchema, verifyOtpSchema } from './auth.dto';
import { JwtStrategy } from './strategies/jwt.strategy';

describe('Email verification authentication', () => {
    const originalSecret = process.env.JWT_SECRET;
    beforeAll(() => { process.env.JWT_SECRET = randomBytes(32).toString('hex'); });
    afterAll(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
    const users = { findOne: jest.fn() };
    const jwt = { sign: jest.fn().mockReturnValue('fixture-token') };
    const otp = { register: jest.fn() };
    const service = new AuthService(users as any, jwt as any, {} as any, otp as any);
    const registration = { clinicName: ' Clinic ', contactName: ' Contact ', email: ' CLINIC@GMAIL.COM ', phone: '+12025550123', password: 'fixture-password' };
    beforeEach(() => jest.clearAllMocks());

    it('normalizes registration without exposing a code', async () => {
        otp.register.mockResolvedValue({ message: 'Generic success' });
        expect(await service.initiateRegistration(registration)).not.toHaveProperty('otp');
        expect(otp.register).toHaveBeenCalledWith({ ...registration, clinicName: 'Clinic', contactName: 'Contact', email: 'clinic@gmail.com' });
    });
    it.each(['12345', '1234567', '123a56', 123456, null])('rejects invalid OTP input %#', otp => {
        expect(() => new AuthDtoPipe(verifyOtpSchema).transform({ email: 'clinic@gmail.com', otp })).toThrow(BadRequestException);
    });
    it('rejects invalid emails and injected verification flags', () => {
        const pipe = new AuthDtoPipe(registrationSchema);
        expect(() => pipe.transform({ ...registration, email: ['clinic@gmail.com'] })).toThrow(BadRequestException);
        expect(() => pipe.transform({ ...registration, email_verified: true })).toThrow(BadRequestException);
    });
    it.each(['', '   ', 'clinic', 'clinic@', '@gmail.com', 'clinic@example', 'clinic@example.', 'clinic@@gmail.com', 'cli nic@gmail.com', '.clinic@gmail.com', 'cli..nic@gmail.com', 'clinic@example.c'])('rejects incomplete email %j before requesting an OTP', async email => {
        await expect(service.initiateRegistration({ ...registration, email })).rejects.toThrow(BadRequestException);
        expect(otp.register).not.toHaveBeenCalled();
    });
    it.each(['clinicName', 'contactName'])('rejects a blank %s before requesting an OTP', async field => {
        await expect(service.initiateRegistration({ ...registration, [field]: '   ' })).rejects.toThrow(BadRequestException);
        expect(otp.register).not.toHaveBeenCalled();
    });
    it.each(['gmail.com', 'GMAIL.COM', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'clinic.com', 'hospital.org', 'myclinic.co.uk', 'example.com'])('allows valid signup domain %s', async domain => {
        otp.register.mockResolvedValue({ message: 'Generic success' });
        await service.initiateRegistration({ ...registration, email: `clinic+team@${domain}` });
        expect(otp.register).toHaveBeenCalledWith(expect.objectContaining({ email: `clinic+team@${domain.toLowerCase()}` }));
    });
    it.each(['gmailcom', '.com', 'clinic..com', '-clinic.com'])('rejects malformed domain %s before OTP delivery', async domain => {
        await expect(service.initiateRegistration({ ...registration, email: `clinic@${domain}` })).rejects.toThrow(BadRequestException);
        expect(otp.register).not.toHaveBeenCalled();
    });
    it.each(['test', 'test@', '@gmail.com', 'test@example', 'test..test@gmail.com', 'inside space@gmail.com', 'user@gmail.com\r\nBcc: other@gmail.com'])('rejects malformed login email %j before user lookup', async email => {
        await expect(service.validateUser(email, 'fixture-password')).rejects.toThrow(BadRequestException);
        expect(users.findOne).not.toHaveBeenCalled();
    });
    it.each(['', '   ', '1122334455', '03001234567', '+92', '+92300123', '+923001234567', '+442079460958', '+61293744000', '+12025550123456', '+10000000000', '+999123456789', 'call +12025550123', '+1202abc0123', '+12025550123 ext 5', null, undefined, 123456])('rejects invalid signup phone %j before requesting an OTP', async phone => {
        await expect(service.initiateRegistration({ ...registration, phone } as any)).rejects.toThrow('valid phone number');
        expect(otp.register).not.toHaveBeenCalled();
    });
    it.each([
        ['+1 202 555 0123', '+12025550123'],
        ['001 202 555 0123', '+12025550123'],
        ['+1 (202) 555-0123', '+12025550123'],
        ['+1 416 555 0123', '+14165550123'],
    ])('normalizes valid international phone %s', async (phone, normalized) => {
        otp.register.mockResolvedValue({ message: 'Generic success' });
        await service.initiateRegistration({ ...registration, phone });
        expect(otp.register).toHaveBeenCalledWith(expect.objectContaining({ phone: normalized }));
    });
    it('requires the correct password before disclosing the unverified state', async () => {
        users.findOne.mockResolvedValue({ email_verified: false, password_hash: await bcrypt.hash('fixture-password', 4) });
        expect(await service.validateUser('CLINIC@GMAIL.COM', 'wrong')).toBeNull();
        await expect(service.validateUser('CLINIC@GMAIL.COM', 'fixture-password')).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
        expect(jwt.sign).not.toHaveBeenCalled();
    });
    it('never issues JWTs directly to unverified accounts', async () => {
        await expect(service.login({ email_verified: false })).rejects.toThrow(ForbiddenException);
    });
    it('accepts the existing admin mailbox but still checks password and verification', async () => {
        users.findOne.mockResolvedValue({ id: 'admin-fixture', email: 'admin@frigolabs.com', role: 'ADMIN', email_verified: true, password_hash: await bcrypt.hash('fixture-password', 4) });
        expect(await service.validateUser(' ADMIN@FRIGOLABS.COM ', 'wrong')).toBeNull();
        const user = await service.validateUser(' ADMIN@FRIGOLABS.COM ', 'fixture-password');
        expect(users.findOne).toHaveBeenLastCalledWith('admin@frigolabs.com');
        expect(user.role).toBe('ADMIN');
        expect(user).not.toHaveProperty('password_hash');
        users.findOne.mockResolvedValue({ ...user, email_verified: false, password_hash: await bcrypt.hash('fixture-password', 4) });
        await expect(service.validateUser('admin@frigolabs.com', 'fixture-password')).rejects.toThrow(ForbiddenException);
    });
    it('retains normal login for verified users without leaking password hashes', async () => {
        users.findOne.mockResolvedValue({ id: 'fixture', email: 'clinic@gmail.com', role: 'CLINIC_USER', email_verified: true, password_hash: await bcrypt.hash('fixture-password', 4) });
        const user = await service.validateUser(' clinic@gmail.com ', 'fixture-password');
        expect(user).not.toHaveProperty('password_hash');
        expect((await service.login(user)).access_token).toBe('fixture-token');
    });
    it('checks verification in the database even when a JWT claims admin access', async () => {
        const strategy = new JwtStrategy({ user: { findUnique: jest.fn().mockResolvedValue({ email_verified: false }) } } as any);
        await expect(strategy.validate({ sub: 'fixture', role: 'ADMIN' })).rejects.toThrow(ForbiddenException);
    });
});

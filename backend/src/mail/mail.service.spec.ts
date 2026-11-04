import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('Clinic verification email delivery', () => {
    const sendMail = jest.fn();
    const originalEnv = { ...process.env };
    let service: MailService;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.MAIL_BRIDGE_URL;
        delete process.env.MAIL_BRIDGE_SECRET;
        process.env.SMTP_HOST = 'smtp.gmail.com';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_SECURE = 'false';
        process.env.SMTP_FROM_NAME = 'Frigo Flow';
        process.env.SMTP_FROM_EMAIL = 'sender@example.com';
        process.env.SMTP_USER = 'sender@example.com';
        process.env.SMTP_PASS = 'fixture-password';
        (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
        service = new MailService();
    });

    afterEach(() => { process.env = { ...originalEnv }; });

    it.each(['doctor@gmail.com', 'doctor@yahoo.com', 'doctor@outlook.com', 'doctor@hotmail.com', 'doctor@icloud.com', 'doctor@proton.me', 'doctor@clinic.com', 'doctor@hospital.org', 'doctor@myclinic.co.uk', 'doctor+test@example.com'])('sends the OTP to %s independently of the sender mailbox', async email => {
        sendMail.mockResolvedValue({ accepted: [email] });
        await service.sendOtp(email, '123456', 'Clinic Contact');
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: { name: 'Frigo Flow', address: 'sender@example.com' },
            subject: 'Your Frigo Flow Verification Code',
            text: expect.stringContaining('123456'),
            to: email,
            html: expect.stringContaining('123456'),
        }));
    });

    it('fails instead of claiming success when SMTP is missing', async () => {
        delete process.env.SMTP_PASS;
        service = new MailService();
        await expect(service.sendOtp('clinic@example.com', '123456', 'Contact'))
            .rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('propagates a safe failure when SMTP authentication or delivery fails', async () => {
        sendMail.mockRejectedValue(new Error('SMTP authentication failed: private provider detail'));
        await expect(service.sendOtp('clinic@example.com', '123456', 'Contact'))
            .rejects.toThrow('Unable to send verification email.');
    });

    it('does not claim success when the recipient was rejected', async () => {
        sendMail.mockResolvedValue({ accepted: [], rejected: ['clinic@example.com'] });
        await expect(service.sendOtp('clinic@example.com', '123456', 'Contact'))
            .rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rejects malformed recipients before contacting the mail transport', async () => {
        await expect(service.sendOtp('user@example.com\r\nBcc: other@example.com', '123456', 'Contact'))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('normalizes recipients while preserving plus tags and dots', async () => {
        sendMail.mockResolvedValue({ accepted: ['john.doe+test@example.co.uk'] });
        await service.sendOtp(' John.Doe+Test@Example.CO.UK ', '123456', 'Contact');
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'john.doe+test@example.co.uk' }));
    });
});

describe('HTTPS verification email delivery', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const request = jest.fn();
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MAIL_BRIDGE_URL = 'https://mail.fixture.test/api/internal/mail';
        process.env.MAIL_BRIDGE_SECRET = 'fixture-only-private-key-of-at-least-32-characters';
        for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME', 'SMTP_SECURE']) delete process.env[key];
        global.fetch = request;
    });
    afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });
    it('sends through HTTPS without requiring SMTP credentials and waits for provider acceptance', async () => {
        request.mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
        const service = new MailService();
        await service.sendOtp('clinic@example.com', '123456', 'Contact');
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        const [url, options] = request.mock.calls[0];
        expect(url).toBe('https://mail.fixture.test/api/internal/mail');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe(`Bearer ${process.env.MAIL_BRIDGE_SECRET}`);
        expect(options.redirect).toBe('error');
        expect(JSON.parse(options.body)).toMatchObject({ to: 'clinic@example.com', text: expect.stringContaining('123456') });
        expect(JSON.parse(options.body)).not.toHaveProperty('from');
        expect(options.signal).toBeDefined();
    });
    it.each([
        { ok: false, body: { message: 'Synthetic provider rejection' } },
        { ok: true, body: { accepted: false } },
        { ok: true, body: { accepted: 'true' } },
    ])('rejects an unsuccessful or unacknowledged API response', async ({ ok, body }) => {
        request.mockResolvedValue({ ok, json: async () => body });
        await expect(new MailService().sendOtp('clinic@example.com', '123456', 'Contact')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('does not expose provider response details when the HTTP request fails', async () => {
        request.mockRejectedValue(new Error('Synthetic private provider detail'));
        await expect(new MailService().sendOtp('clinic@example.com', '123456', 'Contact')).rejects.toThrow('Unable to send verification email.');
    });
    it('sends lab-result notifications through the configured HTTPS provider as well', async () => {
        request.mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
        await new MailService().sendLabResultAccess('clinic@example.com', 'Synthetic', 'SYNTHETIC', '123456', new Date());
        expect(request).toHaveBeenCalledTimes(1);
        expect(JSON.parse(request.mock.calls[0][1].body).subject).toBe('Your Lab Results Are Ready');
    });
});

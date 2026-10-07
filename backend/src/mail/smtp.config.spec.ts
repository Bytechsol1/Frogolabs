import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { readSmtpConfig } from './smtp.config';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const config = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'sender@example.com', SMTP_PASS: 'fixture-password', SMTP_FROM_NAME: 'Frigo Flow', SMTP_FROM_EMAIL: 'sender@example.com' };

describe('SMTP configuration', () => {
    it('uses authenticated STARTTLS with debug logging disabled', () => {
        const result = readSmtpConfig(config);
        expect(result.ready).toBe(true);
        if (result.ready) expect(result.options).toMatchObject({ host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true, debug: false, logger: false });
    });
    it('reports invalid variable names without exposing values', () => {
        expect(readSmtpConfig({ ...config, SMTP_PASS: '', SMTP_PORT: 'invalid' })).toEqual({ ready: false, issues: ['SMTP_PASS', 'SMTP_PORT'] });
    });
    it('does not prevent application startup when Gmail is unavailable', async () => {
        const original = { ...process.env };
        try {
            Object.assign(process.env, config);
            (nodemailer.createTransport as jest.Mock).mockReturnValue({ verify: jest.fn().mockRejectedValue(new Error('private provider detail')) });
            await expect(new MailService().onModuleInit()).resolves.toBeUndefined();
        } finally { process.env = original; }
    });
});

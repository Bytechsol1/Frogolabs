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

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter: nodemailer.Transporter;

    constructor() {
        const port = parseInt(process.env.SMTP_PORT || '465');
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.hostinger.com',
            port,
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async sendOtp(email: string, otp: string, contactName: string): Promise<void> {
        this.logger.log(`[OTP] ${email} → ${otp}`);

        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            this.logger.warn('SMTP credentials not configured — OTP was logged to console above.');
            return;
        }

        try {
            await this.transporter.sendMail({
                from: `"Frigo Labs" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Your Frigo Labs Verification Code',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px;">
                            <div style="background: #0f766e; width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-style: italic; font-size: 18px; text-align: center; line-height: 36px;">F</div>
                            <span style="font-size: 20px; font-weight: 800; color: #0f766e;">Frigo Labs</span>
                        </div>
                        <h2 style="color: #111; font-size: 22px; margin: 0 0 8px;">Verify your email address</h2>
                        <p style="color: #555; font-size: 15px; margin: 0 0 24px;">Hi ${contactName}, use the code below to complete your registration.</p>
                        <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                            <span style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #0f766e; font-family: monospace;">${otp}</span>
                        </div>
                        <p style="color: #888; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
                    </div>
                `,
            });
            this.logger.log(`[OTP] Email delivered to ${email}`);
        } catch (error) {
            this.logger.warn(`Email delivery failed: ${error.message} — OTP was logged to console above.`);
        }
    }
}

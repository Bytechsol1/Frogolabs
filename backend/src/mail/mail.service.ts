import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { readSmtpConfig } from './smtp.config';
import { requireMailboxEmail } from '../common/email-validation';

@Injectable()
export class MailService implements OnModuleInit {
    private readonly logger = new Logger(MailService.name);
    private transporter: nodemailer.Transporter | null = null;
    private readonly config = readSmtpConfig();

    constructor() {
        if (this.config.ready) this.transporter = nodemailer.createTransport(this.config.options);
        else this.logger.warn(`SMTP configuration needs attention: ${this.config.issues.join(', ')}. Authentication remains available.`);
    }

    async onModuleInit() {
        await this.verifyConnection();
    }

    async verifyConnection(): Promise<boolean> {
        if (!this.transporter) return false;
        try {
            await this.transporter.verify();
            this.logger.log('SMTP connection verified.');
            return true;
        } catch {
            this.logger.warn('SMTP connection could not be verified. Check configuration or try again later.');
            return false;
        }
    }

    async sendOtp(email: string, otp: string, _contactName: string): Promise<void> {
        email = requireMailboxEmail(email);
        if (!this.transporter || !this.config.ready) {
            throw new ServiceUnavailableException('Unable to send verification email. Please try again.');
        }

        try {
            const info = await this.transporter.sendMail({
                from: this.config.from,
                to: email,
                subject: 'Your Frigo Flow Verification Code',
                text: `Frigo Flow\n\nVerify your email\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you did not request this code, you can ignore this email.\n\nFrigo Flow`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px;">
                            <div style="background: #0f766e; width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-style: italic; font-size: 18px; text-align: center; line-height: 36px;">F</div>
                            <span style="font-size: 20px; font-weight: 800; color: #0f766e;">Frigo Flow</span>
                        </div>
                        <h2 style="color: #111; font-size: 22px; margin: 0 0 8px;">Verify your email address</h2>
                        <p style="color: #555; font-size: 15px; margin: 0 0 24px;">Use the code below to complete your email verification.</p>
                        <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                            <span style="font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #0f766e; font-family: monospace;">${otp}</span>
                        </div>
                        <p style="color: #888; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
                    </div>
                `,
            });
            if (!info.accepted?.includes(email)) {
                throw new Error('Recipient was not accepted by the email server.');
            }
            this.logger.log('Registration email accepted by the mail server.');
        } catch {
            this.logger.error('Registration email could not be sent. Check SMTP configuration and provider availability.');
            throw new ServiceUnavailableException('Unable to send verification email. Please try again.');
        }
    }

    async sendLabResultAccess(
        email: string,
        patientName: string,
        resultId: string,
        accessCode: string,
        expiresAt: Date,
    ): Promise<void> {
        email = requireMailboxEmail(email);
        this.logger.log('Lab result access email requested.');

        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            this.logger.warn('SMTP credentials not configured; email could not be sent.');
            return;
        }

        try {
            if (!this.transporter) throw new Error('SMTP unavailable');
            await this.transporter.sendMail({
                from: `"Frigo Labs" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Your Lab Results Are Ready',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px;">
                            <div style="background: #080e1e; width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #cbb28d; font-weight: bold; font-style: italic; font-size: 18px; text-align: center; line-height: 36px;">F</div>
                            <span style="font-size: 20px; font-weight: 800; color: #080e1e;">Frigo Labs</span>
                        </div>
                        <h2 style="color: #111; font-size: 22px; margin: 0 0 8px;">Your lab results are ready</h2>
                        <p style="color: #555; font-size: 15px; margin: 0 0 24px;">Hi ${patientName}, use the credentials below to securely view your results in the patient portal.</p>
                        <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                            <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8c7657; font-weight: 700;">Result ID</p>
                            <p style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #080e1e; font-family: monospace;">${resultId}</p>
                        </div>
                        <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                            <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8c7657; font-weight: 700;">Access Code</p>
                            <p style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 8px; color: #080e1e; font-family: monospace;">${accessCode}</p>
                        </div>
                        <p style="color: #888; font-size: 13px; margin: 0;">This access code expires on <strong>${expiresAt.toLocaleDateString()}</strong>. Keep it private — anyone with this code can view your results.</p>
                    </div>
                `,
            });
            this.logger.log('Lab result access email accepted by the mail server.');
        } catch (error) {
            this.logger.warn('Email delivery failed. Check SMTP configuration and provider availability.');
        }
    }
}

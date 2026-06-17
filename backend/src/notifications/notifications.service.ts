import { Injectable } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import { Twilio } from 'twilio';

@Injectable()
export class NotificationsService {
    private twilioClient: Twilio;

    constructor() {
        if (process.env.SENDGRID_API_KEY) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        }
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.twilioClient = new Twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
        }
    }

    async sendEmail(to: string, subject: string, text: string, html?: string) {
        if (!process.env.SENDGRID_API_KEY) {
            console.log('SendGrid API Key missing. Skipping email.');
            return;
        }
        const msg = {
            to,
            from: process.env.SENDGRID_FROM_EMAIL || 'notifications@frigolabs.com',
            subject,
            text,
            html: html || text,
        };
        return sgMail.send(msg);
    }

    async sendSMS(to: string, body: string) {
        if (!this.twilioClient) {
            console.log('Twilio credentials missing. Skipping SMS.');
            return;
        }
        return this.twilioClient.messages.create({
            body,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });
    }
}

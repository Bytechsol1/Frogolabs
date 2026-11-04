import type { TransportOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { mailboxEmailSchema } from '@frigo-flow/validation';

export function readSmtpConfig(env: NodeJS.ProcessEnv = process.env) {
    const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_NAME', 'SMTP_FROM_EMAIL'];
    const issues = required.filter(key => !env[key]?.trim());
    const port = Number(env.SMTP_PORT);
    if (env.SMTP_PORT && (!Number.isInteger(port) || port < 1 || port > 65535)) issues.push('SMTP_PORT');
    if (env.SMTP_SECURE !== 'true' && env.SMTP_SECURE !== 'false') issues.push('SMTP_SECURE');
    const fromEmail = mailboxEmailSchema.safeParse(env.SMTP_FROM_EMAIL);
    if (!fromEmail.success) issues.push('SMTP_FROM_EMAIL');
    if (env.SMTP_HOST && !/^[a-z\d.-]+$/i.test(env.SMTP_HOST)) issues.push('SMTP_HOST');
    if (issues.length) return { ready: false as const, issues: [...new Set(issues)] };
    const options: SMTPTransport.Options & TransportOptions = {
        host: env.SMTP_HOST!, port, secure: env.SMTP_SECURE === 'true',
        requireTLS: env.SMTP_SECURE !== 'true',
        auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
        logger: false, debug: false,
    };
    return { ready: true as const, options, from: { name: env.SMTP_FROM_NAME!, address: fromEmail.success ? fromEmail.data : '' } };
}

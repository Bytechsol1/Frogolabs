import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { mailboxEmailSchema } from '@frigo-flow/validation';

const MAX_BODY_BYTES = 64 * 1024;
const reply = (status: number, body: object) => Response.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

// Called only by the trusted backend. SMTP credentials and the shared key stay
// in server-only environment variables; browser requests are never authorized.
export function createSmtpDeliveryHandler(
    env: NodeJS.ProcessEnv = process.env,
    makeTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
) {
    return async function POST(request: Request): Promise<Response> {
        const secret = env.MAIL_BRIDGE_SECRET;
        if (!secret || secret.length < 32) return reply(503, { message: 'Email delivery is unavailable.' });
        const authorization = request.headers.get('authorization') || '';
        const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        if (!presented || presented.length > 512 || !timingSafeEqual(
            createHash('sha256').update(presented).digest(), createHash('sha256').update(secret).digest(),
        )) return reply(401, { message: 'Unauthorized.' });
        if (request.headers.get('origin')) return reply(403, { message: 'Forbidden.' });
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, { message: 'JSON required.' });
        if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return reply(413, { message: 'Message too large.' });
        let input: unknown;
        try {
            const reader = request.body?.getReader();
            if (!reader) return reply(400, { message: 'Invalid message.' });
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                size += part.value.byteLength;
                if (size > MAX_BODY_BYTES) { await reader.cancel(); return reply(413, { message: 'Message too large.' }); }
                chunks.push(part.value);
            }
            input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch { return reply(400, { message: 'Invalid message.' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, { message: 'Invalid message.' });
        const message = input as Record<string, unknown>;
        const recipient = mailboxEmailSchema.safeParse(message.to);
        if (!recipient.success || Object.keys(message).some(key => !['to', 'subject', 'text', 'html'].includes(key))
            || typeof message.subject !== 'string' || !message.subject.trim() || message.subject.length > 160 || /[\r\n]/.test(message.subject)
            || typeof message.html !== 'string' || !message.html || message.html.length > 40000
            || (message.text !== undefined && (typeof message.text !== 'string' || message.text.length > 16000))) {
            return reply(400, { message: 'Invalid message.' });
        }
        const sender = mailboxEmailSchema.safeParse(env.SMTP_FROM_EMAIL);
        const port = Number(env.SMTP_PORT);
        if (!sender.success || !env.SMTP_FROM_NAME?.trim() || !env.SMTP_HOST || !/^[a-z\d.-]+$/i.test(env.SMTP_HOST)
            || !env.SMTP_USER || !env.SMTP_PASS || !Number.isInteger(port) || port < 1 || port > 65535
            || !['true', 'false'].includes(env.SMTP_SECURE || '')) return reply(503, { message: 'Email delivery is unavailable.' });
        const transport = makeTransport({
            host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true', requireTLS: env.SMTP_SECURE !== 'true',
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
            connectionTimeout: 4000, greetingTimeout: 4000, socketTimeout: 8000,
            logger: false, debug: false,
        });
        try {
            const accepted = await transport.sendMail({
                from: { name: env.SMTP_FROM_NAME, address: sender.data }, to: recipient.data,
                subject: message.subject, html: message.html, text: message.text as string | undefined,
            });
            if (!accepted.accepted?.some(address => typeof address === 'string' && address.toLowerCase() === recipient.data.toLowerCase())) throw new Error('Recipient rejected');
            return reply(200, { accepted: true });
        } catch {
            // Provider errors may contain usernames or message content. Never return or log them.
            return reply(503, { message: 'Email delivery is unavailable.' });
        } finally { transport.close(); }
    };
}

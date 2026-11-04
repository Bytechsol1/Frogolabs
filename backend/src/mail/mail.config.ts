import { readSmtpConfig } from './smtp.config';

export function readMailConfig(env: NodeJS.ProcessEnv = process.env) {
    if (env.MAIL_BRIDGE_URL || env.MAIL_BRIDGE_SECRET) {
        const issues: string[] = [];
        let endpoint: URL | undefined;
        try {
            endpoint = new URL(env.MAIL_BRIDGE_URL || '');
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
            if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/api/internal/mail') issues.push('MAIL_BRIDGE_URL');
        } catch { issues.push('MAIL_BRIDGE_URL'); }
        if (!env.MAIL_BRIDGE_SECRET || env.MAIL_BRIDGE_SECRET.length < 32 || env.MAIL_BRIDGE_SECRET !== env.MAIL_BRIDGE_SECRET.trim()) issues.push('MAIL_BRIDGE_SECRET');
        if (issues.length) return { ready: false as const, provider: 'bridge' as const, issues };
        return { ready: true as const, provider: 'bridge' as const, url: endpoint!.toString(), secret: env.MAIL_BRIDGE_SECRET! };
    }
    return { ...readSmtpConfig(env), provider: 'smtp' as const };
}

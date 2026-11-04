import { readMailConfig } from './mail.config';

describe('Email delivery configuration', () => {
    const secret = 'fixture-only-key-with-at-least-32-characters';
    const url = 'https://mail.fixture.test/api/internal/mail';
    it('selects HTTPS without requiring SMTP credentials on the backend', () => {
        expect(readMailConfig({ MAIL_BRIDGE_URL: url, MAIL_BRIDGE_SECRET: secret })).toMatchObject({ ready: true, provider: 'bridge', url });
    });
    it.each(['http://mail.fixture.test/api/internal/mail', 'https://user:password@mail.fixture.test/api/internal/mail', `${url}?key=private`, `${url}#private`, 'https://mail.fixture.test/another-route'])('rejects unsafe or incorrect bridge endpoints', endpoint => {
        expect(readMailConfig({ MAIL_BRIDGE_URL: endpoint, MAIL_BRIDGE_SECRET: secret })).toMatchObject({ ready: false, provider: 'bridge', issues: ['MAIL_BRIDGE_URL'] });
    });
    it('allows loopback HTTP for isolated local testing', () => {
        expect(readMailConfig({ MAIL_BRIDGE_URL: 'http://127.0.0.1:3002/api/internal/mail', MAIL_BRIDGE_SECRET: secret })).toMatchObject({ ready: true, provider: 'bridge' });
    });
    it('does not silently fall back to SMTP when bridge configuration is incomplete', () => {
        expect(readMailConfig({ MAIL_BRIDGE_URL: url })).toEqual({ ready: false, provider: 'bridge', issues: ['MAIL_BRIDGE_SECRET'] });
        expect(readMailConfig({ MAIL_BRIDGE_SECRET: secret })).toEqual({ ready: false, provider: 'bridge', issues: ['MAIL_BRIDGE_URL'] });
    });
    it('preserves SMTP and reports variable names only when settings are missing', () => {
        const config = readMailConfig({});
        expect(config).toMatchObject({ ready: false, provider: 'smtp' });
        if (!config.ready) expect(config.issues).toContain('SMTP_PASS');
    });
});

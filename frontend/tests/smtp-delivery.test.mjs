import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/server/smtp-delivery.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const requireModule = loaded.require.bind(loaded);
// The Next.js server-only guard is enforced by Next's build, not this Node test runner.
loaded.require = name => name === 'server-only' ? {} : requireModule(name);
loaded._compile(compiled, filename);
const { createSmtpDeliveryHandler } = loaded.exports;
const secret = 'fixture-only-shared-key-with-at-least-32-characters';
const env = {
    MAIL_BRIDGE_SECRET: secret, SMTP_HOST: 'smtp.fixture.test', SMTP_PORT: '587', SMTP_SECURE: 'false',
    SMTP_USER: 'fixture-user', SMTP_PASS: 'fixture-password', SMTP_FROM_EMAIL: 'sender@example.com', SMTP_FROM_NAME: 'Frigo Flow',
};
const message = { to: 'clinic@example.com', subject: 'Synthetic verification', text: 'Synthetic only', html: '<p>Synthetic only</p>' };
const request = (body = message, headers = {}) => new Request('http://localhost/api/internal/mail', {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
});
function fixture(outcome = { accepted: ['clinic@example.com'] }, settings = env) {
    const sent = [];
    let created = 0;
    let closed = 0;
    const handler = createSmtpDeliveryHandler(settings, () => {
        created++;
        return { sendMail: async mail => { sent.push(mail); if (outcome instanceof Error) throw outcome; return outcome; }, close: () => { closed++; } };
    });
    return { handler, sent, created: () => created, closed: () => closed };
}
test('rejects unauthenticated and browser-originated requests before contacting SMTP', async () => {
    const f = fixture();
    assert.equal((await f.handler(request(message, { authorization: '' }))).status, 401);
    assert.equal((await f.handler(request(message, { authorization: 'Bearer incorrect' }))).status, 401);
    assert.equal((await f.handler(request(message, { origin: 'https://fixture.test' }))).status, 403);
    assert.equal(f.created(), 0);
});
test('rejects malformed messages, recipient/header injection, and sender overrides', async () => {
    const f = fixture();
    for (const body of ['bad json', [], null, { ...message, to: 'clinic@example.com\r\nBcc: other@example.com' }, { ...message, subject: 'Subject\r\nBcc: other@example.com' }, { ...message, from: 'other@example.com' }, { ...message, bcc: 'other@example.com' }, { ...message, html: '' }, { ...message, attachments: [{ path: 'private-file' }] }]) {
        assert.equal((await f.handler(request(body))).status, 400);
    }
    assert.equal((await f.handler(request(message, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal(f.created(), 0);
});
test('embeds only the fixed application logo when the template references its CID', async () => {
    const f = fixture();
    assert.equal((await f.handler(request({ ...message, html: '<img src="cid:frigo-flow-logo" alt="Frigo Flow">' }))).status, 200);
    const [logo] = f.sent[0].attachments;
    assert.equal(logo.cid, 'frigo-flow-logo');
    assert.equal(logo.contentType, 'image/jpeg');
    assert.equal(logo.contentDisposition, 'inline');
    assert.equal(logo.path, path.join(process.cwd(), 'public', 'logo.jpg'));
    assert.ok(fs.existsSync(logo.path));
});
test('bounds message size even without a Content-Length header', async () => {
    const f = fixture();
    assert.equal((await f.handler(request('x'.repeat(66000)))).status, 413);
    assert.equal(f.created(), 0);
});
test('reports unavailable when private server configuration is missing', async () => {
    for (const settings of [{}, { ...env, SMTP_PASS: '' }]) {
        const f = fixture(undefined, settings);
        assert.equal((await f.handler(request())).status, 503);
        assert.equal(f.created(), 0);
    }
});
test('uses the configured sender, waits for SMTP acceptance, and closes the transport', async () => {
    const f = fixture({ accepted: ['CLINIC@EXAMPLE.COM'] });
    const response = await f.handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
    assert.deepEqual(f.sent[0].from, { name: 'Frigo Flow', address: 'sender@example.com' });
    assert.equal(f.sent[0].to, 'clinic@example.com');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(f.closed(), 1);
});
test('does not claim delivery or expose private details when SMTP fails or rejects the recipient', async () => {
    for (const result of [new Error('Private SMTP authentication details'), { accepted: [], rejected: ['clinic@example.com'] }]) {
        const f = fixture(result);
        const response = await f.handler(request());
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { message: 'Email delivery is unavailable.' });
        assert.equal(f.closed(), 1);
    }
});

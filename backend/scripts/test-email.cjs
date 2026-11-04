// Uses a new, empty PostgreSQL container. Never loads the application's .env.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const suffix = randomBytes(8).toString('hex');
const container = `frigo-otp-test-${suffix}`;
const database = `frigo_otp_test_${suffix}`;
const env = { ...process.env };
delete env.AUTH_DB_TESTS;
delete env.TENANT_TEST_DATABASE_URL;
delete env.EMAIL_TEST_DATABASE_URL;
const run = (cmd, args, input) => spawnSync(cmd, args, { cwd: root, env, input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
let created = false;
let result = 1;
async function main() {
    try {
        // Trust applies only to this disposable loopback-bound container, with no persistent volume.
        const start = run('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1::5432', 'postgres:16']);
        if (start.status !== 0) throw new Error('Could not start disposable PostgreSQL. Check Docker Desktop.');
        created = true;
        let ready = false;
        for (let attempt = 0; attempt < 40; attempt++) {
            if (run('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', database]).status === 0) { ready = true; break; }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
        const binding = run('docker', ['port', container, '5432/tcp']).stdout.trim();
        const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
        if (!port) throw new Error('Disposable database must be bound to loopback only.');
        env.DATABASE_URL = env.DIRECT_URL = env.EMAIL_TEST_DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/${database}?connection_limit=1`;
        const loaded = run('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], fs.readFileSync(path.join(root, 'docs/frigo-flow-schema.sql'), 'utf8'));
        if (loaded.status !== 0) throw new Error('Could not load the schema into disposable PostgreSQL.');
        console.log('Testing email verification against disposable PostgreSQL with mocked email delivery.');
        const tests = run(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--config', 'backend/package.json', '--runInBand', '--testTimeout=15000', '--runTestsByPath', 'backend/src/auth/email-otp.integration.spec.ts', 'backend/src/auth/registration.spec.ts', 'backend/src/auth/session-profile.spec.ts', 'backend/src/mail/mail.service.spec.ts', 'backend/src/mail/mail.config.spec.ts', 'backend/src/mail/smtp.config.spec.ts', '--silent']);
        process.stdout.write(tests.stdout || '');
        process.stderr.write(tests.stderr || '');
        result = tests.status ?? 1;
    } catch (error) {
        console.error(error.message);
    } finally {
        if (created) {
            if (run('docker', ['stop', '-t', '3', container]).status !== 0) { console.error('Disposable PostgreSQL cleanup failed.'); result = 1; }
            else console.log('Disposable PostgreSQL removed.');
        }
    }
    process.exitCode = result;
}
main();

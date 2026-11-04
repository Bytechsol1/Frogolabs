// Always creates a fresh local PostgreSQL container; never loads application .env files.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const suffix = randomBytes(8).toString('hex');
const database = `frigo_clinic_delete_test_${suffix}`;
const container = `frigo-clinic-delete-${suffix}`;
const env = { ...process.env };
for (const name of ['AUTH_DB_TESTS', 'EMAIL_TEST_DATABASE_URL', 'TENANT_TEST_DATABASE_URL', 'CLINIC_DELETE_TEST_DATABASE_URL']) delete env[name];
const run = (command, args, input) => spawnSync(command, args, { cwd: root, env, input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
let created = false;
let result = 1;
(async () => {
    try {
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
        if (!port) throw new Error('The test database must be bound to loopback only.');
        env.DATABASE_URL = env.DIRECT_URL = env.CLINIC_DELETE_TEST_DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/${database}?connection_limit=3`;
        const loaded = run('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], fs.readFileSync(path.join(root, 'docs/frigo-flow-schema.sql'), 'utf8'));
        if (loaded.status !== 0) throw new Error('Could not load the schema into disposable PostgreSQL.');
        console.log('Testing clinic deletion, tenant isolation and fresh registration using synthetic local data only.');
        const tests = run(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--config', 'backend/package.json', '--runInBand', '--testTimeout=15000', '--runTestsByPath', 'backend/src/clinics/clinic-deletion.integration.spec.ts', '--silent']);
        process.stdout.write(tests.stdout || ''); process.stderr.write(tests.stderr || ''); result = tests.status ?? 1;
    } catch (error) { console.error(error.message); }
    finally {
        if (created) {
            if (run('docker', ['stop', '-t', '3', container]).status !== 0) { console.error('Disposable PostgreSQL cleanup failed.'); result = 1; }
            else console.log('Disposable PostgreSQL removed.');
        }
    }
    process.exitCode = result;
})();

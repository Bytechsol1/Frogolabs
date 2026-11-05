// Synthetic local PostgreSQL only. Never reads application .env files or uses business data.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const suffix = randomBytes(8).toString('hex');
const database = `frigo_tenant_test_${suffix}`;
const container = `frigo-tenant-test-${suffix}`;
const env = { ...process.env, CLINIC_LOGO_STORAGE: 'database' };
for (const name of ['AUTH_DB_TESTS', 'EMAIL_TEST_DATABASE_URL', 'TENANT_TEST_DATABASE_URL', 'CLINIC_DELETE_TEST_DATABASE_URL']) delete env[name];
const run = (command, args, input, stdio = 'pipe') => spawnSync(command, args, { cwd: root, env, input, stdio, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let created = false, frontend, result = 1;

(async () => {
    try {
        const start = run('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1::5432', 'postgres:16']);
        if (start.status !== 0) throw new Error('Could not start disposable PostgreSQL. Check Docker Desktop.');
        created = true;
        let ready = false;
        for (let attempt = 0; attempt < 40; attempt++) {
            if (run('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database]).status === 0) { ready = true; break; }
            await sleep(500);
        }
        if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
        const binding = run('docker', ['port', container, '5432/tcp']).stdout.trim();
        const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
        if (!port) throw new Error('The test database must be bound to loopback only.');
        env.DATABASE_URL = env.DIRECT_URL = env.TENANT_TEST_DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/${database}?connection_limit=3`;
        const loaded = run('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], fs.readFileSync(path.join(root, 'docs/frigo-flow-schema.sql'), 'utf8'));
        if (loaded.status !== 0) { process.stderr.write(loaded.stderr || ''); throw new Error('Could not load the schema into disposable PostgreSQL.'); }
        console.log('Testing two-clinic isolation and branding permissions with synthetic local data only.');
        const tests = run(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--config', 'backend/package.json', '--runInBand', '--testTimeout=15000', '--runTestsByPath', 'backend/src/branding/tenant-isolation.integration.spec.ts', '--silent']);
        process.stdout.write(tests.stdout || ''); process.stderr.write(tests.stderr || '');
        result = tests.status ?? 1;
        if (result === 0 && process.env.TENANT_BROWSER_TESTS === '1') {
            const reserve = net.createServer();
            await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
            const frontendPort = reserve.address().port;
            await new Promise(resolve => reserve.close(resolve));
            env.FRIGO_TEST_FRONTEND = `http://127.0.0.1:${frontendPort}`;
            // browser-branding intercepts all /api/* calls and forwards them to its synthetic backend.
            frontend = spawn(process.execPath, [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(frontendPort)], {
                cwd: path.join(root, 'frontend'), env: { ...env, BACKEND_URL: 'http://127.0.0.1:1' }, windowsHide: true, stdio: 'ignore',
            });
            ready = false;
            for (let attempt = 0; attempt < 90; attempt++) {
                if (frontend.exitCode !== null) throw new Error('The local frontend exited. Build the frontend first.');
                try { if ((await fetch(`${env.FRIGO_TEST_FRONTEND}/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
                await sleep(500);
            }
            if (!ready) throw new Error('The local frontend did not become ready.');
            const checks = run(process.execPath, [path.join(root, 'backend/scripts/browser-branding.cjs')], undefined, 'inherit');
            process.stdout.write(checks.stdout || ''); process.stderr.write(checks.stderr || '');
            result = checks.status ?? 1;
        }
    } catch (error) { result = 1; console.error(error.message); }
    finally {
        if (frontend?.pid) {
            if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(frontend.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            else frontend.kill('SIGTERM');
        }
        if (created) {
            if (run('docker', ['stop', '-t', '3', container]).status !== 0) { console.error('Disposable PostgreSQL cleanup failed.'); result = 1; }
            else console.log('Disposable PostgreSQL removed.');
        }
    }
    process.exitCode = result;
})();

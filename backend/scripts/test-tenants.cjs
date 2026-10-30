// Disposable local PostgreSQL only. Never reads or modifies application records.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const local = parseEnv(fs.readFileSync(path.join(root, 'backend/.env'), 'utf8'));
let source;
try { source = new URL(process.env.TENANT_LOCAL_DATABASE_URL || local.DATABASE_URL); }
catch { throw new Error('Local test database configuration is invalid.'); }
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) || Number(source.port || 5432) !== 5432) {
    throw new Error('Tenant tests require the local PostgreSQL Docker configuration.');
}
const database = `frigo_tenant_test_${randomBytes(8).toString('hex')}`;
source.pathname = `/${database}`;
source.search = '';
const env = {
    ...process.env, DATABASE_URL: source.toString(), DIRECT_URL: source.toString(),
    TENANT_TEST_DATABASE_URL: source.toString(), CLINIC_LOGO_STORAGE: 'database',
    PRISMA_SCHEMA_ENGINE_BINARY: path.join(root, 'backend/node_modules/@prisma/engines/schema-engine-windows.exe'),
    PRISMA_QUERY_ENGINE_LIBRARY: path.join(root, 'backend/node_modules/@prisma/engines/query_engine-windows.dll.node'),
};
delete env.AUTH_DB_TESTS;
if (process.platform !== 'win32') {
    delete env.PRISMA_SCHEMA_ENGINE_BINARY;
    delete env.PRISMA_QUERY_ENGINE_LIBRARY;
}
const run = (command, args, input) => spawnSync(command, args, { cwd: root, env, input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const docker = (command, ...args) => run('docker', ['exec', 'frigoflow-postgres-dev', 'sh', '-c', command, '--', ...args]);
let created = false;
let result = 1;
try {
    const schema = run(process.execPath, [path.join(root, 'backend/node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'backend/prisma/schema.prisma', '--script']);
    if (schema.status !== 0) throw new Error('Could not generate the disposable database schema.');
    if (docker('exec createdb -U "$POSTGRES_USER" "$1"', database).status !== 0) throw new Error('Could not create a fresh disposable test database.');
    created = true;
    const migration = ['202610280001_clinic_branding', '202610290001_database_clinic_logos', '202610290002_database_report_files'].map(name => fs.readFileSync(path.join(root, 'backend/prisma/migrations', name, 'migration.sql'), 'utf8')).join('\n');
    const loaded = run('docker', ['exec', '-i', 'frigoflow-postgres-dev', 'sh', '-c', 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"', '--', database], schema.stdout + '\n' + migration);
    if (loaded.status !== 0) {
        throw new Error('The tenant schema migration did not apply to the disposable database.');
    }
    console.log('Running two-clinic API tests against a new disposable PostgreSQL database.');
    const tests = run(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--config', 'backend/package.json', '--runInBand', '--runTestsByPath', 'backend/src/branding/tenant-isolation.integration.spec.ts', '--silent']);
    process.stdout.write(tests.stdout || '');
    process.stderr.write(tests.stderr || '');
    result = tests.status ?? 1;
    if (result === 0 && process.env.TENANT_BROWSER_TESTS === '1') {
        const browser = run(process.execPath, [path.join(root, 'backend/scripts/browser-branding.cjs')]);
        process.stdout.write(browser.stdout || '');
        process.stderr.write(browser.stderr || '');
        result = browser.status ?? 1;
    }
} catch (error) {
    console.error(error.message);
} finally {
    if (created) {
        const cleanup = docker('exec dropdb --force -U "$POSTGRES_USER" "$1"', database);
        if (cleanup.status !== 0) { console.error('Disposable test database cleanup failed.'); result = 1; }
        else console.log('Disposable test database removed.');
    }
}
process.exitCode = result;

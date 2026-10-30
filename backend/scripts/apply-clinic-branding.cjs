const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');
const backend = path.resolve(__dirname, '..');
const config = { ...parseEnv(fs.readFileSync(path.join(backend, '.env'), 'utf8')), ...process.env };
for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    let url;
    try { url = new URL(config[name]); }
    catch { throw new Error(`${name} must be a valid local PostgreSQL configuration.`); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This helper only applies the migration to local development databases.');
}
const env = { ...config };
if (process.platform === 'win32') {
    env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(backend, 'node_modules/@prisma/engines/schema-engine-windows.exe');
    env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(backend, 'node_modules/@prisma/engines/query_engine-windows.dll.node');
}
const result = spawnSync(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/migrations/202610280001_clinic_branding/migration.sql'], { cwd: backend, env, encoding: 'utf8', windowsHide: true });
// Keep connection details out of terminal output, including provider error text.
if (result.status !== 0) console.error('Local branding migration failed. Check the local database and existing application tables.');
else console.log('Local branding migration applied. Existing ownership and staff permissions were preserved.');
process.exitCode = result.status ?? 1;

// Start the local dependencies before exposing the login page.
const { spawn, spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');
const { createRequire } = require('node:module');
const net = require('node:net');

const root = resolve(__dirname, '..');
const children = new Set();
let stopping = false;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const envFile = name => parseEnv(readFileSync(resolve(root, name), 'utf8'));
const run = (command, args, quiet = false) => spawnSync(command, args, {
    cwd: root, windowsHide: true, stdio: quiet ? 'ignore' : 'inherit', timeout: 30000,
}).status === 0;

function listening(port, host = '127.0.0.1') {
    return new Promise(done => {
        const socket = net.createConnection({ port, host });
        const finish = value => { socket.destroy(); done(value); };
        socket.setTimeout(1000);
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.once('timeout', () => finish(false));
    });
}

async function waitFor(check, label, timeout = 120000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await sleep(1000);
    }
    throw new Error(`${label} did not become ready. Check its output above.`);
}

function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
        if (process.platform === 'win32') {
            run('taskkill', ['/PID', String(child.pid), '/T', '/F'], true);
        } else {
            try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
        }
    }
    process.exit(code);
}

function start(script) {
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Start the app using npm run dev.');
    const child = spawn(process.execPath, [npm, 'run', script], {
        cwd: root, stdio: 'inherit', windowsHide: true,
        detached: process.platform !== 'win32',
    });
    children.add(child);
    child.on('error', () => stop(1));
    child.on('exit', code => {
        children.delete(child);
        if (!stopping) {
            console.error(`[dev] ${script} stopped. Restart with npm run dev.`);
            stop(code || 1);
        }
    });
}

async function main() {
    const backendEnv = { ...envFile('backend/.env'), ...process.env };
    const frontendEnv = { ...envFile('frontend/.env.local'), ...process.env };
    const database = new URL(backendEnv.DATABASE_URL);
    const backend = new URL(frontendEnv.BACKEND_URL);
    const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
    const dbPort = Number(database.port || 5432);

    if (local(database.hostname) && dbPort === 5432 && !await listening(dbPort)) {
        console.log('[dev] Starting local PostgreSQL...');
        if (!run('docker', ['info'], true)) {
            const desktop = resolve(process.env.ProgramFiles || 'C:\\Program Files', 'Docker/Docker/Docker Desktop.exe');
            if (process.platform !== 'win32' || !existsSync(desktop)) {
                throw new Error('Start Docker Desktop, then run npm run dev again.');
            }
            // Pass the path as an environment value, never interpolate it into shell code.
            process.env.FRIGO_DOCKER_DESKTOP = desktop;
            run('powershell.exe', ['-NoProfile', '-Command', 'Start-Process -FilePath $env:FRIGO_DOCKER_DESKTOP -WindowStyle Hidden']);
            console.log('[dev] Waiting for Docker Desktop...');
            await waitFor(() => run('docker', ['info'], true), 'Docker Desktop');
        }
        if (!run('docker', ['compose', 'up', '-d', 'postgres'])) {
            throw new Error('Could not start PostgreSQL. Check Docker Desktop and port 5432.');
        }
    }

    const backendRequire = createRequire(resolve(root, 'backend/package.json'));
    const { PrismaClient } = backendRequire('@prisma/client');
    const prisma = new PrismaClient({ datasourceUrl: backendEnv.DATABASE_URL });
    try {
        await waitFor(async () => {
            try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
        }, 'Configured database', 60000);
    } finally { await prisma.$disconnect(); }
    console.log('[dev] Database ready.');

    if (local(backend.hostname)) {
        const port = Number(backend.port || (backend.protocol === 'https:' ? 443 : 80));
        if (!await listening(port, backend.hostname.replace(/^\[|\]$/g, ''))) {
            if (port !== Number(backendEnv.PORT || 3001)) {
                throw new Error('BACKEND_URL must use the same port as backend PORT.');
            }
            start('dev:backend');
        } else {
            console.log(`[dev] Using backend already running on port ${port}.`);
        }
    }
    await waitFor(async () => {
        try {
            const response = await fetch(new URL('/api/v1/auth/me', backend), { signal: AbortSignal.timeout(2000) });
            return response.status === 401;
        } catch { return false; }
    }, 'Backend API');
    if (!await listening(3000)) start('dev:frontend');
    else console.log('[dev] Using frontend already running on port 3000.');
    console.log('[dev] Open http://localhost:3000/login. Keep the dev terminal open.');
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
main().catch(error => { console.error(`[dev] ${error.message}`); stop(1); });

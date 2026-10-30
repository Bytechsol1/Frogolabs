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
    const started = Date.now();
    const deadline = started + timeout;
    let nextProgress = started + 10000;
    while (Date.now() < deadline) {
        if (await check()) return;
        if (Date.now() >= nextProgress) {
            console.log(`[dev] Waiting for ${label} (${Math.floor((Date.now() - started) / 1000)}s)... Keep this terminal open.`);
            nextProgress = Date.now() + 10000;
        }
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

function start(script, env = {}) {
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Start the app using npm run dev.');
    const child = spawn(process.execPath, [npm, 'run', script], {
        cwd: root, stdio: 'inherit', windowsHide: true,
        detached: process.platform !== 'win32',
        env: { ...process.env, ...env },
    });
    children.add(child);
    child.on('error', () => {
        console.error(`[dev] Could not start ${script}. Check that Node.js and npm are available.`);
        stop(1);
    });
    child.on('exit', code => {
        children.delete(child);
        if (!stopping) {
            console.error(`[dev] ${script} stopped. Restart with npm run dev.`);
            stop(code || 1);
        }
    });
}

async function frontendPort(backendPort) {
    for (let port = 3000; port <= 3010; port++) {
        if (port === backendPort) continue;
        if (!await listening(port)) return { port, running: false };
        try {
            const response = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(3000) });
            const html = await response.text();
            if (response.status === 200 && /<title>[^<]*Frigo/i.test(html)) {
                return { port, running: true };
            }
        } catch { /* Occupied by another app or a server that is not ready. */ }
        console.log(`[dev] Port ${port} is occupied by another app. Leaving it running.`);
    }
    throw new Error('No frontend port is available between 3000 and 3010.');
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
            console.log('[dev] Starting backend. The first compilation can take 1-2 minutes.');
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
    }, 'Backend API', 300000);
    console.log('[dev] Backend API ready.');
    const frontend = await frontendPort(Number(backend.port || (backend.protocol === 'https:' ? 443 : 80)));
    const frontendOrigin = `http://127.0.0.1:${frontend.port}`;
    if (!frontend.running) {
        console.log(`[dev] Starting Frigo Flow frontend on port ${frontend.port}.`);
        start('dev:frontend', { PORT: String(frontend.port) });
    } else console.log(`[dev] Using Frigo Flow frontend already running on port ${frontend.port}.`);
    await waitFor(async () => {
        try {
            const response = await fetch(`${frontendOrigin}/login`, { signal: AbortSignal.timeout(5000) });
            const ready = response.status === 200;
            await response.body?.cancel();
            return ready;
        } catch { return false; }
    }, 'Frontend login page', 300000);
    await waitFor(async () => {
        let response;
        try {
            response = await fetch(`${frontendOrigin}/api/v1/auth/me`, { signal: AbortSignal.timeout(5000) });
            await response.body?.cancel();
        } catch { return false; }
        if (response.status === 404) {
            throw new Error('The frontend is using an outdated API proxy. Stop the old frontend terminal, then run npm run dev again.');
        }
        return response.status === 401;
    }, 'Frontend API proxy', 300000);
    console.log(`[dev] Open http://localhost:${frontend.port}/login. Keep the dev terminal open.`);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
main().catch(error => { console.error(`[dev] ${error.message}`); stop(1); });

/**
 * Frees the backend dev port before `nest start --watch` boots.
 *
 * On Windows, nest-cli's tsc-watch process manager spawns `node dist/main`
 * through a `cmd.exe /c` wrapper. Killing that wrapper (e.g. terminal closed,
 * machine sleep, or us stopping the watcher) does not reliably kill the
 * node.exe grandchild, so it can survive as an orphan still bound to the
 * port. The next `npm run dev:backend` then fails with EADDRINUSE.
 *
 * This script is idempotent: if nothing is listening on the port, it does
 * nothing. It only runs as a pre-hook before dev:backend/dev start.
 */
const { execSync } = require('child_process');

const PORT = Number(process.env.PORT) || 3001;

function killWindows(port) {
    let out;
    try {
        out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    } catch {
        return;
    }
    const pids = new Set();
    for (const line of out.split('\n')) {
        const match = line.match(/^\s*TCP\s+\S*[:.](\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (match && Number(match[1]) === port) {
            pids.add(match[2]);
        }
    }
    for (const pid of pids) {
        try {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
            console.log(`[free-port] Killed orphaned process ${pid} holding port ${port}`);
        } catch {
            // Already gone by the time we got here — fine.
        }
    }
}

function killPosix(port) {
    let out;
    try {
        out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
    } catch {
        return;
    }
    const pids = out.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const pid of pids) {
        try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            console.log(`[free-port] Killed orphaned process ${pid} holding port ${port}`);
        } catch {
            // Already gone by the time we got here — fine.
        }
    }
}

if (process.platform === 'win32') {
    killWindows(PORT);
} else {
    killPosix(PORT);
}

// Local production frontend + intercepted API responses. No live records or real emails.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const secret = 'fixture-only-local-browser-key-at-least-32-characters';
const stop = child => {
    if (!child?.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
};
async function until(check, label, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await check()) return; } catch { /* Navigation/startup may be in progress. */ }
        await sleep(150);
    }
    throw new Error(`Browser check timed out: ${label}`);
}
(async () => {
    const reserve = net.createServer();
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frigo-email-browser-'));
    let server, chrome, socket;
    const calls = [];
    try {
        server = spawn(process.execPath, [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
            cwd: path.join(root, 'frontend'), env: { ...process.env, MAIL_BRIDGE_SECRET: secret }, windowsHide: true, stdio: 'ignore',
        });
        await until(async () => (await fetch(`${origin}/signup`)).ok, 'local frontend startup');
        const endpoint = `${origin}/api/internal/mail`;
        assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
        assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: '{}' })).status, 400);
        console.log('PASS real Next.js mail route takes precedence over backend rewrites and requires server authentication');
        const browser = process.env.FRIGO_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        assert.ok(fs.existsSync(browser), 'Local Chrome is required.');
        const profile = path.join(directory, 'chrome');
        chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
        await until(() => fs.existsSync(path.join(profile, 'DevToolsActivePort')), 'headless browser startup');
        const debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
        const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        let sequence = 0, registration = 'failed', verify = 'wrong', resend = 'ok', profileUnavailable = false, profileDenied = false, accountVerified = false;
        const fixtureProfile = () => ({ id: 'fixture-user', email: 'ui@example.com', name: 'UI Fixture', role: 'CLINIC_USER', email_verified: accountVerified, clinic_id: 'fixture-clinic', clinic_name: 'Fixture Clinic', is_clinic_admin: true });
        const pending = new Map();
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 30000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
        });
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.id) {
                const item = pending.get(message.id); if (!item) return;
                pending.delete(message.id); clearTimeout(item.timer);
                if (message.error) item.reject(new Error('Browser command failed.')); else item.resolve(message.result);
            } else if (message.method === 'Fetch.requestPaused') {
                void (async () => {
                    const { requestId, request } = message.params;
                    const pathname = new URL(request.url).pathname;
                    calls.push(pathname);
                    let status = 200, body = [];
                    if (pathname.endsWith('/auth/register')) {
                        if (registration === 'failed') { status = 503; body = { code: 'EMAIL_DELIVERY_FAILED', retry_after: 60 }; }
                        else if (registration === 'pending') { status = 409; body = { code: 'EMAIL_NOT_VERIFIED' }; }
                        else if (registration === 'duplicate') { status = 409; body = { code: 'EMAIL_ALREADY_REGISTERED' }; }
                        else body = { message: 'Synthetic code sent.', resend_after: 60 };
                    } else if (pathname.endsWith('/auth/register/resend')) {
                        if (resend === 'failed') { status = 503; body = { code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send verification email. Please try again.', retry_after: 60 }; }
                        else body = { message: 'Synthetic code sent.', resend_after: 60 };
                    } else if (pathname.endsWith('/auth/register/verify')) {
                        if (verify === 'wrong') { status = 400; body = { code: 'OTP_INCORRECT', message: 'Incorrect verification code.' }; }
                        else if (accountVerified) { status = 400; body = { code: 'OTP_INVALID', message: 'No active verification code. Please request a new code.' }; }
                        else { accountVerified = true; body = { access_token: 'synthetic-browser-session', user: fixtureProfile() }; }
                    } else if (pathname.endsWith('/auth/login')) {
                        if (accountVerified) body = { access_token: 'synthetic-browser-session' };
                        else { status = 403; body = { code: 'EMAIL_NOT_VERIFIED', message: 'Your email has not been verified.' }; }
                    } else if (pathname.endsWith('/auth/me')) {
                        if (profileDenied) { status = 403; body = { message: 'Synthetic clinic disabled' }; }
                        else if (profileUnavailable) { status = 503; body = { message: 'Synthetic profile outage' }; }
                        else body = fixtureProfile();
                    }
                    else if (pathname.includes('/branding/')) body = { id: 'fixture-clinic', name: 'Fixture Clinic', services: [], logo_url: null, primary_color: '#0F766E', secondary_color: '#14B8A6' };
                    else if (pathname.endsWith('/dashboard/clinic/stats')) body = { kpi: {}, tables: { recentPatients: [] } };
                    else if (request.method !== 'GET') { status = 400; body = { message: 'Unexpected mutation blocked by browser test.' }; }
                    await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
                })().catch(() => {});
            }
        });
        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw new Error('Browser evaluation failed.');
            return result.result.value;
        };
        const wait = expression => until(() => evaluate(`Boolean(${expression})`), expression);
        const input = async (selector, value) => {
            await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            await sleep(50);
        };
        const submit = () => evaluate("document.querySelector('form').requestSubmit()");
        const click = text => evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);
        const signup = async () => {
            await send('Page.navigate', { url: `${origin}/signup` });
            await wait("document.querySelector('#clinicName') && Object.keys(document.querySelector('#clinicName')).some(key=>key.startsWith('__reactProps'))");
            await sleep(250);
            await evaluate("sessionStorage.clear(); localStorage.clear()");
            for (const [field, value] of Object.entries({ clinicName: 'Synthetic Clinic', contactName: 'Synthetic Contact', email: 'ui@example.com', phone: '+12025550123', password: 'fixture-password', confirmPassword: 'fixture-password' })) await input(`#${field}`, value);
            await submit();
        };
        await send('Page.enable'); await send('Runtime.enable');
        await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/v1/*` }] });
        await signup();
        await wait("document.body.innerText.includes('Registration was not completed')");
        assert.equal(await evaluate('location.pathname'), '/signup');
        assert.equal(await evaluate("sessionStorage.getItem('frigo-email-verification')"), null);
        console.log('PASS failed email leaves signup with a delivery error and no false code-sent context');
        registration = 'duplicate'; await signup();
        await wait("document.body.innerText.includes('This email is already registered.')");
        assert.equal(await evaluate('location.pathname'), '/signup');
        console.log('PASS verified duplicate stays restricted with the correct email error');
        registration = 'ok'; await signup();
        await wait("location.pathname==='/verify-email' && document.body.innerText.includes('We sent a 6-digit')");
        console.log('PASS accepted new signup opens verification with a resend cooldown');
        registration = 'pending'; await signup();
        await wait("location.pathname==='/verify-email' && document.querySelector('#verification-email') && document.body.innerText.includes('Request a verification code')");
        assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('frigo-email-verification')).sent"), false);
        resend = 'failed'; await click('Resend Code');
        await wait("document.body.innerText.includes('Unable to send verification email.')");
        assert.ok(await evaluate("document.body.innerText.includes('Resend code in')"));
        await evaluate("sessionStorage.setItem('frigo-email-verification',JSON.stringify({email:'ui@example.com',sent:false,resendAt:0}))");
        await send('Page.reload');
        await wait("document.querySelector('#verification-email') && [...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Resend Code' && !e.disabled)");
        resend = 'ok'; await click('Resend Code');
        await wait("document.body.innerText.includes('We sent a 6-digit') && document.body.innerText.includes('Resend code in')");
        console.log('PASS legacy unverified signup recovers through resend, including failure and retry');
        await input('#otp-digit-1', '482915');
        await click('Verify Code');
        await wait("document.body.innerText.includes('Incorrect verification code.')");
        assert.equal(await evaluate("localStorage.getItem('access_token')"), null);
        const sentBeforeVerification = calls.filter(pathname => pathname.endsWith('/auth/register/resend')).length;
        const verifiedBefore = calls.filter(pathname => pathname.endsWith('/auth/register/verify')).length;
        profileUnavailable = true;
        verify = 'ok'; await click('Verify Code');
        await wait("location.pathname==='/dashboard' && document.body.innerText.includes('Add New Patient')");
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/login')).length, 0);
        assert.equal(await evaluate("document.body.innerText.includes('Continue to sign in')"), false);
        assert.equal(await evaluate("sessionStorage.getItem('frigo-email-verification')"), null);
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/register/verify')).length, verifiedBefore + 1);
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/register/resend')).length, sentBeforeVerification);
        console.log('PASS one correct code opens dashboard directly even when profile requests fail; no password sign-in or second OTP');
        profileUnavailable = false;
        await send('Page.reload');
        await wait("location.pathname==='/dashboard' && document.body.innerText.includes('Add New Patient')");
        console.log('PASS the authenticated session survives dashboard reload');
        await send('Page.navigate', { url: `${origin}/verify-email` });
        await wait("location.pathname==='/dashboard' && document.body.innerText.includes('Add New Patient')");
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/register/resend')).length, sentBeforeVerification);
        console.log('PASS revisiting verification with a verified session returns to dashboard without another code');
        await evaluate('localStorage.clear(); sessionStorage.clear()');
        registration = 'ok'; accountVerified = false;
        await signup();
        await wait("location.pathname==='/verify-email' && document.querySelector('#otp-digit-1')");
        const beforeNormalVerify = calls.filter(pathname => pathname.endsWith('/auth/register/verify')).length;
        await input('#otp-digit-1', '482915');
        await evaluate("document.querySelector('#otp-digit-6').focus()");
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wait("location.pathname==='/dashboard' && document.body.innerText.includes('Add New Patient')");
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/register/verify')).length, beforeNormalVerify + 1);
        assert.equal(calls.filter(pathname => pathname.endsWith('/auth/register/resend')).length, sentBeforeVerification);
        console.log('PASS one code submitted with Enter opens dashboard automatically without a second verification');
        await evaluate("sessionStorage.setItem('frigo-email-verification',JSON.stringify({email:'changed@example.com',sent:true,resendAt:Date.now()+60000}))");
        await send('Page.navigate', { url: `${origin}/verify-email` });
        await wait("document.querySelector('#otp-digit-1') && document.body.innerText.includes('c***@example.com')");
        await sleep(300);
        assert.equal(await evaluate('location.pathname'), '/verify-email');
        console.log('PASS a signed-in user can still verify a genuinely different email address');
        profileDenied = true;
        await send('Page.navigate', { url: `${origin}/dashboard` });
        await wait("location.pathname==='/login' && document.querySelector('#email')");
        assert.equal(await evaluate("localStorage.getItem('access_token')"), null);
        console.log('PASS server-revoked sessions remain restricted after automatic verification sign-in');
        console.log(`Browser checks passed; ${calls.length} local API requests intercepted, no live records or email used.`);
    } finally {
        socket?.close(); stop(chrome); stop(server);
        const target = path.resolve(directory);
        if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('frigo-email-browser-')) fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

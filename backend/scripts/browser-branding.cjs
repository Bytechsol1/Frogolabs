// Optional real-browser acceptance checks. Uses only the disposable tenant DB.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const root = path.resolve(__dirname, '../..');
let source;
try { source = new URL(process.env.TENANT_TEST_DATABASE_URL); }
catch { throw new Error('A valid disposable local tenant database is required.'); }
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) || !/^\/frigo_tenant_test_[a-z0-9_]+$/.test(source.pathname)) throw new Error('A disposable local tenant database is required.');
const frontend = new URL(process.env.FRIGO_TEST_FRONTEND || 'http://localhost:3002');
if (!['localhost', '127.0.0.1', '[::1]'].includes(frontend.hostname)) throw new Error('Browser checks require a local Frigo frontend.');
const browser = process.env.FRIGO_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const expect = (value, message) => { if (!value) throw new Error(message); };
async function until(check, label, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await check()) return; }
        catch (error) {
            // A navigation may destroy the execution context between CDP calls.
            if (error.message !== 'Browser page evaluation failed.') throw error;
        }
        await sleep(250);
    }
    throw new Error(`Browser check timed out: ${label}`);
}
function stop(child) {
    if (!child?.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
}

(async () => {
    const login = await fetch(new URL('/login', frontend), { signal: AbortSignal.timeout(15000) });
    expect(/<title>[^<]*Frigo/i.test(await login.text()), 'The selected frontend is not Frigo Flow.');
    expect(fs.existsSync(browser), 'A local Chrome installation is required for the optional browser checks.');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frigo-browser-test-'));
    const artifacts = path.join(root, '.devtmp/branding-review');
    fs.mkdirSync(artifacts, { recursive: true });
    const reserve = net.createServer();
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    const backendOrigin = `http://127.0.0.1:${port}`;
    const secret = randomBytes(32).toString('hex');
    const db = new PrismaClient({ datasourceUrl: source.toString() });
    const backendEnv = { ...process.env, DATABASE_URL: source.toString(), DIRECT_URL: source.toString(), JWT_SECRET: secret, PORT: String(port),
        NODE_ENV: 'test', CLINIC_LOGO_STORAGE: 'database', TERRA_WORKFLOW_AUTO_SYNC: 'false', TERRA_SANDBOX_AUTO_REPORTS: 'false', TERRA_ENVIRONMENT: 'sandbox', TERRA_SHOW_SANDBOX_DATA: 'true',
        SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM_EMAIL: '', SMTP_FROM_NAME: '', SMTP_PORT: '', SMTP_SECURE: '',
    };
    let api, chrome, socket, send, evaluate;
    const apiChecks = [];
    const requestsStarted = [];
    const browserErrors = [];
    const network = [];
    process.once('uncaughtExceptionMonitor', () => { stop(chrome); stop(api); });
    try {
        api = spawn(process.execPath, [path.join(root, 'backend/dist/main.js')], { cwd: directory, env: backendEnv, windowsHide: true, stdio: 'ignore' });
        await until(async () => { try { return (await fetch(`${backendOrigin}/api/v1/auth/me`)).status === 401; } catch { return false; } }, 'synthetic backend startup');
        const profile = path.join(directory, 'chrome');
        chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
        const active = path.join(profile, 'DevToolsActivePort');
        await until(() => fs.existsSync(active), 'headless browser startup');
        const debugPort = fs.readFileSync(active, 'utf8').split('\n')[0].trim();
        const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Browser connection failed.')), { once: true }); });
        let sequence = 0, logoBytes, failLogos = false, failedLogoRequests = 0;
        const pending = new Map();
        send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 30000);
            pending.set(id, { resolve, reject, timer });
            socket.send(JSON.stringify({ id, method, params }));
        });
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
            if (message.method === 'Network.responseReceived') network.push({ path: new URL(message.params.response.url).pathname, status: message.params.response.status, type: message.params.type });
            if (message.method === 'Network.loadingFailed') network.push({ failed: message.params.errorText });
            if (message.id) {
                const item = pending.get(message.id);
                if (!item) return;
                pending.delete(message.id); clearTimeout(item.timer);
                if (message.error) item.reject(new Error(`Browser command failed: ${message.error.code}`)); else item.resolve(message.result);
            } else if (message.method === 'Fetch.requestPaused') {
                void (async () => {
                    const event = message.params, url = new URL(event.request.url);
                    requestsStarted.push(url.pathname);
                    if (failLogos && /\/branding\/public\/[^/]+\/logo$/.test(url.pathname)) {
                        await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 404, body: '' });
                        ++failedLogoRequests;
                        return;
                    }
                    const headers = {};
                    for (const [key, value] of Object.entries(event.request.headers)) if (['authorization', 'content-type'].includes(key.toLowerCase())) headers[key] = value;
                    let body = event.request.postData;
                    const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
                    if (contentTypeKey && headers[contentTypeKey].includes('multipart/form-data')) {
                        delete headers[contentTypeKey];
                        body = new FormData();
                        body.append('file', new Blob([logoBytes], { type: 'image/png' }), 'synthetic-logo.png');
                    }
                    const response = await fetch(`${backendOrigin}${url.pathname}${url.search}`, { method: event.request.method, headers, ...(body ? { body } : {}) });
                    apiChecks.push({ path: url.pathname, status: response.status });
                    const responseHeaders = [...response.headers].filter(([key]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(key)).map(([name, value]) => ({ name, value }));
                    await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: response.status, responseHeaders, body: Buffer.from(await response.arrayBuffer()).toString('base64') });
                })().catch(() => {
                    // Navigation/Strict Mode can cancel a paused request before its response arrives.
                    void send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }).catch(() => {});
                });
            }
        });
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Network.enable');
        await send('Network.setCacheDisabled', { cacheDisabled: true });
        await send('DOM.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
        await send('Fetch.enable', { patterns: [{ urlPattern: `${frontend.origin}/api/*` }, { urlPattern: `${frontend.origin}/uploads/*` }] });
        evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw new Error('Browser page evaluation failed.');
            return result.result.value;
        };
        const navigate = async pathname => {
            const previous = await evaluate('performance.timeOrigin');
            await send('Page.navigate', { url: new URL(pathname, frontend).toString() });
            await until(() => evaluate(`performance.timeOrigin !== ${previous} && document.readyState === 'complete'`), 'new page document');
        };
        const input = async (id, value) => evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        const reload = async () => {
            const previous = await evaluate('performance.timeOrigin');
            await send('Page.reload');
            await until(() => evaluate(`performance.timeOrigin !== ${previous} && !!document.querySelector('header')`).catch(() => false), 'fresh dashboard document');
        };
        const checkNavbar = async (logo, name, primary, secondary) => {
            await until(() => evaluate(`(() => {
                const brand = document.querySelector('header [data-navbar-brand]');
                if (!brand || brand.textContent.trim() || document.querySelector('header').textContent.includes(${JSON.stringify(name)})) return false;
                const images = Array.from(brand.querySelectorAll('img'));
                if (images.length !== ${logo ? 2 : 1} || new URL(images[0].src).pathname !== '/logo.jpg') return false;
                if (${!!logo} && images[1]?.src !== new URL(${JSON.stringify(logo || '/')}, location.origin).href) return false;
                const rects = images.map(image => image.getBoundingClientRect());
                if (!images.every(image => image.complete && image.naturalWidth > 0 && getComputedStyle(image).objectFit === 'contain')) return false;
                if (!rects.every(rect => rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth)) return false;
                if (rects[0].width < 80) return false;
                if (rects[1] && (rects[0].right > rects[1].left || Math.abs((rects[0].top + rects[0].height / 2) - (rects[1].top + rects[1].height / 2)) > 1)) return false;
                if (Math.abs(rects[0].width / rects[0].height - images[0].naturalWidth / images[0].naturalHeight) > 0.03) return false;
                const avatar = document.querySelector('header [data-account-avatar]');
                const avatarImage = avatar?.querySelector('img');
                if (!avatar || (${!!logo} ? !avatarImage || avatarImage.src !== new URL(${JSON.stringify(logo || '/')}, location.origin).href || !avatarImage.complete || avatarImage.naturalWidth === 0 || getComputedStyle(avatarImage).objectFit !== 'contain' : !!avatarImage || !avatar.textContent.trim())) return false;
                if (document.querySelector('header a[href="/dashboard/branding"]')) return false;
                const actions = document.querySelector('header button[aria-label="Settings"]').parentElement.getBoundingClientRect();
                if (brand.getBoundingClientRect().right > actions.left || document.documentElement.scrollWidth > innerWidth) return false;
                const theme = getComputedStyle(document.querySelector('.clinic-theme'));
                return (!${!!primary} || theme.getPropertyValue('--brand-primary').trim() === ${JSON.stringify(primary || '')}) && (!${!!secondary} || theme.getPropertyValue('--brand-secondary').trim() === ${JSON.stringify(secondary || '')});
            })()`).catch(() => false), 'navbar logos, no clinic name, alignment and clinic colors');
        };
        const checkProfileAvatar = async logo => {
            await until(() => evaluate(`(() => {
                const avatar = document.querySelector('main [data-profile-avatar]');
                if (!avatar) return false;
                const image = avatar.querySelector('img');
                return ${!!logo}
                    ? !!image && image.src === new URL(${JSON.stringify(logo || '/')}, location.origin).href && image.complete && image.naturalWidth > 0 && getComputedStyle(image).objectFit === 'contain'
                    : !image && !!avatar.textContent.trim();
            })()`), 'clinic logo or initial fallback in My Profile');
        };
        const checkProfilePages = async logo => {
            await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.includes('My Profile')).click()");
            await checkProfileAvatar(logo);
            await navigate('/dashboard/profile');
            await checkProfileAvatar(logo);
            await navigate('/dashboard/settings?tab=branding');
            await until(() => evaluate("!!document.getElementById('brand-name')"), 'return from profile to branding');
        };
        // These passwords exist only in this disposable database and are never logged.
        const password = randomBytes(24).toString('hex');
        const passwordHash = await bcrypt.hash(password, 4);
        for (const id of ['tenant-platform-admin', 'tenant-staff-0', 'tenant-staff-1']) {
            await db.user.update({ where: { id }, data: { password_hash: passwordHash } });
        }
        const signIn = async id => {
            const account = await db.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
            await evaluate(`if (location.origin === ${JSON.stringify(frontend.origin)}) localStorage.removeItem('access_token')`);
            await navigate('/login');
            await until(() => evaluate("(() => { const form = document.querySelector('form'); return !!form && Object.keys(form).some(key => key.startsWith('__reactProps$') && typeof form[key]?.onSubmit === 'function'); })()"), 'login hydration');
            await evaluate("localStorage.removeItem('access_token')");
            await input('email', account.email); await input('password', password);
            const startedBeforeLogin = requestsStarted.length;
            await evaluate("document.querySelector('form').requestSubmit()");
            await until(() => evaluate("location.pathname === '/dashboard' && !!document.querySelector('header')"), 'password sign-in');
            expect(!requestsStarted.slice(startedBeforeLogin).includes('/api/v1/auth/me'), 'Password sign-in must reuse the verified profile instead of waiting for another /me call.');
            const beforeFocus = requestsStarted.filter(route => route === '/api/v1/auth/me').length;
            await evaluate("window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))");
            await until(() => requestsStarted.filter(route => route === '/api/v1/auth/me').length > beforeFocus, 'session refresh after focus');
            await sleep(100);
            expect(requestsStarted.filter(route => route === '/api/v1/auth/me').length === beforeFocus + 1, 'Concurrent focus and visibility events must share one profile request.');
        };
        const brandingLink = "Array.from(document.querySelectorAll('header a[href=\"/dashboard/branding\"]')).find(link => link.getBoundingClientRect().width > 0)";
        const callApi = async (method, pathname, token, body) => {
            const response = await fetch(`${backendOrigin}/api/v1${pathname}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return response.status;
        };
        for (const index of [0, 1]) {
            const clinicId = `tenant-fixture-${index ? 'b' : 'a'}`;
            const initialName = index ? 'Harbor Clinic' : 'NextGen Health';
            const name = `${initialName} Portal`;
            const primary = index ? '#74264f' : '#163d8c';
            const secondary = index ? '#73d8cb' : '#f2b84c';
            const managerId = `tenant-staff-${index}`;
            await db.clinic.update({ where: { id: clinicId }, data: { branding_logo: null } });
            await db.user.update({ where: { id: managerId }, data: { is_clinic_admin: false } });
            await signIn(managerId);
            await checkNavbar(null, initialName);
            expect(!await evaluate(`!!(${brandingLink})`), 'Unprivileged staff must not see branding navigation.');
            await navigate('/dashboard/branding');
            await until(() => evaluate("document.getElementById('brand-name')?.matches(':disabled')"), 'read-only staff settings');
            await signIn('tenant-platform-admin');
            expect(await evaluate("document.querySelector('header [data-navbar-brand] img')?.getAttribute('src') === '/logo.jpg' && document.querySelectorAll('header [data-navbar-brand] img').length === 1"), 'Platform administrators must keep only the Frigo logo.');
            await navigate('/dashboard/settings');
            await until(() => evaluate("!!document.querySelector('main a[href=\"/dashboard/settings/users\"]')"), 'permissions discovery in Settings');
            await evaluate("document.querySelector('main a[href=\"/dashboard/settings/users\"]').click()");
            const checkbox = `document.querySelector('input[aria-label="Branding administrator for Synthetic staff ${index}"]')`;
            await until(() => evaluate(`!!(${checkbox}) && !(${checkbox}).checked`), 'manager grant checkbox');
            await evaluate(`(${checkbox}).click()`);
            await until(() => evaluate(`(${checkbox})?.checked && document.body.textContent.includes('Branding access granted')`), 'administrator grant');
            const adminToken = await evaluate("localStorage.getItem('access_token')");
            await navigate(`/dashboard/branding?clinic=${clinicId}`);
            await until(() => evaluate(`location.pathname === '/dashboard/settings' && new URLSearchParams(location.search).get('clinic') === ${JSON.stringify(clinicId)} && document.getElementById('branding-clinic')?.value === ${JSON.stringify(clinicId)} && !!document.getElementById('brand-name')`), 'administrator legacy link keeps the selected clinic');
            await signIn(managerId);
            expect(!await evaluate(`!!(${brandingLink})`), 'Branding must live in Settings instead of the navbar.');
            await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
            await evaluate('document.querySelector(\'header button[aria-label="Settings"]\').click()');
            await until(() => evaluate("location.pathname === '/dashboard/settings'"), 'Settings gear destination');
            await until(() => evaluate(`document.getElementById('brand-name')?.value === ${JSON.stringify(initialName)} && !document.getElementById('brand-name').matches(':disabled')`), 'authorized clinic settings');
            const managerToken = await evaluate("localStorage.getItem('access_token')");
            const savedBrand = async () => (await fetch(`${backendOrigin}/api/v1/branding/${clinicId}`, { headers: { Authorization: `Bearer ${managerToken}` } })).json();
            const existingContent = await savedBrand();
            await checkNavbar(null, initialName);
            await checkProfilePages(null);
            expect(await evaluate("!document.getElementById('brand-info') && !document.getElementById('brand-services') && !document.querySelector('main a[href^=\"/patient/results\"]') && !Array.from(document.querySelectorAll('main summary')).some(element => /Live preview|Clinic information/.test(element.textContent))"), 'Removed branding sections must not appear in Settings.');
            expect(await callApi('PATCH', `/users/${managerId}/clinic-admin`, managerToken, { is_clinic_admin: true }) === 403, 'A manager must not self-grant.');
            expect(await callApi('PATCH', `/users/${managerId}/clinic-admin`, adminToken, { is_clinic_admin: false }) === 200, 'Administrator must be able to revoke permission.');
            await evaluate("window.dispatchEvent(new Event('focus'))");
            await until(() => evaluate("document.getElementById('brand-name').matches(':disabled')"), 'permission revocation refresh');
            expect(await callApi('PUT', `/branding/${clinicId}`, managerToken, {}) === 403, 'Revoked managers must be denied by the backend.');
            expect(await callApi('PATCH', `/users/${managerId}/clinic-admin`, adminToken, { is_clinic_admin: true }) === 200, 'Administrator must be able to restore permission.');
            await evaluate("window.dispatchEvent(new Event('focus'))");
            await until(() => evaluate("!document.getElementById('brand-name').matches(':disabled')"), 'permission grant refresh without signing out');
            await input('primary_color', primary);
            await input('secondary_color', secondary);
            await input('brand-name', name);
            expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Branding settings overflow a mobile viewport.');
            logoBytes = Buffer.from(index ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64');
            const logoFile = path.join(directory, `logo-${index}.png`);
            fs.writeFileSync(logoFile, logoBytes);
            const document = await send('DOM.getDocument');
            const node = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#brand-logo' });
            await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [logoFile] });
            await checkNavbar(null, initialName);
            await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save branding').click()");
            await until(() => evaluate("document.body.textContent.includes('Clinic branding saved.')"), 'save branding');
            await checkNavbar((await savedBrand()).logo_url, name, primary, secondary);
            await reload();
            await until(() => evaluate(`document.getElementById('brand-name')?.value === ${JSON.stringify(name)} && document.getElementById('primary_color')?.value === ${JSON.stringify(primary)}`), 'reload saved branding');
            expect(await evaluate(`document.getElementById('secondary_color').value === ${JSON.stringify(secondary)}`), 'Saved secondary color must survive reload.');
            const preservedContent = await savedBrand();
            expect(preservedContent.information === existingContent.information && JSON.stringify(preservedContent.services) === JSON.stringify(existingContent.services), 'Saving identity and colors must preserve existing hidden clinic information and services.');
            expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Saved branding overflows a mobile viewport.');
            await until(() => evaluate("Array.from(document.images).some(image => image.src.includes('/branding/public/') && image.complete && image.naturalWidth > 0)"), 'saved logo');
            await checkNavbar((await savedBrand()).logo_url, name, primary, secondary);
            await checkProfilePages((await savedBrand()).logo_url);
            const originalLogo = await db.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { branding_logo: true } });
            // Replace, remove and re-upload through the real form, not direct DB writes.
            const setLogo = async bytes => {
                logoBytes = bytes;
                fs.writeFileSync(logoFile, bytes);
                const document = await send('DOM.getDocument');
                const input = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#brand-logo' });
                await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [logoFile] });
            };
            const saveAndReload = async () => {
                await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save branding').click()");
                await until(() => evaluate("document.body.textContent.includes('Clinic branding saved.')"), 'logo change saved');
                const expectedLogo = (await savedBrand()).logo_url;
                await checkNavbar(expectedLogo, name, primary, secondary);
                await checkProfilePages(expectedLogo);
                await reload();
                await until(() => evaluate(`document.getElementById('brand-name')?.value === ${JSON.stringify(name)}`), 'logo change reloaded');
                await checkNavbar(expectedLogo, name, primary, secondary);
            };
            await setLogo(Buffer.from(index ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=' : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
            await saveAndReload();
            const replacementLogo = await db.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { branding_logo: true } });
            expect(replacementLogo.branding_logo && replacementLogo.branding_logo !== originalLogo.branding_logo, 'Replacement logo was not persisted.');
            await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Remove logo').click()");
            await saveAndReload();
            expect((await db.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { branding_logo: true } })).branding_logo === null, 'Logo removal was not persisted.');
            await setLogo(fs.readFileSync(logoFile));
            await saveAndReload();
            await until(() => evaluate("Array.from(document.images).some(image => image.src.includes('/branding/public/') && image.complete && image.naturalWidth > 0)"), 're-uploaded logo');
            failLogos = true;
            const failuresBefore = failedLogoRequests;
            await reload();
            await until(() => failedLogoRequests > failuresBefore && evaluate(`document.getElementById('brand-name')?.value === ${JSON.stringify(name)}`), 'actual missing-logo response and loaded settings');
            await checkNavbar(null, name, primary, secondary);
            await checkProfilePages(null);
            failLogos = false;
            await setLogo(fs.readFileSync(logoFile));
            await saveAndReload();
            const currentLogo = (await savedBrand()).logo_url;
            for (const width of [320, 390, 1440]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
                await checkNavbar(currentLogo, name, primary, secondary);
                const navbar = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: 240, scale: 1 } });
                fs.writeFileSync(path.join(artifacts, `clinic-${index ? 'b' : 'a'}-navbar-${width}.png`), Buffer.from(navbar.data, 'base64'));
            }
            await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.includes('My Profile')).click()");
            await until(() => evaluate("document.body.innerText.includes('Profile Details')"), 'existing profile settings tab');
            await checkProfileAvatar(currentLogo);
            await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.includes('Clinic branding')).click()");
            await until(() => evaluate(`document.getElementById('brand-name')?.value === ${JSON.stringify(name)}`), 'return to saved branding settings');
            const screen = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(path.join(artifacts, `clinic-${index ? 'b' : 'a'}-settings.png`), Buffer.from(screen.data, 'base64'));
            await navigate('/dashboard');
            await until(() => evaluate(`document.title.startsWith(${JSON.stringify(name)})`), 'staff dashboard title');
            await checkNavbar(currentLogo, name, primary, secondary);
            await navigate(`/login?clinic=${clinicId}`);
            await until(() => evaluate(`document.title.startsWith(${JSON.stringify(name)}) && document.body.textContent.includes(${JSON.stringify(name)})`), 'branded clinic sign-in');
            await navigate(`/patient/results?clinic=${clinicId}`);
            await until(() => evaluate(`document.body.textContent.includes(${JSON.stringify(name)}) && !!document.getElementById('resultId')`), 'patient portal branding');
            const code = String(100000 + Math.floor(Math.random() * 800000));
            await db.labResultAccess.update({ where: { lab_result_id: `tenant-result-${index}` }, data: { access_code_hash: await bcrypt.hash(code, 4) } });
            await input('resultId', `SYNTHETIC-${index}`);
            await input('accessCode', code);
            await evaluate("document.querySelector('form').requestSubmit()");
            await until(() => evaluate("document.body.textContent.includes('Verified Access')"), 'patient result authorization');
            await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
            expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Patient portal overflows a mobile viewport.');
            const patientScreen = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(path.join(artifacts, `clinic-${index ? 'b' : 'a'}-patient.png`), Buffer.from(patientScreen.data, 'base64'));
            await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
            console.log(`Browser checks passed for synthetic clinic ${index ? 'B' : 'A'}: login with no extra profile request, one shared focus/visibility refresh, Settings branding without preview/portal/information sections, hidden data preserved, clinic logo in both My Profile pages and navbar, upload/replacement/removal and reload, missing-logo fallback/recovery, permission grant/revoke, 320/390/1440px layouts, patient branding and access.`);
        }
    } catch (error) {
        console.error('Browser API checks: ' + JSON.stringify(apiChecks));
        console.error('Browser script errors: ' + JSON.stringify(browserErrors));
        console.error('Browser network: ' + JSON.stringify(network.slice(-30)));
        if (evaluate) {
            const visible = await evaluate('document.body.innerText.slice(0, 1000)').catch(() => 'Unavailable');
            console.error('Browser title: ' + await evaluate('document.title').catch(() => 'Unavailable'));
            console.error('Visible browser state: ' + String(visible).replace(/eyJ[A-Za-z0-9._-]+/g, '[token omitted]'));
            const screen = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
            if (screen) fs.writeFileSync(path.join(artifacts, 'browser-failure.png'), Buffer.from(screen.data, 'base64'));
        }
        throw error;
    } finally {
        // Close the actual browser through CDP: on Windows the launcher PID can
        // exit before Chrome's profile-owning processes have finished.
        if (socket?.readyState === WebSocket.OPEN) await new Promise(resolve => {
            const timer = setTimeout(resolve, 20000);
            socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
            // Chrome may close the connection before replying, so wait for close
            // rather than registering a request that would leave a pending timer.
            socket.send(JSON.stringify({ id: 2147483647, method: 'Browser.close' }));
        });
        socket?.close();
        stop(chrome); stop(api);
        await db.$disconnect();
        // The directory is generated by mkdtemp under the OS temp root.
        const absolute = path.resolve(directory);
        if (absolute.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(absolute).startsWith('frigo-browser-test-')) await fs.promises.rm(absolute, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

# Frigo Flow

Monorepo: a NestJS + Prisma (PostgreSQL) backend (`backend/`) and a Next.js frontend (`frontend/`).

## Local development setup

### 1. Prerequisites

- Node.js 20+
- Docker Desktop (for a local Postgres instance) — or point `DATABASE_URL` at any Postgres you already have running.

### 2. Install dependencies

```bash
npm install
```

### 3. Start a local database

```bash
docker compose up -d
```

This starts a Postgres 16 container on `localhost:5432` (user `frigoflow`, password `frigoflow_dev_password`, db `frigoflow`). Data persists in a Docker volume across restarts.

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

The defaults in these files are already wired to match each other and the Docker Postgres above — no edits needed for local dev. See `backend/.env.example` for what each variable does.

### 5. Create the database schema and seed demo data

```bash
npm run db:setup
npm run db:seed
```

### 6. Run the app

Start the database, API and frontend together in one terminal:

```bash
npm run dev
```

This checks the configured database, starts local Docker PostgreSQL if needed,
and waits for the API before starting the frontend. On Windows it can also
start Docker Desktop. Existing running services are reused. Keep this terminal
open while using the app; Ctrl+C stops the servers started by this command.
Database contents are retained, and this command does not seed or reset data.

To run the servers separately (with the database already running), use two terminals:

```bash
npm run dev:backend    # NestJS API on http://localhost:3001
npm run dev:frontend   # Next.js app on http://localhost:3000
```

Open the login URL printed by `npm run dev` (normally [http://localhost:3000/login](http://localhost:3000/login)). If another app occupies that port, the launcher chooses an available port between 3000 and 3010. The first backend compilation can take 1-2 minutes; keep the terminal open while the startup progress is shown.

> The frontend proxies `/api/*` to the backend (`next.config.ts` rewrites), so the browser only ever talks to `localhost:3000` — no CORS issues in dev.

## Test accounts (seeded by `npm run db:seed`)

| Email | Password | Role |
|---|---|---|
| `admin@frigolabs.com` | `admin123` | ADMIN |
| `emily@austinfamily.com` | `demo123` | CLINIC_USER — Austin Family Clinic |
| `mark@greenvalley.com` | `demo123` | CLINIC_USER — Green Valley Clinic |
| `sarah@westside.com` | `demo123` | CLINIC_USER — Westside Health Center |

These are local-development-only seed accounts (see `backend/prisma/seed.ts`) — never used in production.

## Registering a new clinic account

The "Register a clinic account" link on the login page (`/signup`) walks through:

1. Clinic + contact details + password → `POST /api/v1/auth/register`
2. A 6-digit email verification code → `POST /api/v1/auth/register/verify`, which creates the `Clinic` and `User` rows and logs the new user in.

Clinic registration requires working SMTP settings in `backend/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`. The SMTP account is the sender; the recipient is the email address entered by each clinic. Gmail is configured with `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=587`. Set `SMTP_USER` to the sending Gmail address and `SMTP_PASS` to its Google App Password, created with 2-Step Verification enabled. Restart the backend after changing these values. Port 465 uses implicit TLS; port 587 uses STARTTLS.

If credentials are missing or the mail server rejects the message, registration returns an error and the signup form does not claim a code was sent. Codes are not returned in the API response or printed in registration logs. Pending verification data is stored in the database to validate the emailed code; storing it is separate from email delivery.

## Architecture notes

### Clinic branding and tenant isolation

Clinic administrators can manage their clinic name, logo, primary/secondary colors, public information, and service descriptions at `/dashboard/branding`. Settings include a live preview, color contrast handling, and PNG/JPEG/WebP logo uploads up to 2 MB. Staff dashboards and clinic-specific sign-in and patient-result pages share the saved theme. Platform administration keeps Frigo Flow branding.

Dashboard navbars show the existing Frigo Flow logo first and the current clinic's uploaded logo alongside it, without clinic-name text. Saving a logo upload, replacement or removal refreshes the navbar immediately. Clinics without an uploaded logo, or with a logo that cannot load, show only the Frigo Flow logo. Clinic names remain in settings and patient pages.

For Supabase or another remote PostgreSQL database, logo files are stored as binary data in the private `ClinicLogo` table, linked to their clinic. The `Clinic` table stores the name, colors, information, services and logo filename. Upload/replacement and removal update the image and clinic reference in one transaction; the existing backend image endpoint serves validated image bytes. Remote databases never fall back to local logo files. `CLINIC_LOGO_STORAGE` can explicitly select `database` for tests or development; existing local-only databases retain filesystem compatibility. Keep `DATABASE_URL` and `DIRECT_URL` in the server's private environment. `docs/supabase-live-upgrade.sql` is the reviewed, one-time upgrade from the inspected legacy Supabase schema; it adds the missing application tables and branding columns without dropping existing data. Moving local records into an existing live project is a separate, explicitly authorized operation.

New uploaded lab report files are also stored in PostgreSQL, in the private `LabResultFile` table. The report record and its bytes are created atomically. Existing staff and patient download URLs retain their authorization checks. Apply `backend/prisma/migrations/202610290002_database_report_files/migration.sql` after the legacy Supabase upgrade. Remote database connections never read report bytes from the local filesystem; legacy local report files are not automatically copied.

The single complete application schema export is [docs/frigo-flow-schema.sql](docs/frigo-flow-schema.sql). It creates a fresh PostgreSQL/AWS database with all 16 application tables, relationships, indexes, tenant triggers and RLS flags. It contains no business records or credentials. Historical upgrade scripts and Prisma migrations are separate from this fresh-database export.

For an existing local database, apply the additive migration and regenerate the client before starting the updated backend:

```powershell
npm run db:branding --workspace=backend
npm run prisma:generate --workspace=backend
npm run dev
```

For a fresh local database, first use the existing `npm run db:setup`, then `npm run db:branding --workspace=backend` to install the ownership triggers. The local migration helper refuses remote databases. The reviewed migration for other environments is `backend/prisma/migrations/202610280001_clinic_branding/migration.sql`; this implementation does not deploy it to production. Stop local backend processes before client generation if Windows reports a locked Prisma engine DLL.

Existing users are **not** automatically promoted. A platform administrator should click the dashboard **Settings** gear, then **Branding permissions** (`/dashboard/settings/users`), and explicitly grant **Branding administrator** to a staff member already associated with the intended clinic. Managers with that permission see **Clinic Branding** in the dashboard navigation and can edit only their own clinic. Settings also has a direct **Clinic branding** link for platform administrators. Permissions refresh when returning to the app or navigating inside the dashboard, so an open session picks up grants and revocations; the API checks the current database permission on every request. Newly registered clinic owners receive that permission only for the clinic created by their registration. Public registration does not join an existing clinic.

To review:

1. Sign in as a platform administrator, select a clinic at `/dashboard/branding`, and grant its manager permission where appropriate.
2. Sign in as that clinic manager. Edit its settings, preview colors/logo, save, and reload. Service descriptions do not create Terra products or clinical results.
3. Use the **Patient results portal** link on the branding page. It carries an explicit clinic context using the existing clinic identifier, without custom domains. The patient entry page shows the clinic name, logo, and colors; clinic information and service descriptions remain saved in branding settings but are hidden on that page. No patient information is returned by the public branding API.
4. A patient still needs the result identifier and its matching, unexpired access code. Changing the clinic link never changes authorization. A valid code for a different result or clinic is rejected.
5. Repeat for a second clinic and check the separate theme and records. Clinic staff cannot select another clinic through URL or request-body IDs. Platform administrators retain clinic-management access.

Report files are no longer served as unrestricted static assets. The existing `/uploads/lab-results/:filename` URLs require staff authentication and result ownership; the patient report endpoint separately checks its access code and clinic. Preserve both `uploads/lab-results` and `uploads/clinic-logos` on durable storage and include them in backups. Existing filenames and record ownership are not rewritten. Legacy inconsistent ownership is not guessed or reassigned; an administrator must investigate such records.

Validic callbacks now require a server-only `VALIDIC_WEBHOOK_SECRET` and a matching Bearer authorization header configured on the trusted sender or forwarding gateway. They fail closed until configured. This is an application shared-header requirement, not a claim that the provider implements a particular signature standard. Shared legacy Validic patient identifiers are rejected when ambiguous; repair those mappings with verified provider information. No shared fallback patient or marketplace identity is assigned after provisioning failures. Existing shared links are blocked, ordinary patient responses omit marketplace bearer URLs, and only the ownership-checked connection endpoint returns a validated HTTPS link. JWT signing now requires the existing server-only JWT_SECRET configuration instead of a shared fallback key. Existing Terra HMAC verification, event deduplication, and transactional workflows remain in place.

Validation commands from the repository root:

```powershell
node node_modules/jest/bin/jest.js --config backend/package.json --runInBand
npm run test:tenants --workspace=backend
npm run test:branding --workspace=frontend
npm run build:backend
npm run build:frontend
```

The tenant test command creates a randomly named **disposable local database**, applies the complete schema and ownership migration, and exercises two synthetic clinics through real HTTP controllers and PostgreSQL. It removes only that database afterward. It does not enable the existing `AUTH_DB_TESTS` suites against application data. For optional headless Chrome checks, build the backend, run a local Frigo frontend, then:

```powershell
$env:TENANT_BROWSER_TESTS = '1'
$env:FRIGO_TEST_FRONTEND = 'http://localhost:3002'
npm run test:tenants --workspace=backend
Remove-Item Env:TENANT_BROWSER_TESTS
Remove-Item Env:FRIGO_TEST_FRONTEND
```

Browser checks use a temporary profile and fixture backend; API traffic is redirected to the disposable database. They sign in with passwords generated only for the disposable fixtures, grant manager access through Settings, check live grant/revoke permission refresh and unauthorized restrictions, and verify mobile navigation, live preview, logo upload/replacement/removal, every branding field after save/reload, staff/dashboard/sign-in branding, patient result access, and mobile layout for both clinics. Screenshots are saved under the ignored `.devtmp/branding-review` directory. `FRIGO_TEST_BROWSER` optionally selects a locally installed Chromium executable.

These changes enforce application/Prisma authorization and database ownership triggers; they do not configure PostgreSQL RLS or browser database access. They do not establish HIPAA compliance. Production hosting, private network/database access, TLS, encryption, durable storage/backups, audit/incident processes, provider BAAs, and legal/operational requirements need separate verification.

### Automatic Terra sandbox reports

Set `TERRA_SANDBOX_AUTO_REPORTS=true` in `backend/.env` and restart the backend to enable the development demo. It is disabled by default and always disabled when `NODE_ENV=production`. Apply the current Prisma schema and regenerate the client before starting the updated backend.

Add Patient offers the four original FrigoFlow workflow packages. These labels are not silently mapped to different Terra tests. Use Order Lab Test to select an actual Terra variant; successful sandbox orders receive a report job due five minutes after ordering. The registration API also supports explicitly supplying a supported `terra_variant_id`, which atomically schedules its report job. The worker checks every ten seconds and the visible Patient Card refreshes every fifteen seconds, so allow a little longer than five minutes for display. Upstream failures are retried and shown on the card; failed jobs can be retried there.

Jobs survive restarts. Database leases and result ingestion locks serialize job and report processing. Order creation retries a confirmed supplier failure once with a fresh Terra request key and the same client reference. The development backend must remain running for processing to continue. Essential Blood Panel and its variants are excluded from discovery and new ordering.

For sandbox demonstrations, the Order Lab Test form provides an explicit **Use sandbox test details** button. It fills synthetic recipient and valid US shipping details without changing the saved patient. International phone numbers must use E.164 format. US delivery requires a valid state code and ZIP. Supplier failures keep the selected test available and return an upstream-service error instead of incorrectly marking the variant unavailable for the rest of the session.

Reports are Terra sandbox fixtures, clearly labelled as simulated in the clinic and patient viewers. The five-minute demo does not apply to real clinical lab turnaround. Turning automation off stops processing pending jobs without deleting them.

- **Auth**: JWT (passport-jwt) issued on login/registration, stored in `localStorage` on the frontend (`AuthContext`) and sent as `Authorization: Bearer <token>`. Passwords are hashed with bcrypt.
- **Ports**: backend defaults to `3001`, frontend (Next.js) defaults to `3000`. Both are overridable via `PORT` (backend) and `BACKEND_URL` (frontend).
- **Production**: deployed separately (Render for the backend, Vercel for the frontend) with real `DATABASE_URL`/`JWT_SECRET`/SMTP credentials injected as platform environment variables — never committed.

## Email verification

Clinic registration uses Gmail SMTP from NestJS and a six-digit verification code. See [email verification setup](docs/email-verification.md) for the additive database migration, Gmail App Password configuration, API routes and tests. SMTP credentials are required for registration email delivery; existing verified accounts can still sign in while email is unavailable.

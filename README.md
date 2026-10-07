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

Open [http://localhost:3000/login](http://localhost:3000/login).

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

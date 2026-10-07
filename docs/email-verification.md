# Frigo Flow email verification

The application uses its existing NestJS/Prisma password and JWT authentication, not Supabase Auth. `User.email_verified` is the verification source of truth. Gmail SMTP delivery runs exclusively in NestJS through the existing Nodemailer `MailService`; no SMTP or service-role credentials reach the frontend.

The current local environment points at local PostgreSQL. Its database URLs were preserved. The migration also works with a Supabase PostgreSQL database, but has not been applied to a remote Supabase project.

## Gmail configuration

Enable 2-Step Verification on the sender Google account and create a Google App Password. Put its values in `backend/.env`, not in chat or frontend environment files:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=MY_SENDER_GMAIL
SMTP_PASS=MY_GOOGLE_APP_PASSWORD
SMTP_FROM_NAME=Frigo Flow
SMTP_FROM_EMAIL=MY_SENDER_GMAIL
```

Use the sender Gmail address for both email variables. SMTP_PASS is the App Password, not the normal Google password. The registering clinic's submitted email is the recipient. No Supabase SMTP setup is needed. Restart NestJS after changing these variables. Gmail credentials remain unset in this workspace, so actual inbox delivery requires this account-level setup.

SMTP startup checks log only missing/invalid variable names or generic connectivity errors. Missing credentials or a provider outage do not stop existing login/API functionality. Registration keeps a pending account and returns a safe 503 if delivery fails; resend can recover after the cooldown.

## Database and deployment

`backend/prisma/migrations/202609300001_email_verification/migration.sql` adds the verification flag, hashed challenge fields to the existing `OtpVerification` table, and durable `AuthRateLimit` buckets. Existing accounts retain access; new accounts default to unverified. Legacy plaintext challenges are cleared and invalidated. No clinic, user, patient, report or session is deleted.

The targeted migration is already applied to the configured local database. For another existing deployment without a Prisma migration baseline, apply that SQL in its database SQL editor, or run from `backend/` with the deployment database configured:

```sh
node scripts/apply-email-verification.cjs
npm run prisma:generate
npm run build
npm start
```

Do not reset the database or blindly run `db push` over existing users: the SQL explicitly preserves their verified status before switching the default for new accounts. With an established Prisma migration history, deploy the migration through that existing process. The script is idempotent and only applies this auth migration.

## Routes

All routes retain the `/api/v1` prefix:

| Method and route | Request / behavior |
| --- | --- |
| `POST /auth/register` | `{clinicName,contactName,email,phone,password}`; normalized email, pending account, send OTP |
| `POST /auth/register/verify` | `{email,otp}`; exactly six digits; verify and return the existing access/refresh token response |
| `POST /auth/register/resend` | `{email}`; replace challenge and resend |
| `POST /auth/login` | Existing password login; correct credentials for unverified accounts return 403 `EMAIL_NOT_VERIFIED` |
| `GET /auth/me` | JWT plus current database verification/clinic checks |
| `PATCH /auth/me` | Existing profile edits; changing email requires verification before replacing the old verified address |

OTP codes use `crypto.randomInt`, bcrypt hashing, a ten-minute expiry, a sixty-second resend cooldown and five failed attempts per challenge. PostgreSQL transactions/advisory locks serialize simultaneous attempts, resends and redemption. Used or replaced codes cannot be reused. Failed attempts commit before an error is returned. State and rate limits survive a backend restart.

Request limits: send routes share 10 requests per 15 minutes per IP and email, plus one request per minute per email. Login/verification each allow 30 requests per 15 minutes per IP, in addition to the five-attempt challenge limit. Unknown/verified emails receive generic send responses and the same request throttling. Rate errors include `retry_after` and a `Retry-After` header.

The frontend routes signup to `/verify-email`, supports six numeric boxes, paste, Enter, loading/duplicate protection and a persisted resend deadline. Only the email and resend context use sessionStorage; OTPs stay in React memory. Unverified login offers Verify Email. Confirmed email changes use the same screen. The existing JWT session handling is retained.

## Start and test

From `backend/`: `npm run build`, then `npm start`. Local API: `http://localhost:3001/api/v1`.

From `frontend/`: `npm run dev`. Open `http://localhost:3000/signup`, register with an inbox you control, enter the emailed code and check dashboard access. After Gmail configuration, check the actual inbox/spam folder; mocked SMTP tests cannot prove delivery.

Run auth/mail tests from `backend/`:

```sh
npm test -- --runInBand src/auth/registration.spec.ts src/mail/mail.service.spec.ts src/mail/smtp.config.spec.ts
```

Optional database integration tests (PowerShell) create and remove only unique `@example.invalid` fixture accounts and never send actual mail:

```powershell
$env:AUTH_DB_TESTS='1'
node --env-file=.env ../node_modules/jest/bin/jest.js --runInBand src/auth/email-otp.integration.spec.ts
```

They cover pending registration, hash-only storage, verification, concurrent invalid attempts, five-attempt invalidation, expiry, cooldown, replaced-code rejection, one-time/concurrent redemption, restart persistence, SMTP failure/recovery, generic responses, email changes and durable rate limits. Frontend/browser checks use intercepted API responses so they do not create real clinic or lab orders.

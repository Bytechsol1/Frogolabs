# Frigo Flow email verification

The application uses NestJS/Prisma password and JWT authentication, not Supabase Auth. `User.email_verified` is the verification source of truth. Registration records live in the PostgreSQL database configured on the backend, including Supabase PostgreSQL. Supabase Auth email settings do not configure this application.

Mail uses the existing SMTP provider. Credentials stay on the server and never reach browser code. Direct SMTP remains available locally and on hosting that permits outbound SMTP.

Verification and resend emails use `backend/src/mail/verification-email.ts`: the Frigo Flow logo, gold/cream card, six separated code digits, ten-minute expiry and security footer. The plain-text alternative retains the complete code. Both direct SMTP and the Vercel mail function attach the unchanged `frontend/public/logo.jpg` as an inline CID image, so the HTML does not depend on downloading a remote logo. The mail endpoint only attaches this fixed asset and never accepts attachment paths from a request. Next.js explicitly includes the asset in the function trace. Deploy both backend and frontend updates for the new embedded-logo template; no new environment variables are needed. A backend-only package must retain the existing logo at its monorepo path.

The layout uses compact inline styles as its mobile fallback, with desktop enhancements in media queries. The heading spans the full card width; its envelope icon shares the small label row instead of narrowing the headline. Logo blending is removed and the embedded original image has a white backing for visibility on dark backgrounds. Separate dark-mode rules provide readable card/text colors where supported. Browser previews cover 280/320/360px widths, light/dark color preferences, missing header CSS and enlarged text; native email apps may apply additional transformations. Inspect newly sent messages after deploying a template change.

## Direct SMTP configuration

Configure these private variables in `backend/.env` or the backend hosting environment. Gmail is one example; retain your existing provider's host, port and credentials when using another SMTP service:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=MY_SENDER_GMAIL
SMTP_PASS=MY_GOOGLE_APP_PASSWORD
SMTP_FROM_NAME=Frigo Flow
SMTP_FROM_EMAIL=MY_SENDER_GMAIL
```

For Gmail, enable 2-Step Verification and use an App Password. For another provider, use its SMTP authentication details. The clinic's submitted email is the recipient. Restart/redeploy the backend after configuration changes.

SMTP startup checks log only missing/invalid variable names or generic connectivity errors. Missing mail configuration does not stop existing verified accounts signing in. If registration email is rejected or times out, the new clinic, user and challenge roll back together and registration returns 503 `EMAIL_DELIVERY_FAILED`. The form stays on signup and explains the delivery failure. Network delivery has an unavoidable acknowledgement window: a mail server can accept a message before a subsequent transaction/network failure; request a fresh code if that happens.

An existing unverified account returns 409 `EMAIL_NOT_VERIFIED` on signup. The browser opens `/verify-email` without falsely claiming a code was sent; request a new code there. Existing account details and passwords are preserved. Resend failure keeps the pending account, invalidates the failed challenge, and permits another resend after the cooldown. Verified addresses belonging to existing clinics or platform accounts still return `EMAIL_ALREADY_REGISTERED`. No unverified user can bypass verification.

If someone manually deletes only a `Clinic` row in Supabase, the existing foreign key leaves its staff `User` rows with `clinic_id = NULL`. Those hidden accounts previously kept their email reserved. Signup now supports mailbox-verified recovery for a `CLINIC_USER` with no clinic, provided no existing clinic or other account reserves the same case-insensitive email. It stages the new clinic/contact details and a password **hash** in `OtpVerification.pending_data` with purpose `ORPHAN_REGISTRATION`; it does not change or delete the old account at signup. Resend preserves that staged registration. A valid OTP rechecks the orphan state, creates a fresh clinic and user in one transaction, retires the old orphan identity and clears staged data/challenges. The fresh user ID revokes old JWTs. Failed delivery rolls staging back; wrong/expired codes, reassigned memberships and existing administrator/active/disabled accounts cannot trigger replacement. This uses existing text/JSON columns and needs no schema migration.

The signup form always rechecks availability on retry instead of permanently caching an earlier duplicate-email response. For future clinic removal, prefer the admin portal's confirmed **Delete Clinic** action, which removes associated app records together. Recovery does not reclaim an existing clinic whose user was separately deleted, because that clinic may still own data.

## Existing SMTP on Render Free and Vercel

[Render Free blocks outbound SMTP ports 25, 465 and 587](https://render.com/docs/free). [Vercel Node.js Functions permit SMTP on 465 and 587](https://vercel.com/kb/guide/serverless-functions-and-smtp). Keep the SMTP provider by sending from a private Vercel server function, called over HTTPS by Render. No new email provider or sending domain is needed.

Deploy in this order:

1. In **Vercel → project → Settings → Environment Variables → Production**, add the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`. Add a strong random `MAIL_BRIDGE_SECRET` (at least 32 characters), kept private. These are server-only names; do not prefix them with `NEXT_PUBLIC_`. Use your provider's submission port 465 or 587, not 25.
2. Deploy this frontend code. It adds Node.js `POST /api/internal/mail`; this exact route takes precedence over the general `/api/*` backend rewrite. Requests require the private Bearer secret and validated, bounded message fields. Sender identity is fixed by private SMTP configuration. Browser-originated requests are rejected. The function awaits SMTP acceptance before acknowledging delivery, disables caching and never returns provider error details.
3. In **Render → backend → Environment**, add `MAIL_BRIDGE_URL` pointing to the production frontend's `/api/internal/mail` endpoint, plus the **same** `MAIL_BRIDGE_SECRET`. Save and deploy this backend code. These take precedence over direct SMTP. Do not change `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` or `BACKEND_URL` for this email fix.
4. Retry signup using an inbox you control. For a previously pending signup, request a code from the verification screen. Check inbox/spam, verify, then sign in. Mocked delivery tests and SMTP authentication checks cannot prove inbox delivery.

Both bridge variables must be complete or mail fails safely. Do not use an authenticated Vercel preview URL as the bridge endpoint. SMTP credentials need only be on Vercel for this mode. Local development can leave both bridge variables unset and keep direct SMTP. OTPs, expiry, users, clinic data and rate limits continue to be managed by NestJS and PostgreSQL.

## Database and deployment

`backend/prisma/migrations/202609300001_email_verification/migration.sql` adds the verification flag, hashed challenge fields to the existing `OtpVerification` table, and durable `AuthRateLimit` buckets. Existing accounts retain access; new accounts default to unverified. Legacy plaintext challenges are cleared and invalidated. No clinic, user, patient, report or session is deleted.

This delivery fix needs no schema changes. For an older deployment missing the email verification columns, inspect its schema first. With no Prisma migration baseline, apply that SQL in its database SQL editor, or run from `backend/` with the intended deployment database configured:

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

The frontend routes signup to `/verify-email`, supports six numeric boxes, paste, Enter, loading/duplicate protection and a persisted resend deadline. Only the email, resend context and screen-completion marker use sessionStorage; OTPs stay in React memory. Successful verification returns JWTs and the safe authenticated user profile together. The backend uses the same verification, active-clinic and membership policy as JWT requests, and never includes password hashes. The frontend installs that server-returned profile and token together and immediately opens the dashboard, without waiting for another `/auth/me` request or asking for a password. Later requests still check the JWT and current database permissions. Authentication responses disable caching.

A successful verification closes the code/resend form immediately. With an older backend lacking the profile response, existing `/auth/me` loading remains supported; a temporary failure offers retrying the dashboard instead of password sign-in or another consumed code. Reloading a completed verification resumes the stored session automatically. A successful server-confirmed profile clears the matching context. Revisiting verification with an already verified matching session returns to the dashboard; a pending change to a different email can still be verified. The completion marker only controls the screen and never grants authentication or changes database verification flags. Unverified login offers Verify Email. Confirmed email changes use the same screen. Deploy both backend and frontend updates for direct session initialization; no schema or email configuration changes are needed.

## Start and test

From `backend/`: `npm run build`, then `npm start`. Local API: `http://localhost:3001/api/v1`.

From `frontend/`: `npm run dev`. Open `http://localhost:3000/signup`, register with an inbox you control, enter the emailed code and check dashboard access. Check the actual inbox/spam folder; mocked SMTP tests cannot prove delivery.

Run auth/mail tests from `backend/`:

```sh
npm test -- --runInBand src/auth/registration.spec.ts src/mail/mail.service.spec.ts src/mail/mail.config.spec.ts src/mail/smtp.config.spec.ts
```

Database integration tests create a fresh disposable PostgreSQL 16 container bound only to loopback, load the schema and remove the container afterward. Docker Desktop must be running. They never load the application's `.env` or send actual email:

```powershell
npm run test:email
```

They cover registration/login, hash-only storage, verification, concurrent attempts, expiry, cooldown, replaced-code rejection, one-time redemption, restart persistence, failed-email rollback, legacy pending-account recovery, email changes and rate limits. A one-connection test pool also checks that rollback does not deadlock. Test the Vercel SMTP handler from `frontend/` with `node tests/smtp-delivery.test.mjs`; it tests authentication, validation, acceptance and safe failures without contacting a real mail server.

After `npm run build:frontend` from the repository root, run `node backend/scripts/browser-email.cjs`. It starts a separate local production frontend and headless Chrome, verifies that the authenticated mail route takes precedence over the backend rewrite, and intercepts all application API requests. It covers failed signup delivery, verified duplicates, new signup, pending-account recovery, resend failure/retry, wrong OTP rejection and verified dashboard access. It also simulates a profile outage after accepting a code and asserts direct dashboard access with no password login, checks session restoration, revisits verification with an authenticated session, tests one-code verification with the actual button and Enter key, and confirms server-revoked access remains restricted. It never connects to the application database or sends email. Set `FRIGO_TEST_BROWSER` to the Chrome executable path when it is not installed in the default Windows location. Both local processes and the temporary browser profile are removed afterward.

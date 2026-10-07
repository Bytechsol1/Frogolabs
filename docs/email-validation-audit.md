# Email validation audit

Implemented on 2026-10-01. Scope: all existing email inputs, email-bearing HTTP routes and mail delivery entry points in Frigo Flow.

## Rules and normalization

Updated 2026-10-02: every user-entered email uses generic format validation. The former Gmail-only checks and login-only admin exception in `backend/validation/index.js` were removed. This policy supersedes earlier provider restrictions documented in the historical checks below.

- Frontend and backend import the same Zod schema from the local `@frigo-flow/validation` package in `backend/validation`.
- Required fields reject empty/whitespace-only values. Optional patient and clinic emails may be omitted or explicitly cleared; omitted update fields remain unchanged.
- Leading/trailing whitespace is trimmed; addresses are lowercased using the application's existing account normalization policy. Dots, underscores and plus tags are preserved.
- Valid email syntax is accepted regardless of provider, including custom domains, multi-part domains and plus tags. There is no domain whitelist or automatic domain correction.
- Rejects missing local/domain parts, missing domain suffix, consecutive local-part dots, internal whitespace, overlong addresses (254 characters maximum), non-string payloads and header-injection input.
- Required name, password, confirmation and phone validation are unchanged.
- User input is never auto-corrected to Gmail. Arbitrary mistakes in a mailbox name cannot be detected from syntax; OTP verification still establishes inbox access.
- SMTP sender configuration, delivery to previously stored recipients and internal reserved sandbox addresses use the syntax-only `mailboxEmailSchema`. Public Terra order requests enforce valid email syntax and a valid US phone before reaching the service; the internal sandbox retains `sandbox@example.com`.
- Format validation cannot prove a mailbox exists. Signup and account-email changes retain the existing OTP ownership verification; a format-valid domain is not automatically a verified account.
- All invalid or missing required email inputs show only `Please enter a valid email address`. Inputs preserve raw text, validate immediately on change as well as blur and submit, clear errors as corrected, and expose accessible error descriptions. Submitted payloads are normalized. Email fields use `inputMode="email"` without native email-validation popups. Clinic signup uses its explicit form validation so native checks on another empty field cannot hide the required-email error.

## Current change files and verification

Production changes:
- `backend/validation/index.js`: all email schemas share generic Zod syntax validation; required error is `Please enter a valid email address`.
- `frontend/src/app/signup/page.tsx`: same fallback error and a neutral custom-domain placeholder, preserving the layout.

Regression coverage changes:
- `backend/validation/email.test.js`
- `backend/validation/forms.test.js`
- `backend/src/auth/registration.spec.ts`
- `backend/src/auth/email-otp.integration.spec.ts`
- `backend/src/common/email-endpoints.spec.ts`
- `backend/src/mail/mail.service.spec.ts`
- `docs/email-validation-audit.md` (this report)

The frontend input, signup submit handler, verification-context helper, resend/verify screens and login already use this shared package. Backend DTOs, rate-limit/Passport guards, registration service, OTP service and user lookup inherit the same fix. Mail delivery already sends to the supplied recipient; its sender SMTP configuration is independent of the recipient domain. User/clinic email fields are ordinary unique strings with no provider constraint, so no database migration or stored-address rewrite is needed.

Current checks (2026-10-02):
- Shared email schema: 47 passed; shared patient/profile forms: 4 passed.
- Backend default suite: 427 passed; 19 opt-in integration tests skipped by default.
- Explicit database OTP suite: all 16 passed, including real persistence, resend, verification and password login for Gmail, Yahoo, Outlook and a custom clinic domain. Fixture records were removed afterwards.
- Exact requested 10 valid addresses passed HTTP signup/resend/verification/login-boundary checks and browser signup-to-OTP navigation; the 7 malformed examples were rejected with the required message.
- Duplicate signup browser regression passed: remains on signup, inline error survives blur/retry, changing to a new address permits verification.
- Mocked mail transport checks confirm all 10 supplied recipient addresses are passed through to SMTP without provider rewriting.
- Frontend typecheck and backend build passed.
- Full frontend lint ran: 72 existing errors and 31 warnings. Targeted signup/shared-helper lint reports the existing signup `catch (err: any)` error and `<img>` warning; no unrelated cleanup was included.
- Repository-wide before/after searches found no remaining executable Gmail-only restrictions. Remaining Gmail mentions are UI examples, tests, SMTP sender configuration, or historical documentation. Database tests use isolated fixture accounts and remove them afterwards. SMTP and browser mutation requests are mocked; no real verification emails or lab orders are sent.

## Frontend inventory

| Screen/component | Email field | Required | Coverage |
| --- | --- | --- | --- |
| `/login` | Physician email | Yes | Inline validation; normalized login payload |
| `/signup` | Clinic/account email | Yes | Inline validation before registration/OTP request |
| `/verify-email` | Verification email/context | Yes | Validate resend and verification; invalid stored context exposes editable field |
| `/dashboard/profile` | Account email | Yes | Validate before profile update and OTP transition |
| `/dashboard/settings` | My Profile email | Yes | Validate before update; corrected verification-required response handling |
| `/dashboard/patients/add` | Patient email | Required for lab orders | Saving without an order permits empty contacts; opening an order requires a valid email and valid primary +1 phone, with inline errors and focus on the first invalid field |
| `AddPatientDialog` | Patient email | No | Validated submit and inline errors; component currently has no importing route |
| `OrderLabTestModal` | Recipient email | Yes | Validate before patient creation/order placement |
| `/dashboard/clinics/add` | Admin contact email | No | Blur/change and Initialize Clinic button validation |

Read-only email displays, user-directory search, the patient Result ID/access-code portal and signed integration webhooks do not create editable email fields. No forgot/reset-password, invitation, provider-create or staff-create email endpoint exists in this repository. These were searched rather than assumed covered.

## HTTP endpoint inventory

All paths below are prefixed with `/api/v1`. Invalid email-bearing requests are rejected with the existing Nest HTTP 400 response shape before their business writes or mail actions. Authentication/authorization still applies to protected endpoints.

| Method and route | Input | Rules |
| --- | --- | --- |
| `POST /auth/login` | `email` | Required; validated before rate-limit storage, Passport and user lookup |
| `POST /auth/register` | `email` | Required; shared registration DTO and service validation |
| `POST /auth/register/resend` | `email` | Required; shared DTO/service validation |
| `POST /auth/register/verify` | `email` | Required; shared DTO/service validation |
| `PATCH /auth/me` | `email` | Optional property; if supplied must be a nonempty valid address |
| `POST /patients` | `email` | Optional, normalized; validated before Terra preparation and patient write |
| `PUT /patients/:id` | `email` | Optional; omitted value preserves current address; blank/null clears it |
| `POST /clinics` | `email` | Optional, normalized; case-insensitive duplicate check |
| `PUT /clinics/:id` | `email` | Optional; normalized update and duplicate check excluding current clinic |
| `POST /terra/orders` | `recipient.email` | Required; controller and order normalization validate before order placement |
| `POST /lab-results/:id/access/send` | Stored patient email, not a body email | Revalidate saved recipient before mail delivery |

Internal user create/update/lookup helpers, OTP registration/resend/verify/email-change services, SMTP configuration, OTP/result delivery and notification delivery also use the shared validator.

## Database and security

- No database migration or existing account rewrite was necessary. User and clinic uniqueness remains enforced by Prisma/database constraints; existing case-insensitive account lookup remains intact. Patient email remains non-unique so shared family/contact addresses are not broken.
- Clinic duplicate validation uses normalized case-insensitive lookup and handles concurrent database uniqueness errors with a safe message.
- Patient/clinic request bodies accept typed flat fields; arbitrary nested Prisma writes and `{email: {set: ...}}` cannot bypass validation.
- Existing JWT, password verification, OTP expiry/attempt rules and generic resend behavior remain intact. Duplicate signup returns HTTP 409 with `EMAIL_ALREADY_REGISTERED` and stays on the signup form.
- No new raw SQL string interpolation or HTML rendering of input was added. Existing parameterized queries and React escaping remain in use. New validation errors contain no supplied address, password, token or provider exception.

## Files changed for this audit

Paths are relative to the repository root. Other pre-existing workspace changes are outside this audit.

| File | Change |
| --- | --- |
| `backend/validation/package.json` | Local reusable package using the existing Zod dependency |
| `backend/validation/index.js` | Required/optional schemas, normalization and inline validation messages |
| `backend/validation/index.d.ts` | Typed public exports without validation-bypassing `any` |
| `backend/validation/email.test.js` | Shared schema tests |
| `backend/package.json` | Local validation package dependency |
| `frontend/package.json` | Same local validation package dependency |
| `package-lock.json` | Local package dependency resolution |
| `backend/Dockerfile` | Copy validation package before backend dependency installation |
| `backend/src/common/email-validation.ts` | Shared-schema exports and safe Nest 400 wrappers |
| `backend/src/common/email-records.dto.ts` | Typed flat patient/clinic create/update schemas |
| `backend/src/common/email-endpoints.spec.ts` | HTTP-boundary validation, normalization and duplicate tests |
| `backend/src/auth/auth.dto.ts` | Reuse shared email schema; allow valid custom domains |
| `backend/src/auth/auth-rate-limit.guard.ts` | Validate/normalize before rate-limit persistence |
| `backend/src/auth/guards/local-auth.guard.ts` | Validate email before Passport credential handling |
| `backend/src/auth/auth.service.ts` | Validate login/profile service entry points |
| `backend/src/auth/email-otp.service.ts` | Validate registration, resend, verify and email-change entry points |
| `backend/src/auth/registration.spec.ts` | Custom-domain acceptance, malformed rejection and login regressions |
| `backend/src/auth/email-otp.integration.spec.ts` | Valid +1 fixture for existing opt-in integration scenarios |
| `backend/src/users/users.service.ts` | Normalize/validate email lookup and writes |
| `backend/src/clinics/clinics.controller.ts` | Accept unknown request input for schema validation |
| `backend/src/clinics/clinics.service.ts` | Validate create/update; preserve duplicate protection |
| `backend/src/patients/patients.controller.ts` | Accept unknown request input for schema validation |
| `backend/src/patients/patients.service.ts` | Validate records before integration/database operations |
| `backend/src/patients/patients.service.spec.ts` | Complete patient-name fixtures for typed record validation |
| `backend/src/terra/order-validation.ts` | Shared required recipient email validation |
| `backend/src/terra/terra.controller.ts` | Validate nested recipient at HTTP boundary |
| `backend/src/terra/terra.service.ts` | Normalize/validate order before patient lookup; preserve supplier configuration guards |
| `backend/src/mail/smtp.config.ts` | Shared sender-address validation/normalization |
| `backend/src/mail/mail.service.ts` | Validate OTP/report recipients before transport |
| `backend/src/mail/mail.service.spec.ts` | Recipient normalization and header-injection rejection tests |
| `backend/src/notifications/notifications.service.ts` | Validate recipient and configured sender |
| `backend/src/lab-results/lab-results.service.ts` | Revalidate stored patient recipient before sending access details |
| `frontend/src/lib/email-validation.ts` | Frontend shared-package exports |
| `frontend/src/lib/use-email-validation.ts` | Reusable submit-validation state |
| `frontend/src/components/ui/email-input.tsx` | Consistent accessible inline validation and blur/change behavior |
| `frontend/src/lib/email-verification.ts` | Normalize/validate saved verification context |
| `frontend/src/app/login/page.tsx` | Shared input, submit guard and normalized payload; retain icon alignment with errors |
| `frontend/src/app/signup/page.tsx` | Shared input/schema instead of Gmail-only rules |
| `frontend/src/app/verify-email/page.tsx` | Guard resend/verify and show editable invalid email context |
| `frontend/src/app/dashboard/profile/page.tsx` | Shared validation; additionally remove the three requested helper lines and email-note arrow |
| `frontend/src/app/dashboard/settings/page.tsx` | Shared validation and verification-required profile response handling |
| `frontend/src/app/dashboard/patients/add/page.tsx` | Optional email validation and normalized create/order data |
| `frontend/src/app/dashboard/patients/AddPatientDialog.tsx` | Optional shared validation; safe submission error display |
| `frontend/src/app/dashboard/clinics/add/page.tsx` | Controlled email and inline/button validation |
| `frontend/src/components/patients/OrderLabTestModal.tsx` | Required shared validation before patient/order submission |

## Historical checks and limitations

These results describe earlier revisions, including superseded domain restrictions; see the current verification section above for this change.

| Check | Result |
| --- | --- |
| Shared schema (`node backend/validation/email.test.js`) | 27 passed, including the provider-domain typo follow-up |
| Initial audit backend Jest suite (`node ../node_modules/jest/bin/jest.js --runInBand`, from backend) | 257 passed; 9 database integration tests skipped by their existing opt-in flag |
| Follow-up HTTP boundary and registration suites | 193 passed, including 134 HTTP boundary cases across all 10 email-input routes |
| Frontend TypeScript (`tsc --noEmit`) | Passed, including after the requested profile text cleanup |
| Frontend production build | Passed |
| Backend build | Passed |
| Targeted frontend lint | Passed for shared input/validation/hook/context helper, clinic form and patient dialog |
| Full frontend lint | 75 existing errors and 30 warnings remain across the repository |
| Browser forms, mocked requests | All 8 active screens checked: login, signup, OTP resend, profile, account settings, patient creation, clinic email and lab-order recipient. Invalid inputs blocked submission and preserved typed values; corrected values cleared inline errors; normalized payloads and signup/profile OTP transitions checked |
| Live application login through frontend proxy | Malformed email returned 400; existing account with surrounding spaces and uppercase email returned 200 |
| Clinic signup follow-up | Browser confirmed immediate typing errors, required empty-email errors, blocked invalid submission and successful normalized valid submission with mocked API. Live registration API returned 400 for missing-dot and `gml.com`, `gmai.com`, `gmail.con` cases |

Validation tests use mocked mail/database boundaries; browser checks intercept API calls and do not create real accounts, patients or lab orders. Existing database-backed OTP integration tests require explicit opt-in and are not part of the default test run.

The admin `/dashboard/clinics/add` screen already had an unwired Initialize Clinic action. Its email field is now validated, and the actual create/update API is validated, but this audit does not invent a new clinic-creation workflow. The unused `AddPatientDialog` was updated and typechecked; the active add-patient route is covered by browser checks.

Whole-repository frontend lint has existing errors outside the shared validation implementation (including existing `any` annotations and effect-state rules). New shared validation files and the clinic/dialog integrations pass targeted lint. No real OTP delivery test was performed; sender and recipient handling were tested with mocked transport.

## Patient contact follow-up

The active Add Patient page and legacy patient dialog now validate both primary and secondary phone with the shared `optionalUsPhoneSchema` using the existing `libphonenumber-js/max` library. Only valid +1 numbers are accepted; national US formatting is supported and normalized to E.164 on submission. Other country codes, incomplete/impossible numbers, extensions, arbitrary text and nested payload objects are rejected. Patient email continues to use the clinic form's generic format checks. Existing optional contact fields remain optional; an omitted update preserves the stored field and an explicit blank clears it.

Inline errors appear while typing and on blur/submit. Invalid contact values block patient save and opening the new-patient lab order modal. Contact details edited inside the order modal are revalidated before creating the patient. The backend applies the same rules on patient create/update before database or integration writes.

Validation: 161 HTTP/patient-service checks passed, 3 phone-schema and 27 email-schema tests passed, frontend typecheck and targeted lint passed. Browser checks confirmed invalid email and both phone fields block save/order, correction clears errors, normalized valid payloads are sent, and optional blanks work. Browser requests were mocked; no patient records were created by these checks.

## Full-form blocking validation follow-up

The Add Patient page now runs a single shared Zod patient-details schema before either saving or opening the lab-order step. It revalidates the merged recipient details immediately before patient creation from the lab-order modal, including before returning an already-saved patient ID. First name, last name, address and postal code reject missing, null and whitespace-only values with individual inline messages. Optional email, primary/secondary +1 phones, real non-future DOB and valid gender selections are checked when entered. Age remains calculated/read-only. Patient postal code is required; country-specific shipping ZIP validation remains in the lab-order validator.

Both Profile and Settings/My Profile validate the entire name/email pair before any PATCH or OTP transition. Email remains required there, is trimmed/lowercased on submission, and rejects the exact malformed examples in the request. Full name is required. Failed validation keeps all values, focuses/scrolls to the first invalid field, shows accessible inline errors, and sends no API call. Correcting a field clears its message. Native form validation cannot short-circuit the application's submit validation.

Backend `POST /api/v1/patients` requires all four mandatory patient fields. `PUT /api/v1/patients/:id` retains existing partial-update semantics: omitted fields are unchanged, but supplied mandatory fields cannot be cleared. Both reject malformed email/phone/date/gender and nested write payloads before integration/database operations. `PATCH /api/v1/auth/me` rejects supplied empty names/emails and malformed input, including at the service entry point. Email-change OTP still follows the existing ownership-verification flow. Existing registration/resend/verify routes retain their shared email checks.

The complete lab-order form was inspected: category, product, variant, supported collection type, recipient name/email/phone/DOB/gender, conditional shipping address/city/state/postal code, and consent are checked before the create-patient callback and order POST. Opening that modal no longer depends on browser `reportValidity()`; the entire parent patient form must pass first.

Files changed for this follow-up:

| File | Purpose |
| --- | --- |
| `backend/validation/index.js`, `index.d.ts` | Shared required patient fields, DOB/gender, complete patient/profile schemas and field-error helpers |
| `backend/validation/forms.test.js`, `package.json` | Required-field, contact, date, dropdown and profile regression tests/test command |
| `backend/src/common/email-records.dto.ts` | Enforce shared patient fields on create/update and return field-specific validation messages |
| `backend/src/auth/auth.dto.ts`, `auth.service.ts` | Shared name validation and profile service-boundary validation |
| `backend/src/common/email-endpoints.spec.ts`, `patients/patients.service.spec.ts` | Missing/blank mandatory-field, malformed-input and no-side-effect API tests; complete valid fixtures |
| `frontend/src/lib/use-form-validation.ts` | Shared submit/blur error state, focus/scroll, reset and accessible field attributes |
| `frontend/src/components/ui/field-error.tsx` | Reusable inline field error rendering |
| `frontend/src/app/dashboard/patients/add/page.tsx` | Validate whole form on Save and Order; revalidate merged callback details; normalize only validated payloads |
| `frontend/src/app/dashboard/patients/AddPatientDialog.tsx` | Apply same blocking behavior to legacy patient dialog |
| `frontend/src/app/dashboard/profile/page.tsx` | Whole-profile validation before API, inline errors and focus |
| `frontend/src/app/dashboard/settings/page.tsx` | Same behavior for My Profile editor |

Checks: 337 backend tests passed; 9 existing opt-in database integration tests skipped. All 33 shared schema tests passed. Frontend typecheck and targeted lint passed. Full frontend lint reports 73 errors/30 warnings in existing code; this validation implementation adds no new lint rule failures. Browser tests passed patient cases A–F, missing postal code, whitespace-only fields, optional/invalid/valid emails, future DOB, both Save/Order paths, error correction and focus. Both profile editors passed cases A–D, empty name and padded-email normalization. All mutation requests in browser tests were intercepted; no real patients/profiles were changed.

Remaining limits: no requested active field was left without blocking validation. The unused legacy patient dialog was typechecked rather than mounted in a route. Real OTP delivery and opt-in database integration tests were not run. Format checks do not prove mailbox/phone ownership; OTP verification remains required for account-email changes.

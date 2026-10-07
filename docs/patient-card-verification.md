# Patient Card fixes and verification — 26 September 2026

The clinic workflow controls and Terra report synchronization are implemented. The later login failure was caused by the local API and Docker/PostgreSQL being stopped. Both were restarted without resetting data. Admin authentication and profile requests returned 200, and the actual browser login form reached the Dashboard.

## Why Completed and Payment Processing differed

`Workflow.status` and `WorkflowHistory` track FrigoFlow's internal care workflow. `TerraOrder` tracks Terra fulfilment and laboratory results. They share a patient, but there is no `TerraOrder.workflow_id` relationship. Completing the internal workflow neither progresses a Terra order nor creates a `LabResult`.

The Kidney Function order really was `order.payment_processing` at Terra, with `results.awaiting_sample`. Its remote history contained only those initial states. There was no evidence of a missed progression webhook for this order at the start of the investigation. The local row had also omitted the initial item ID and result status. Reconciliation filled these from Terra without creating a new order.

The previously configured temporary webhook URL was unreachable. A working temporary Cloudflare callback was registered for this sandbox. It depends on the local tunnel and API remaining running; it is not a permanent hosted webhook endpoint.

Automatic workflow mapping was deliberately not added: the schema cannot identify which manual workflow a Terra order belongs to. Both statuses are now explicitly labeled and remain separate. Internal `COMPLETED` remained unchanged throughout the sandbox test.

## Exact order mapping

| Field | Before investigation | After sandbox verification |
| --- | --- | --- |
| Patient ID | `7514a51c-5a9b-4ee5-a8ac-37fdab03f3d6` | Same |
| Local TerraOrder ID | `89df4637-4b51-4711-9ebe-0d85f169d087` | Same |
| terra_order_id | `361965675426791424` | Same |
| terra_order_status | `order.payment_processing` | `order.delivery_fulfilled` |
| results_status | `null` locally; Terra reported `results.awaiting_sample` | `results.results_ready` |
| terra_order_item_id | `null` locally | `361965675426791427` |
| terra_test_taker_id | `null` | `361974242699558912` |
| lab_result_id | `null` | `27de3bd6-9d6a-43fd-b44f-9b3886510eb9` |

The existing order was progressed through Terra's sandbox simulator: payment complete, processing, delivery fulfilled, kit activated, sample processing, partial results, then final results. No new order was placed.

Terra returned HTTP 500 for the partial-results download request. FrigoFlow retained the actual partial-ready status, returned a retryable failure, and did not fabricate a report or mark the failed event processed. The final-results request returned 200 and supplied a real Terra sandbox FHIR bundle with 10 biomarkers.

Final webhook event `361982375130083328` was confirmed by Terra's delivery ledger as `delivered`, HTTP 201, one attempt. The signed webhook created the report listed above. Concurrent authenticated reconciliation requests both succeeded and retained exactly one report, visible through both the Patient Card API and Lab Results Center API.

Sandbox lifecycle and API shapes were checked against [Terra's official Vantage example](https://github.com/tryterra/terra-examples/tree/main/examples/vantage-web-app/src/server/lib/vantage).

## Authorization and behavior

- The existing Patient Card button, modal, statuses, and PATCH API now support the existing `CLINIC_USER` role as well as `ADMIN` through AuthContext and the authenticated session.
- The backend rejects unsupported roles and clinic users without a clinic. Workflow writes constrain both the workflow's clinic and its patient's clinic. The audit actor comes from the authenticated user, not the request body.
- Admin's normal unrestricted workflow update remains available.
- Terra order creation, patient-order reads, and the new existing-order reconciliation endpoint are scoped to the caller's clinic.
- Terra order cards show the resolved test name, explicitly labeled order/result statuses, and created date. Tracking display was subsequently removed at the user's request. Unknown results status is displayed as not reported, rather than inferred.
- Empty states reflect actual backend statuses. The Patient Card and Lab Results Center refresh every 15 seconds while visible and when focused.
- Report ingestion requires real result-ready statuses and a valid fetched FHIR report. Per-order database locking serializes webhook and reconciliation writes. Successful receipt deduplication is committed with the report; upstream failures remain retryable. Partial reports update the same result, and late partial deliveries do not overwrite a final report.
- The report View/Hide toggle is preserved.

## Verification

- 12 focused backend tests passed: own-clinic updates, cross-clinic rejection, missing-clinic/unknown-role denial, admin behavior, authenticating webhooks, no report before readiness, partial-to-final updates, failed-fetch retries, invalid report rejection, mismatched item rejection, duplicate handling, and late partial handling.
- A live cross-clinic workflow PATCH returned 404; a clinic token without a clinic returned 403. The foreign workflow was unchanged.
- A real browser session using `CLINIC_USER` opened the existing modal and saved its own workflow. It displayed internal Completed separately from Terra's fulfilment/result statuses.
- Both frontend and backend TypeScript checks passed. An existing Axios content-type typing error in the patient report viewer was corrected to allow the frontend check to pass.
- Real Terra webhook delivery, a real fetched sandbox report, a single linked LabResult, and visibility in both APIs were verified. Two concurrent sync requests returned 201 and kept the report count at one.
- Admin login returned 200, `/auth/me` returned 200 with role ADMIN, and the actual browser form reached Dashboard after the local services were restored.
- Final browser checks showed the real biomarker report on the clinic Patient Card and its matching Lab Results Center entry. A further automatic patient refresh was observed without navigation or reload. Screenshots are in `.devtmp/clinic-final-report.png` and `.devtmp/clinic-final-center.png`.

## Files changed for this task

- `backend/src/workflows/workflows.controller.ts`
- `backend/src/workflows/workflows.service.ts`
- `backend/src/workflows/workflows.spec.ts`
- `backend/src/patients/patients.service.ts`
- `backend/src/terra/terra.controller.ts`
- `backend/src/terra/terra.service.ts`
- `backend/src/terra/terra.service.spec.ts`
- `frontend/src/app/dashboard/patients/[id]/page.tsx`
- `frontend/src/components/patients/TerraOrdersSection.tsx`
- `frontend/src/app/dashboard/lab-results/page.tsx`
- `frontend/src/app/patient/results/page.tsx` (content-type typing only)
- This verification report.

Earlier unrelated working-tree changes were preserved. Temporary browser/tunnel logs and verification scripts are under the ignored `.devtmp` directory.

## Automatic five-minute sandbox reports (26 September 2026)

- Added an opt-in, production-disabled durable report queue. New patient creation atomically stores the chosen live Terra test, workflow and job. Manual Terra orders are also scheduled. Three jobs can process concurrently, with persisted leases, stable creation idempotency keys, bounded retries and clinic-scoped retry controls.
- Add Patient now offers all 14 currently supported US/UK at-home Terra variants while automation is enabled. The selected test name is retained in the report. No arbitrary mapping from the older Tasso package names is performed.
- Applied reviewed additive SQL only: a nullable unique Terra order client reference, the report-job table, indexes and foreign keys. Existing patient/order/report data was retained. Enabled the flag in local development configuration and regenerated the Prisma client.
- Real registration API verification created two explicitly named Sandbox demo patients for Vitamin D and Standard Kit. Both produced exactly one Terra report with ten biomarkers **315 seconds after patient creation**, without manual lifecycle updates. A backend restart during the wait verified persisted-job recovery. The UK fixture phone format was corrected after Terra validation rejected the initial fixture.
- Browser verification confirmed all 14 test choices, the five-minute disclosure, persistent job status, automatic appearance without reload, inline sandbox-labelled biomarker results and second-click collapse. Screenshot: `.devtmp/automatic-report-ui.png`; timing audit: `.devtmp/automatic-report-audit.json`.
- Existing admin login passed after restart. Frontend and backend TypeScript checks passed. All 21 focused tests passed, covering scheduling, restart recovery, ownership behavior, production/disabled gating, lease contention, retries, catalogue validation, manual-order scheduling, stable retry keys and existing report ingestion/workflow behavior.
- The five-minute period is a sandbox demo target. Terra availability and polling can delay it; failures remain visible instead of being represented as completed clinical results.

## Order validation and original package selector (28 September 2026)

- Confirmed the recorded rejection was Terra HTTP 500 (`error creating order with supplier imaware`); a separate earlier request had a phone-format 400. The generic supplier response does not identify the failing field. Controlled Kidney Function sandbox orders with valid New York addresses succeeded with both UK and US E.164 numbers, so an international phone number alone does not cause the supplier rejection. Both orders subsequently received their reports automatically.
- Added server validation and normalization for required recipient fields, dates/adult age, phone format and US shipping state/ZIP. The modal now offers US state choices and equivalent early validation. Synthetic demo details are an explicit opt-in form action and never modify the patient record.
- Removed the session-level variant blacklist: a supplier error is not evidence that the selected test is permanently unavailable. Supplier failures now return 503 with actionable wording; validation errors remain 400. Logs no longer dump complete upstream response bodies containing rejected field values.
- Verified that Add Patient uses the four original packages. Essential Blood Panel filtering now also covers its stable product ID, direct variant discovery and attempts to order its variants. New registration using a workflow package alone does not silently order a different Terra test; automatic reports begin after a supported Terra order is placed.
- Backend build and frontend TypeScript checks passed. All 28 focused backend tests passed, including existing ingestion/queue/workflow regressions, local validation, excluded products and confirmed-failure retries.
- Live logs and the database additionally confirmed Yasir's Kidney Function order was accepted at 21:20:23 PKT, with its automatic sandbox report job scheduled for 21:25:23 PKT.
- Final browser verification passed: exactly four registration packages, no Essential product option, and successful Male Hormone Panel submission using the explicit demo-details action. Exactly one new order was saved and its automatic report job retained the selected variant. Existing admin login through the frontend proxy returned HTTP 200.

## Blood product selection update (2026-10-01)

The product dropdown now offers only Advanced Blood Test and Essential Blood Test, sourced from Terra. The previous Essential exclusion is removed. Following the user's clarification, the Variant dropdown remains: Advanced retains its available tests, while Essential offers both Standard Kit and Comprehensive Kit. Product/category changes clear the previous variant, collection and consent; stale catalogue responses cannot replace the latest selection.

Verified with read-only live Terra catalogue requests, 42 backend tests, backend build, frontend typecheck and browser tests using intercepted order requests. The browser checks confirmed the selected IDs for an Advanced test and both Essential kits. No real orders were placed. Terra currently lists GB as the Essential kits' shipping destination.

## US-address ordering follow-up (2026-10-01)

The user confirmed that both blood products should use the US address form. The modal now consistently shows United States, the US state dropdown and ZIP Code for at-home orders. Terra delivery eligibility is checked separately: the current live sandbox catalogue lists both Essential kits for GB only, so the form explains US unavailability and prevents submitting those selections. Advanced US-supported orders retain their normal flow. The backend independently checks Essential's current catalogue countries before placing an order; if Terra adds US support, it will accept that supported destination without a hardcoded GB restriction.

The remaining blocker is supplier availability: no US Essential product exists in the configured Terra catalogue. No kit was relabelled or substituted. Browser checks use mocked requests and verify US submission for Advanced, identical US fields for both Essential kits, and zero order submissions for unsupported destinations.

## Lab phone and submit feedback (2026-10-02)

Removed the lab recipient country-code selector and its helper text. The field accepts valid US national numbers, normalizes them to +1 on submission, and rejects other countries (including non-US +1 numbers). The same US-only rule is enforced at the public Terra order endpoint. Input errors show inline.

Essential availability no longer silently disables the submit button. With collection and consent selected, clicking validates the entered details first and then explains the supplier restriction before creating a patient or an order; the dialog scrolls to its error. Terra's Essential US delivery remains unavailable and no product substitution was made. Verified with browser requests intercepted, four phone-schema tests, 254 targeted backend tests, frontend typecheck and backend build.

## US Essential supplier verification (2026-10-02, latest behavior)

At the user's explicit request, removed the application's Essential country pre-check on both frontend and backend. Orders now send the selected Essential kit ID and US address unchanged to Terra; the supplier response determines acceptance. US phone normalization/validation, patient details, consent and US state/ZIP validation remain enforced. This supersedes the app-side availability blocks described above.

A single direct Terra sandbox diagnostic request for Standard Kit 100011 used synthetic recipient data, a reserved example.com email, a valid US phone and a US shipping address. Terra returned HTTP 400: "This test isn't available in the provided country. Supported country codes: GB." No order ID was returned and no local patient/report/order was created. A successful US Essential order is still blocked by Terra's supplier support, not a local frontend rule. No variant was substituted and the country was not rewritten to GB.

Browser tests with intercepted requests verified that both Essential variants reach the API with country_code US and their original variant IDs. Backend tests verify that supplier rejections are preserved without saving a successful order. Backend build and frontend typecheck passed.

# Admin dashboard data

The five summary cards link to Clinics, Patients, active Sessions, available Lab Results, and completed Sessions. Counts refresh every 30 seconds and when the window regains focus. Request failures show an error instead of fabricated zero counts.

Clinic and patient totals come from registered FrigoFlow records, not Terra. Known seed fixtures are marked `is_demo` and excluded. Sessions and reports are filtered by the displayed Terra environment. Production mode requires production orders and non-sandbox reports. In sandbox mode, `TERRA_SHOW_SANDBOX_DATA=true` displays sandbox orders and explicitly marked sandbox reports, with a prominent simulated-data notice. The admin lists use the same filters. Existing test records remain stored.

Migration `202609300002_live_data_provenance` adds provenance fields. All legacy orders default to SANDBOX because the earlier implementation only used Terra's sandbox endpoint. Changing environment never relabels those orders as live.

Current backend configuration:

```dotenv
TERRA_ENVIRONMENT=sandbox
TERRA_SANDBOX_AUTO_REPORTS=true
TERRA_SHOW_SANDBOX_DATA=true
TERRA_REQUIRE_LIVE_DATA=false
```

Only sandbox access is currently available. Consequently there are no live clinical sessions or reports to show. Manual sandbox orders are enabled and explicitly labelled as test orders. They never count as live clinical data. Five-minute simulated-report generation is enabled, with 30-second status reconciliation. Set `TERRA_REQUIRE_LIVE_DATA=true` to restrict ordering to production.

After Terra grants production access, set `TERRA_ENVIRONMENT=production` in the backend environment and restart NestJS. Keep server credentials private. Configure the production webhook to `https://YOUR-PUBLIC-BACKEND/api/v1/terra/webhook` with the matching signing secret; sandbox and production webhook registrations are separate. Do not test by placing a paid production order without explicit authorization.

See [Terra's production setup](https://docs.tryterra.co/vantage-api/going-to-production).

## Clinic dashboard

The clinic dashboard uses `/api/v1/dashboard/clinic/stats`, scoped to the authenticated clinic. The three cards open Total Patients, available Lab Results, and completed Sessions. Total Patients includes every registered patient in the clinic, regardless of session or result status. Patient registration increments the patient total; it does not invent a Terra session or result. Session totals count all matching sessions, including multiple sessions for one patient.

The dashboard refreshes on entry, every 30 seconds while visible, and when the browser tab regains focus or becomes visible. Patient Diagnostics includes all patients with a session in RESULTS_READY status in the displayed environment, without a five-patient limit. New registrations still increment the patient total but appear in Patient Diagnostics only when results are ready. The Needs Attention panel has been removed. Clinic lists and patient cards exclude demo patients and use the same Terra environment filter as the card totals. Historical test records are preserved in the database.

# Automatic workflow updates

Terra order creation, verified webhooks and background reconciliation now update the corresponding Frigo Flow workflow. The reconciliation worker reads batches of 20 orders every 30 seconds; it does not simulate events or create orders. Patient Card and Workflows pages refresh visible data every 30 seconds. Larger queues or slow Terra responses can take more than one interval.

Each Terra order has its own persisted workflow link. Existing orders acquire a link on their next successful reconciliation. A single unlinked enrollment workflow can be reused; ambiguous or additional orders get a separate workflow. Reports are linked to that same workflow. Updates and history writes are transactional, and older/duplicate deliveries cannot move a workflow backward or duplicate automatic history. History identifies these changes as **Terra**.

| Stage | Evidence used |
| --- | --- |
| Patient Created | Patient saved without a test selection |
| Test Package Selected | Selected test saved or Terra order successfully created |
| Instructions Sent | Production requires actual/manual delivery confirmation. In development sandbox automation, the instructions step is explicitly simulated when Terra reaches processing, fulfillment or completion; no email or SMS is sent. |
| Kit Shipped | Terra reports delivery fulfilled/completed for an at-home order |
| Sample Collected | Terra reports sample processing or actual results, confirming that collection occurred |
| Lab Processing | Sample processing, partial results, or final results reported by Terra |
| Results Ready | The actual final Terra report is saved locally; partial/missing reports do not qualify |
| Completed | Terra reports `order.completed` and the actual final report is saved locally |

Stages are recorded when their evidence becomes known, not as invented historical timestamps. Kit activation does not imply sample collection. Go-to-lab orders do not acquire a kit-shipped stage. Cancellation, errors and unknown Terra statuses do not imply successful completion. The Session page and Patient Card show automatic progress without manual update buttons or dialogs. The existing authenticated status API remains available; its permissions and Terra reconciliation behavior are unchanged.

`TERRA_WORKFLOW_AUTO_SYNC` defaults to enabled when Terra credentials exist. Set it to `false` to disable the reconciliation worker; signed webhook updates remain enabled. Terra credentials, sandbox mode and the existing report simulation configuration are unchanged. This feature does not turn sandbox results into clinical results.

Database setup requires the updated `backend/prisma/schema.prisma`: nullable `TerraOrder.workflow_id`, nullable `collection_type`, the unique workflow mapping and nullable `WorkflowHistory.updated_by` for automatic entries. Apply the schema and regenerate Prisma when deploying. The local development database has been updated. No patients, reports or existing history were deleted.

Validation includes event-to-stage rules, partial/missing report gates, idempotency, late events, patient/clinic mapping protection, separate orders, and a signed-webhook integration check against the actual local database using temporary fixtures rolled back after verification.

Sandbox report automation runs only in sandbox development mode. New orders receive a durable job due five minutes after creation. The worker also recovers existing unfinished sandbox orders that have no job, preserving their original deadline and order ID. Failed upstream attempts retry after 30 seconds without placing duplicate orders. These reports and progress are explicitly labelled simulated.

Sandbox jobs check progress every 30 seconds. Events become eligible at 30 seconds (payment complete), 60 seconds (processing and the local demo instructions step), 90 seconds (delivery fulfilled), 120 seconds (kit activated), 150 seconds (sample processing), five minutes (results ready), and five minutes thirty seconds (completed). Completion requires a locally saved final report and Terra confirmation of the sandbox `completed` event. The worker never calls the results acknowledgment endpoint. A report delivered earlier by Terra is displayed immediately; delayed jobs catch up using current evidence. The sandbox worker follows [Terra's sandbox event sequence](https://docs.tryterra.co/vantage-api/working-with-sandbox); production orders are rejected by the simulation method.

Existing sandbox jobs that stopped after saving a report resume their remaining stages without creating another order. Missing demo instructions history is inserted once with the current recording time, without regressing the workflow. The history labels that entry **Sandbox demo / Simulated · no message sent**, not Terra delivery confirmation. Failed completion attempts retry normally. Finished sessions retain their ready reports in Patient Diagnostics and unique-patient result counts.

The navbar bell polls the authenticated `/api/v1/notifications/lab-reports` endpoint every ten seconds while the page is visible, and on returning to the page. The feed includes saved final Terra reports for the selected environment, restricted to the signed-in clinic (admins see all eligible clinics). Partial reports do not notify. Report IDs keep entries stable across refreshes. Clicking an entry opens that patient's Lab Reports tab and the matching report. Read markers are stored per user in this browser and persist across reloads; they do not synchronize across devices. Sandbox notifications explicitly identify simulated results.

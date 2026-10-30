import { terraEnvironment, terraBaseUrl, TerraEnvironment } from './terra-environment';
import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma, TerraOrder } from '@prisma/client';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { sandboxAutoReportsEnabled, SANDBOX_REPORT_DELAY_MS } from './sandbox-config';
import { isApprovedTerraProduct, bloodProductName } from './approved-products';
import { normalizeTerraOrder } from './order-validation';
import { isUnsupportedUsDelivery } from './order-country-error';
import { syncTerraWorkflow } from '../workflows/terra-workflow-sync';

/**
 * Terra Vantage (Blood Labs) sandbox base URL — verified against
 * https://docs.tryterra.co/vantage-api/account-setup-and-api-keys
 * "Your credentials will initially only work against the sandbox environment."
 */


export interface TerraConnectionTestResult {
    endpoint: string;
    httpStatus: number | null;
    authenticated: boolean;
    message: string;
    sample?: unknown;
}

export interface TerraOrderRecipient {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    date_of_birth: string;
    gender_at_birth: 'male' | 'female';
}

export interface TerraOrderShippingAddress {
    address_line_1: string;
    address_line_2?: string;
    city: string;
    administrative_area: string;
    postal_code: string;
    country_code: string;
}

export interface CreateTerraOrderInput {
    patient_id: string;
    variant_id: string;
    quantity?: number;
    collection_type: 'AT_HOME' | 'GO_TO_LAB';
    recipient: TerraOrderRecipient;
    shipping_address?: TerraOrderShippingAddress;
}

// Sanitized projection of Terra's FHIR result Bundle — contains only clinical
// data, never Terra's internal resource ids, order/order-item ids, or the
// presigned download_url. Safe to store on LabResult and show to patients.
export interface TerraResultBiomarker {
    name: string;
    value: number | null;
    unit: string | null;
    referenceRange: { low: number | null; high: number | null } | null;
    interpretation: { code: string | null; display: string | null } | null;
}

export interface TerraStructuredReport {
    isSandbox: boolean;
    reportDate: string | null;
    collectedDate?: string | null;
    issued: string | null;
    resultStatus: string;
    isPartial: boolean;
    biomarkers: TerraResultBiomarker[];
}

// Results statuses that mean an actual result document is available to fetch.
// Verified against https://docs.tryterra.co/vantage-api/results.md
const RESULT_READY_STATUSES = new Set(['results.results_ready', 'results.partial_results_ready']);

const RESULT_STATUS_LABELS: Record<string, string> = {
    'results.awaiting_sample': 'Awaiting Sample',
    'results.kit_activated': 'Kit Activated',
    'results.sample_processing_in_lab': 'Processing In Lab',
    'results.partial_results_ready': 'Partial Results Ready',
    'results.results_ready': 'Results Ready',
    'results.sample_rejected': 'Sample Rejected',
    'results.lab_processing_error': 'Lab Processing Error',
    'results.escalation_raised': 'Escalation Raised',
};

@Injectable()
export class TerraService {
    private readonly logger = new Logger(TerraService.name);
    private sandboxCatalogCache: { expires: number; tests: { id: string; name: string; country: string }[] } | null = null;

    constructor(private prisma: PrismaService) { }

    getOrderingConfiguration() {
        const environment = terraEnvironment();
        return {
            environment,
            orderingEnabled: environment === 'PRODUCTION' || process.env.TERRA_REQUIRE_LIVE_DATA !== 'true',
            showSandboxData: environment === 'SANDBOX' && process.env.TERRA_SHOW_SANDBOX_DATA === 'true',
        };
    }

    async getSandboxConfiguration() {
        if (!sandboxAutoReportsEnabled()) return { enabled: false, delaySeconds: 300, tests: [] };
        if (!this.sandboxCatalogCache || this.sandboxCatalogCache.expires < Date.now()) {
            const types = await this.getProductTypes() as { id: string }[];
            const products = (await Promise.all(types.map(type => this.getProductsByType(String(type.id))))).flat() as { id: string }[];
            const variants = (await Promise.all(products.map(product => this.getProductVariants(String(product.id))))).flat() as any[];
            const tests = variants.filter(variant =>
                variant.available_collection_types?.includes('AT_HOME') &&
                variant.supported_ship_to_countries?.some((country: string) => ['US', 'GB'].includes(country))
            ).map(variant => ({
                id: String(variant.id), name: String(variant.variant_name),
                country: variant.supported_ship_to_countries.includes('US') ? 'US' : 'GB',
            }));
            this.sandboxCatalogCache = { tests, expires: Date.now() + 300000 };
        }
        return { enabled: true, delaySeconds: 300, tests: this.sandboxCatalogCache.tests };
    }

    async prepareSandboxTest(variantId: unknown) {
        // Sandbox automation is opt-in per patient: only engage it when a
        // Terra variant id was actually provided. FrigoFlow's approved
        // package selector never sends one, and that must not block regular
        // patient creation even when the sandbox feature flag is on.
        if (!sandboxAutoReportsEnabled() || variantId === undefined || variantId === null || variantId === '') return null;
        const config = await this.getSandboxConfiguration();
        const test = config.tests.find(test => test.id === String(variantId));
        if (!test) throw new BadRequestException('Select an available Terra sandbox test before adding the patient.');
        return test;
    }

    async retrySandboxJob(id: string, clinicId: string | null) {
        if (!sandboxAutoReportsEnabled()) throw new BadRequestException('Automatic sandbox reports are disabled.');
        const job = await this.prisma.sandboxReportJob.findFirst({ where: { id,
            ...(clinicId ? { patient: { clinic_id: clinicId } } : {}) } });
        if (!job) throw new NotFoundException('Sandbox report job not found');
        await this.prisma.sandboxReportJob.updateMany({ where: { id, status: 'FAILED' },
            data: { status: 'QUEUED', attempts: 0, next_attempt_at: new Date(), last_error: null } });
        return { queued: true };
    }

    async advanceSandboxOrder(id: string, clinicId: string, elapsedMs = SANDBOX_REPORT_DELAY_MS) {
        if (!sandboxAutoReportsEnabled()) throw new BadRequestException('Automatic sandbox reports are disabled.');
        const local = await this.prisma.terraOrder.findFirst({ where: { id, patient: { clinic_id: clinicId } } });
        if (!local) throw new NotFoundException('Terra order not found');
        if (local.environment !== 'SANDBOX') throw new BadRequestException('Only sandbox orders can be simulated.');
        let remote = await this.terraGet(`/orders/${encodeURIComponent(local.terra_order_id)}`);
        const matches = (remote.items || []).filter((item: any) => local.terra_order_item_id
            ? String(item.order_item_id) === local.terra_order_item_id : String(item.variant_id) === local.terra_product_id);
        if (String(remote.order_id) !== local.terra_order_id || matches.length !== 1 || !matches[0].order_item_id) {
            throw new BadRequestException('Cannot uniquely identify the sandbox order item.');
        }
        const itemId = String(matches[0].order_item_id);
        const resultStatus = () => remote.items.find((item: any) => String(item.order_item_id) === itemId)?.results_status;
        const simulate = async (event: string) => {
            if (!sandboxAutoReportsEnabled()) throw new BadRequestException('Automatic sandbox reports are disabled.');
            const response = await fetch(`${terraBaseUrl()}/api/v1/orders/${local.terra_order_id}/simulate`, {
                method: 'POST', headers: { Authorization: this.basicAuthHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, order_item_id: itemId }), signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new ServiceUnavailableException(`Terra sandbox simulation failed (HTTP ${response.status}).`);
            remote = await this.terraGet(`/orders/${local.terra_order_id}`);
        };
        if (resultStatus() !== 'results.results_ready') {
            if (remote.order_status === 'order.payment_processing' && elapsedMs >= 30000) await simulate('payment_complete');
            if (remote.order_status === 'order.payment_complete' && elapsedMs >= 60000) await simulate('processing');
            if (remote.order_status === 'order.processing' && elapsedMs >= 90000) await simulate('delivery_fulfilled');
            if (!['order.delivery_fulfilled', 'order.completed'].includes(remote.order_status)) {
                if (elapsedMs < 90000) return this.syncOrder(id, clinicId);
                throw new BadRequestException('This sandbox order cannot be progressed automatically.');
            }
            if (resultStatus() === 'results.awaiting_sample' && elapsedMs >= 120000) await simulate('kit_activated');
            if (resultStatus() === 'results.kit_activated' && elapsedMs >= 150000) await simulate('sample_processing_in_lab');
            if (['results.sample_processing_in_lab', 'results.partial_results_ready'].includes(resultStatus()) && elapsedMs >= SANDBOX_REPORT_DELAY_MS) await simulate('results_ready');
        }
        const synced = await this.syncOrder(id, clinicId);
        // Finish only after the final report is persisted. This is a sandbox
        // lifecycle event, never an acknowledgment on behalf of a patient.
        if (elapsedMs >= SANDBOX_REPORT_DELAY_MS + 30000 && synced?.lab_result_id
            && synced.results_status === 'results.results_ready'
            && remote.order_status === 'order.delivery_fulfilled') {
            await simulate('completed');
            return this.syncOrder(id, clinicId);
        }
        return synced;
    }

    // Read only from process.env — never hardcoded, never logged.
    private get devId(): string | undefined {
        return process.env.TERRA_DEV_ID;
    }

    private get apiKey(): string | undefined {
        return process.env.TERRA_API_KEY;
    }

    // Separate from TERRA_API_KEY — this is the webhook signing secret shown
    // in the Terra dashboard, used only to verify X-Terra-Signature.
    private get signingSecret(): string | undefined {
        return process.env.TERRA_SIGNING_SECRET;
    }

    private get basicAuthHeader(): string {
        return `Basic ${Buffer.from(`${this.devId}:${this.apiKey}`).toString('base64')}`;
    }

    private assertCredentialsConfigured() {
        if (!this.devId || !this.apiKey) {
            throw new InternalServerErrorException('TERRA_DEV_ID and/or TERRA_API_KEY are not configured in the environment.');
        }
    }

    /**
     * Calls Terra Vantage's sandbox `GET /api/v1/products` endpoint purely to
     * verify that TERRA_DEV_ID / TERRA_API_KEY authenticate. No orders,
     * results, or webhooks are touched here.
     */
    async testConnection(): Promise<TerraConnectionTestResult> {
        const endpoint = `${terraBaseUrl()}/api/v1/products`;

        if (!this.devId || !this.apiKey) {
            this.logger.warn('Terra connection test skipped: TERRA_DEV_ID and/or TERRA_API_KEY is not set.');
            return {
                endpoint,
                httpStatus: null,
                authenticated: false,
                message: 'TERRA_DEV_ID and/or TERRA_API_KEY are not configured in the environment.',
            };
        }

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: { Authorization: this.basicAuthHeader },
            });
        } catch (err: any) {
            this.logger.error(`Terra Vantage sandbox connection test errored: ${err.message}`);
            return {
                endpoint,
                httpStatus: null,
                authenticated: false,
                message: `Request to Terra failed: ${err.message}`,
            };
        }

        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            body = await response.text().catch(() => null);
        }

        if (response.ok) {
            this.logger.log(`Terra Vantage sandbox connection test succeeded (HTTP ${response.status}).`);
            return {
                endpoint,
                httpStatus: response.status,
                authenticated: true,
                message: 'Terra Vantage credentials authenticated successfully.',
                sample: Array.isArray(body) ? body.slice(0, 3) : body,
            };
        }

        this.logger.warn(`Terra Vantage sandbox connection test failed (HTTP ${response.status}).`);
        return {
            endpoint,
            httpStatus: response.status,
            authenticated: false,
            message:
                response.status === 401 || response.status === 403
                    ? 'Terra rejected the configured TERRA_DEV_ID/TERRA_API_KEY (unauthorized).'
                    : `Terra returned an unexpected status (${response.status}).`,
            sample: body,
        };
    }

    /**
     * GET /api/v1/products — list of Terra Vantage product types
     * (e.g. "Blood Test", "DNA Test"). Verified against
     * https://docs.tryterra.co/reference/vantage-api/products
     */
    async getProductTypes(): Promise<unknown> {
        this.assertCredentialsConfigured();
        const response = await fetch(`${terraBaseUrl()}/api/v1/products`, {
            method: 'GET',
            headers: { Authorization: this.basicAuthHeader },
            signal: AbortSignal.timeout(15000),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new BadRequestException({ message: 'Terra rejected the product types request.', terra: body });
        }
        return body;
    }

    /**
     * GET /api/v1/products/{productTypeId} — individual products within a
     * product type (e.g. specific panels within "Blood Test"). Verified
     * against https://docs.tryterra.co/reference/vantage-api/products
     */
    async getProductsByType(productTypeId: string): Promise<unknown> {
        this.assertCredentialsConfigured();
        const response = await fetch(`${terraBaseUrl()}/api/v1/products/${productTypeId}`, {
            method: 'GET',
            headers: { Authorization: this.basicAuthHeader },
            signal: AbortSignal.timeout(15000),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new BadRequestException({ message: 'Terra rejected the products-by-type request.', terra: body });
        }
        // Filter Terra's real response through our approved-product config —
        // never adds or invents products, only removes unapproved ones.
        return Array.isArray(body) ? body.filter(isApprovedTerraProduct).map(product => ({ ...product, name: bloodProductName(product) })) : body;
    }

    /**
     * GET /api/v1/products/{productId}/variants — orderable variants for a
     * given individual product. Verified against
     * https://docs.tryterra.co/reference/vantage-api/products
     */
    async getProductVariants(productId: string): Promise<unknown> {
        this.assertCredentialsConfigured();
        const response = await fetch(`${terraBaseUrl()}/api/v1/products/${productId}/variants`, {
            method: 'GET',
            headers: { Authorization: this.basicAuthHeader },
            signal: AbortSignal.timeout(15000),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new BadRequestException({ message: 'Terra rejected the product variants request.', terra: body });
        }
        return body;
    }

    // Terra's error responses use varying shapes across endpoints/failure
    // types ({detail, title, ...} for validation errors, {detail} alone for
    // internal errors, etc). Surface whichever real field is present rather
    // than a generic message — never fabricates a message Terra didn't send.
    private extractTerraErrorDetail(body: any): string | null {
        if (!body || typeof body !== 'object') return null;
        const candidates = [body.detail, body.message, body.error, body.title];
        const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
        return found ? String(found) : null;
    }

    private async postOrderToTerra(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ ok: boolean; status: number; body: any }> {
        const response = await fetch(`${terraBaseUrl()}/api/v1/orders`, {
            method: 'POST',
            headers: {
                Authorization: this.basicAuthHeader,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000),
        });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
    }

    /**
     * POST /api/v1/orders — places a real order against the Terra Vantage
     * sandbox, then persists the mapping (FrigoFlow patient <-> Terra order)
     * to the TerraOrder table. Verified against
     * https://docs.tryterra.co/reference/vantage-api/orders
     *
     * Terra's sandbox has been observed returning transient supplier-side
     * 5xx errors (e.g. "error creating order with supplier imaware", "error
     * creating external user for supplier 1") that do not create an order on
     * Terra's side (no order_id in the response) — safe to retry exactly
     * once. A validation 4xx, or any 5xx that DID return an order_id, is
     * never retried and never written to TerraOrder.
     */
    async createOrder(input: CreateTerraOrderInput, clinicId: string | null, automation?: { referenceId: string; testName: string }) {
        if (process.env.TERRA_REQUIRE_LIVE_DATA === 'true' && terraEnvironment() !== 'PRODUCTION') {
            throw new BadRequestException('Live lab ordering is not enabled. Terra production access is required for real lab tests.');
        }
        const patient = await this.prisma.patient.findFirst({ where: { id: input.patient_id, ...(clinicId ? { clinic_id: clinicId } : {}) } });
        if (!patient) throw new NotFoundException('Patient not found');

        this.assertCredentialsConfigured();

        input = normalizeTerraOrder(input);

        const clientOrderReferenceId = automation?.referenceId || `frigoflow-${input.patient_id}-${randomUUID()}`;
        if (automation) {
            const previous = await this.prisma.terraOrder.findUnique({ where: { client_reference_id: clientOrderReferenceId } });
            if (previous) {
                if (previous.patient_id !== input.patient_id) throw new BadRequestException('Sandbox order patient mismatch.');
                return { terra: null, saved: previous };
            }
        }

        const sandboxTestName = !automation && sandboxAutoReportsEnabled()
            ? (await this.getSandboxConfiguration()).tests.find(test => test.id === input.variant_id)?.name || 'Terra Sandbox Test'
            : null;
        const payload: Record<string, unknown> = {
            client_order_reference_id: clientOrderReferenceId,
            collection_type: input.collection_type,
            items: [{ variant_id: input.variant_id, quantity: input.quantity ?? 1 }],
            recipient: input.recipient,
        };
        if (input.collection_type === 'AT_HOME') {
            payload.shipping_address = input.shipping_address;
        }

        // Idempotency-Key is a transport-level guard against a *retried HTTP
        // request* — it must be distinct per actual attempt. It is
        // deliberately NOT the same value as client_order_reference_id
        // (the business-level reference, kept fixed across attempts for our
        // own dedup). Terra's own API explicitly rejects reusing a key whose
        // original request is known to have failed ("retry with a new
        // Idempotency-Key") — reusing it here previously caused every
        // automatic retry to fail with that exact error.
        let attempt = await this.postOrderToTerra(payload, randomUUID());
        const isTransientSupplierError = !attempt.ok && attempt.status >= 500 && !attempt.body?.order_id;
        if (isTransientSupplierError) {
            this.logger.warn(`Terra supplier returned HTTP ${attempt.status}; retrying once.`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt = await this.postOrderToTerra(payload, randomUUID());
        }

        if (!attempt.ok) {
            // Log the full Terra status + JSON response server-side for
            // debugging. Never log credentials — only the response body,
            // which is Terra's own error metadata (never TERRA_API_KEY/DEV_ID).
            this.logger.warn(`Terra order creation failed (HTTP ${attempt.status}).`);
            if (attempt.status === 403 && attempt.body?.code === 'entitlement_required') {
                throw new ServiceUnavailableException({
                    code: 'TERRA_VANTAGE_ACCESS_REQUIRED',
                    message: `Lab ordering is unavailable for the configured Terra account. Ask your administrator to have Terra enable Vantage ${terraEnvironment().toLowerCase()} access, then try again. Your form details have been kept.`,
                    httpStatus: attempt.status,
                    transient: false,
                });
            }
            const transient = attempt.status >= 500 && !attempt.body?.order_id;
            const terraDetail = this.extractTerraErrorDetail(attempt.body);
            const countryUnsupported = isUnsupportedUsDelivery(attempt.body, input.shipping_address?.country_code);
            const error = {
                // Prefer Terra's own message/detail/error when available — a
                // safe, useful string (Terra's own error metadata, never an
                // internal id, URL, or credential) — over a generic message.
                code: countryUnsupported ? 'TERRA_SHIPPING_COUNTRY_UNSUPPORTED' : undefined,
                message: countryUnsupported
                    ? 'Terra does not deliver this kit to the United States. Choose a US-supported test.'
                    : transient
                    ? 'Terra could not create this order with its lab supplier. Check the shipping address and try again. Your selected test is still available.'
                    : (terraDetail || 'Terra rejected the order.'),
                httpStatus: attempt.status,
                transient,
                terra: attempt.body,
            };
            if (transient) throw new ServiceUnavailableException(error);
            throw new BadRequestException(error);
        }

        const terraBody = attempt.body;
        if (!terraBody?.order_id) throw new ServiceUnavailableException('Terra did not return an order ID.');
        const createdItems = (terraBody.order_items || []).filter((item: any) => String(item.variant_id) === input.variant_id);
        const createdItem = createdItems.length === 1 ? createdItems[0] : undefined;
        const saved = await this.prisma.terraOrder.upsert({
            where: { terra_order_id: String(terraBody.order_id) },
            update: {},
            create: {
                environment: terraEnvironment(),
                patient_id: input.patient_id,
                collection_type: input.collection_type,
                terra_order_id: String(terraBody.order_id),
                client_reference_id: clientOrderReferenceId,
                terra_product_id: input.variant_id,
                terra_order_status: String(terraBody.order_status),
                terra_order_item_id: createdItem?.order_item_id ? String(createdItem.order_item_id) : null,
                results_status: createdItem?.results_status || null,
                tracking_number: terraBody.tracking_number || null,
                ...(!automation && sandboxAutoReportsEnabled() ? {
                    sandboxReportJob: { create: {
                        patient_id: input.patient_id, variant_id: input.variant_id,
                        test_name: sandboxTestName || 'Terra Sandbox Test', country_code: input.shipping_address?.country_code || 'US',
                        due_at: new Date(Date.now() + SANDBOX_REPORT_DELAY_MS),
                        next_attempt_at: new Date(Date.now() + 30000),
                        status: 'WAITING',
                    } },
                } : {}),
            },
        });

        try {
            await this.withOrderLock(saved.terra_order_id, async (tx, order) => syncTerraWorkflow(tx, order));
        } catch {
            // The lab order already exists. Do not turn a local sync failure into
            // an apparent order failure that encourages duplicate submissions.
            this.logger.warn('Order saved; automatic workflow synchronization will retry.');
        }
        this.logger.log(`Terra order ${saved.terra_order_id} created and saved for patient ${input.patient_id}.`);

        return { terra: terraBody, saved };
    }

    /**
     * Locally-stored Terra orders for a patient, most recent first. Reflects
     * whatever handleWebhook() last persisted — does not call Terra live.
     */
    async getOrdersForPatient(patientId: string, clinicId: string | null) {
        const patient = await this.prisma.patient.findFirst({ where: { id: patientId, ...(clinicId ? { clinic_id: clinicId } : {}) } });
        if (!patient) throw new NotFoundException('Patient not found');
        return this.prisma.terraOrder.findMany({
            where: { patient_id: patientId },
            orderBy: { updated_at: 'desc' },
        });
    }

    /**
     * Verifies and processes an incoming Terra Vantage webhook delivery.
     * Verified against https://docs.tryterra.co/vantage-api/webhooks.md :
     *   - Signature header: X-Terra-Signature, format "t=<unix_ts>,v1=<hex hmac-sha256>"
     *   - Signed string is `${timestamp}.${rawBody}`, keyed with TERRA_SIGNING_SECRET
     *   - Two event families: "order.status_changed" (order-level fulfilment
     *     status + tracking_number) and "order_item.results_status_change"
     *     (order-item-level results status, test_taker, escalation_level)
     *   - Delivery is at-least-once; dedupe on event_id.
     */
    async handleWebhook(signatureHeader: string | undefined, rawBody: Buffer | undefined) {
        if (!this.signingSecret) {
            throw new InternalServerErrorException('TERRA_SIGNING_SECRET is not configured in the environment.');
        }
        if (!rawBody) {
            throw new BadRequestException('Missing raw request body.');
        }

        this.verifyWebhookSignature(signatureHeader, rawBody);

        let event: any;
        try {
            event = JSON.parse(rawBody.toString('utf8'));
        } catch {
            throw new BadRequestException('Malformed webhook JSON body.');
        }

        const eventId = event?.event_id ? String(event.event_id) : undefined;
        const eventType = event?.event_type ? String(event.event_type) : undefined;
        const data = event?.data ?? {};

        if (!eventId || !eventType) {
            throw new BadRequestException('Webhook payload missing event_id or event_type.');
        }

        const orderId = data.order_id ? String(data.order_id) : undefined;
        if (!orderId) throw new BadRequestException('Webhook payload missing data.order_id.');
        if (!['order.status_changed', 'order_item.results_status_change'].includes(eventType)) {
            return { received: true, applied: false };
        }

        // Serialize deliveries for this order across processes. Store the event receipt
        // in the SAME transaction as the order/report so a failed fetch remains retryable.
        const outcome = await this.withOrderLock(orderId, async (tx, existing) => {
            if (await tx.terraWebhookEvent.findUnique({ where: { event_id: eventId } })) {
                return { received: true, duplicate: true };
            }
            this.logger.log(`Terra webhook received: ${eventType} for order ${orderId} (event ${eventId}).`);
            if (eventType === 'order.status_changed') {
                await tx.terraOrder.update({
                    where: { id: existing.id },
                    data: {
                        terra_order_status: data.status ? String(data.status) : existing.terra_order_status,
                        tracking_number: data.tracking_number ? String(data.tracking_number) : existing.tracking_number,
                    },
                });
            } else {
                const orderItemId = data.order_item_id ? String(data.order_item_id) : existing.terra_order_item_id;
                if (existing.terra_order_item_id && orderItemId !== existing.terra_order_item_id) {
                    throw new BadRequestException('Terra order item does not match the stored patient order.');
                }
                if (existing.terra_test_taker_id && data.test_taker?.test_taker_id && String(data.test_taker.test_taker_id) !== existing.terra_test_taker_id) {
                    throw new BadRequestException('Terra test taker does not match the stored patient order.');
                }
                const resultsStatus = data.results_status ? String(data.results_status) : existing.results_status;
                // A delayed partial event must not replace an already saved final report.
                const finalAlreadySaved = existing.results_status === 'results.results_ready' && existing.lab_result_id;
                if (!finalAlreadySaved || resultsStatus === 'results.results_ready') {
                    const updated = await tx.terraOrder.update({
                        where: { id: existing.id },
                        data: {
                            results_status: resultsStatus,
                            terra_order_item_id: orderItemId,
                            terra_test_taker_id: data.test_taker?.test_taker_id ? String(data.test_taker.test_taker_id) : existing.terra_test_taker_id,
                            escalation_level: data.escalation_level ? String(data.escalation_level) : existing.escalation_level,
                        },
                    });
                    if (resultsStatus && RESULT_READY_STATUSES.has(resultsStatus)) {
                        const deliveredAt = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
                        try {
                            await this.syncResultForOrder(updated, resultsStatus, deliveredAt, tx);
                        } catch (error) {
                            if (!(error instanceof ServiceUnavailableException) && !(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
                            // Retain Terra's real status for the UI, but do not acknowledge
                            // this event as processed until its actual report can be saved.
                            return { syncFailed: true };
                        }
                    }
                }
            }
            await syncTerraWorkflow(tx, await tx.terraOrder.findUniqueOrThrow({ where: { id: existing.id } }));
            await tx.terraWebhookEvent.create({ data: { event_id: eventId, event_type: eventType } });
            return { received: true, duplicate: false, matched: true, applied: true };
        });
        if ('syncFailed' in outcome) throw new ServiceUnavailableException('Terra result synchronization failed; please retry the webhook.');
        return outcome;
    }

    private async withOrderLock<T>(orderId: string, work: (tx: Prisma.TransactionClient, order: TerraOrder) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "TerraOrder" WHERE terra_order_id = ${orderId} FOR UPDATE`;
            const order = await tx.terraOrder.findUnique({ where: { terra_order_id: orderId } });
            if (!order) throw new NotFoundException('Terra order not found; delivery can be retried after order creation.');
            if ((order.environment || 'SANDBOX') !== terraEnvironment()) throw new BadRequestException('This order belongs to a different Terra environment.');
            return work(tx, order);
        }, { maxWait: 10000, timeout: 90000 });
    }

    private async terraGet(path: string, environment: TerraEnvironment = terraEnvironment()): Promise<any> {
        this.assertCredentialsConfigured();
        const response = await fetch(`${terraBaseUrl(environment)}/api/v1${path}`, {
            headers: { Authorization: this.basicAuthHeader }, signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new ServiceUnavailableException(`Terra request failed (HTTP ${response.status}). Please retry synchronization.`);
        return response.json();
    }

    // Reconcile an existing mapping only. This never creates or advances a Terra order.
    async syncOrder(id: string, clinicId: string | null) {
        const local = await this.prisma.terraOrder.findFirst({
            where: { id, ...(clinicId ? { patient: { clinic_id: clinicId } } : {}) },
        });
        if (!local) throw new NotFoundException('Terra order not found');
        if ((local.environment || 'SANDBOX') !== terraEnvironment()) throw new BadRequestException('This order belongs to a different Terra environment.');
        return this.withOrderLock(local.terra_order_id, async (tx, order) => {
            const remote = await this.terraGet(`/orders/${encodeURIComponent(order.terra_order_id)}`);
            if (String(remote.order_id) !== order.terra_order_id) throw new BadRequestException('Terra order mapping mismatch.');
            const items = (remote.items || []).filter((item: any) =>
                order.terra_order_item_id ? String(item.order_item_id) === order.terra_order_item_id
                    : String(item.variant_id) === order.terra_product_id);
            if (items.length !== 1) throw new BadRequestException('Cannot uniquely match the Terra order item.');
            const item = items[0];
            if (!item.order_item_id) throw new BadRequestException('Terra order item ID is missing.');
            if (item.test_taker_ids?.length > 1) throw new BadRequestException('Multiple test takers require an explicit patient mapping.');
            let testTakerId = item.test_taker_ids?.[0] ? String(item.test_taker_ids[0]) : order.terra_test_taker_id;
            if (order.terra_test_taker_id && testTakerId !== order.terra_test_taker_id) throw new BadRequestException('Terra test taker mapping mismatch.');
            const savedReport = order.lab_result_id ? await tx.labResult.findFirst({
                where: { id: order.lab_result_id, patient_id: order.patient_id, source: 'TERRA' },
                select: { structured_report: true },
            }) : null;
            const savedData = savedReport?.structured_report as { isPartial?: boolean; resultStatus?: string; isSandbox?: boolean } | null;
            const finalAlreadySaved = savedData?.isPartial === false && savedData.resultStatus === 'results.results_ready';
            // Older imports predate provenance metadata. Re-fetch the report from
            // its verified Terra order before making it visible in this environment.
            const reportNeedsSync = !finalAlreadySaved || savedData?.isSandbox !== (order.environment !== 'PRODUCTION');
            const resultsStatus = finalAlreadySaved ? 'results.results_ready' : item.results_status || order.results_status;
            if (RESULT_READY_STATUSES.has(resultsStatus) && !testTakerId && reportNeedsSync) {
                // List results supplies the test taker ID when the original webhook was missed.
                let cursor: string | undefined;
                for (let page = 0; page < 5 && !testTakerId; page++) {
                    const listing = await this.terraGet(`/results?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
                    const matches = (listing.results || []).filter((result: any) =>
                        String(result.order_id) === order.terra_order_id && String(result.order_item_id) === String(item.order_item_id));
                    if (matches.length === 1 && matches[0].test_taker_id) testTakerId = String(matches[0].test_taker_id);
                    if (!listing.next_cursor || listing.next_cursor === cursor) break;
                    cursor = listing.next_cursor;
                }
            }
            const updated = await tx.terraOrder.update({
                where: { id: order.id },
                data: {
                    terra_order_status: remote.order_status || order.terra_order_status,
                    collection_type: remote.collection_type || order.collection_type,
                    terra_order_item_id: String(item.order_item_id),
                    terra_test_taker_id: testTakerId,
                    results_status: resultsStatus,
                    tracking_number: item.lab_tracking_number || remote.tracking_number || order.tracking_number,
                },
            });
            if (resultsStatus && RESULT_READY_STATUSES.has(resultsStatus) && reportNeedsSync) {
                const entry = remote.status_history?.find((entry: any) => entry.status === resultsStatus && String(entry.order_item_id) === String(item.order_item_id));
                await this.syncResultForOrder(updated, resultsStatus, entry?.changed_at ? new Date(entry.changed_at) : new Date(), tx);
            }
            const reconciled = await tx.terraOrder.findUniqueOrThrow({ where: { id: order.id } });
            await syncTerraWorkflow(tx, reconciled);
            return tx.terraOrder.findUnique({ where: { id: order.id } });
        });
    }
    /**
     * Fetches the actual result for an order item and stores a sanitized
     * projection of it on the linked LabResult. Verified against
     * https://docs.tryterra.co/vantage-api/results.md and
     * https://docs.tryterra.co/reference/vantage-api/results.md :
     *   GET /api/v1/results/{orderItemID}?test_taker_id={test_taker_id}
     *     -> { download_url, expires_at, format: "json" }
     *   GET {download_url} -> FHIR Bundle (DiagnosticReport + Patient + Observation[])
     * The presigned download_url is only valid for ~15 minutes and must be
     * re-requested rather than cached — we only ever use it once, immediately.
     */
    private async syncResultForOrder(
        order: {
            id: string;
            terra_order_id: string;
            environment?: string;
            terra_order_item_id: string | null;
            terra_test_taker_id: string | null;
            patient_id: string;
            lab_result_id: string | null;
        },
        resultsStatus: string,
        webhookDeliveredAt: Date,
        tx: Prisma.TransactionClient,
    ) {
        if (!RESULT_READY_STATUSES.has(resultsStatus)) throw new BadRequestException('Terra results are not ready.');
        const orderItemId = order.terra_order_item_id;
        const testTakerId = order.terra_test_taker_id;
        if (!orderItemId || !testTakerId) {
            throw new ServiceUnavailableException('Terra result identifiers are missing. Retry synchronization when they are available.');
        }
        this.assertCredentialsConfigured();

        const urlResponse = await fetch(
            `${terraBaseUrl(order.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX')}/api/v1/results/${orderItemId}?test_taker_id=${encodeURIComponent(testTakerId)}`,
            { headers: { Authorization: this.basicAuthHeader }, signal: AbortSignal.timeout(15000) },
        );
        const urlBody: any = await urlResponse.json().catch(() => null);
        if (!urlResponse.ok || !urlBody?.download_url) {
            throw new ServiceUnavailableException(`Terra result URL is unavailable (HTTP ${urlResponse.status}).`);
        }

        const bundleResponse = await fetch(urlBody.download_url, { signal: AbortSignal.timeout(15000) });
        if (!bundleResponse.ok) {
            throw new ServiceUnavailableException(`Terra report fetch failed (HTTP ${bundleResponse.status}).`);
        }
        const bundle = await bundleResponse.json().catch(() => null);
        if (bundle?.resourceType !== 'Bundle' || !Array.isArray(bundle.entry) || !bundle.entry.some((entry: any) => entry.resource?.resourceType === 'DiagnosticReport')) {
            throw new ServiceUnavailableException('Terra returned an invalid result bundle.');
        }

        const isPartial = resultsStatus === 'results.partial_results_ready';
        const structuredReport: TerraStructuredReport = {
            ...this.parseResultBundle(bundle),
            resultStatus: resultsStatus,
            isPartial,
            isSandbox: order.environment !== 'PRODUCTION',
        };

        const patient = await tx.patient.findUnique({ where: { id: order.patient_id } });
        if (!patient) {
            throw new NotFoundException('Patient not found');
        }

        const job = await tx.sandboxReportJob.findUnique({ where: { order_id: order.id } });
        const labResultData = {
            patient_id: order.patient_id,
            clinic_id: patient.clinic_id,
            file_url: '',
            test_name: job?.test_name || 'Terra Vantage Blood Test',
            result_date: this.resolveReportDate(structuredReport, order.terra_order_id, webhookDeliveredAt),
            status: RESULT_STATUS_LABELS[resultsStatus] ?? resultsStatus,
            source: 'TERRA',
            structured_report: structuredReport as any,
        };

        if (order.lab_result_id) {
            await tx.labResult.update({ where: { id: order.lab_result_id, patient_id: order.patient_id, source: 'TERRA' }, data: labResultData });
        } else {
            const created = await tx.labResult.create({ data: labResultData });
            await tx.terraOrder.update({ where: { id: order.id }, data: { lab_result_id: created.id } });
        }

        this.logger.log(
            `Terra result synced for order ${order.terra_order_id}: ${structuredReport.biomarkers.length} biomarker(s), status ${resultsStatus}.`,
        );
    }

    /**
     * Picks the LabResult's stored result date. Terra's Vantage SANDBOX has
     * been observed returning a fixed placeholder date on every canned
     * fixture result — "1970-01-01T00:29:24+00:00" on DiagnosticReport.effectiveDateTime,
     * every Observation.issued, AND the Bundle's own top-level `timestamp` —
     * confirmed identical across different products/variants/orders, so it is
     * baked into Terra's sandbox test fixture, not something specific to one
     * order. A date that old can never be a genuine specimen/report date, so
     * rather than store it (or fabricate one), we fall back to the real,
     * Terra-reported webhook delivery timestamp — an actual Terra-originated
     * timestamp, just a different (also true) one: when Terra told us the
     * result was ready, instead of when the (placeholder) bundle claims the
     * specimen was processed.
     */
    private resolveReportDate(report: TerraStructuredReport, terraOrderId: string, webhookDeliveredAt: Date): Date {
        const SANDBOX_PLACEHOLDER_CUTOFF_YEAR = 2000; // Vantage did not exist before this; anything earlier is fixture data.
        const candidate = report.issued ?? report.reportDate;
        const parsed = candidate ? new Date(candidate) : null;

        if (parsed && !isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= SANDBOX_PLACEHOLDER_CUTOFF_YEAR) {
            return parsed;
        }

        this.logger.warn(
            `Terra result for order ${terraOrderId} had an implausible report date (${candidate ?? 'none'}) — using webhook delivery time instead.`,
        );
        return webhookDeliveredAt;
    }

    /** Projects a Terra FHIR result Bundle into TerraStructuredReport. Passes through
     * only fields actually present — never fabricates missing values. */
    private parseResultBundle(bundle: any): Omit<TerraStructuredReport, 'resultStatus' | 'isPartial' | 'isSandbox'> {
        const resources = Array.isArray(bundle?.entry)
            ? bundle.entry.map((e: any) => e?.resource).filter(Boolean)
            : [];

        const diagnosticReport = resources.find((r: any) => r.resourceType === 'DiagnosticReport');
        const observations = resources.filter((r: any) => r.resourceType === 'Observation');
        const specimenReferences = (diagnosticReport?.specimen ?? []).map((s: any) => s.reference);
        const specimens = [...resources, ...(diagnosticReport?.contained ?? [])].filter((r: any) =>
            r.resourceType === 'Specimen' && (!specimenReferences.length ||
                specimenReferences.includes(`Specimen/${r.id}`) || specimenReferences.includes(`#${r.id}`) ||
                bundle.entry.some((entry: any) => entry.resource === r && specimenReferences.includes(entry.fullUrl))));
        const collectedDates = [...new Set<string>(specimens.map((specimen: any) =>
            specimen.collection?.collectedDateTime ?? specimen.collection?.collectedPeriod?.start)
            .filter((date: unknown): date is string => typeof date === 'string' && Number.isFinite(Date.parse(date))))];

        const biomarkers: TerraResultBiomarker[] = observations.map((obs: any) => {
            const range = Array.isArray(obs.referenceRange) ? obs.referenceRange[0] : undefined;
            const interpretationCoding = Array.isArray(obs.interpretation) ? obs.interpretation[0]?.coding?.[0] : undefined;

            return {
                name: obs.code?.text ?? obs.code?.coding?.[0]?.display ?? obs.code?.coding?.[0]?.code ?? 'Unknown',
                value: typeof obs.valueQuantity?.value === 'number' ? obs.valueQuantity.value : null,
                unit: obs.valueQuantity?.unit ?? null,
                referenceRange: range ? { low: range.low?.value ?? null, high: range.high?.value ?? null } : null,
                interpretation: interpretationCoding
                    ? { code: interpretationCoding.code ?? null, display: interpretationCoding.display ?? null }
                    : null,
            };
        });

        return {
            reportDate: diagnosticReport?.effectiveDateTime ?? null,
            collectedDate: collectedDates.length === 1 ? collectedDates[0] : null,
            issued: diagnosticReport?.issued ?? null,
            biomarkers,
        };
    }

    private verifyWebhookSignature(signatureHeader: string | undefined, rawBody: Buffer) {
        if (!signatureHeader) {
            throw new UnauthorizedException('Missing X-Terra-Signature header.');
        }

        const parts = new Map<string, string>();
        for (const segment of signatureHeader.split(',')) {
            const [key, value] = segment.split('=');
            if (key && value) parts.set(key.trim(), value.trim());
        }
        const timestamp = parts.get('t');
        const providedSignature = parts.get('v1');
        if (!timestamp || !providedSignature) {
            throw new UnauthorizedException('Malformed X-Terra-Signature header.');
        }

        const toleranceSeconds = 5 * 60;
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
            throw new UnauthorizedException('Webhook timestamp is outside the allowed tolerance window.');
        }

        const signedString = `${timestamp}.${rawBody.toString('utf8')}`;
        const expectedSignature = createHmac('sha256', this.signingSecret as string).update(signedString).digest('hex');

        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const providedBuf = Buffer.from(providedSignature, 'utf8');
        const signatureValid =
            expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

        if (!signatureValid) {
            throw new UnauthorizedException('Terra webhook signature verification failed.');
        }
    }
}

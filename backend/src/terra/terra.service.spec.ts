import { createHmac } from 'crypto';
import { ServiceUnavailableException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { TerraService } from './terra.service';
import { syncTerraWorkflow } from '../workflows/terra-workflow-sync';

jest.mock('../workflows/terra-workflow-sync', () => ({ syncTerraWorkflow: jest.fn().mockResolvedValue(undefined) }));

describe('Terra report ingestion', () => {
    let order: any;
    let db: any;
    let service: TerraService;
    let events: Map<string, unknown>;
    const originalFetch = global.fetch;
    const originalEnv = { ...process.env };
    const bundle = { resourceType: 'Bundle', entry: [
        { resource: { resourceType: 'DiagnosticReport', issued: '2026-09-25T00:00:00Z' } },
        { resource: { resourceType: 'Observation', code: { text: 'Creatinine' }, valueQuantity: { value: 0, unit: 'mg/dL' } } },
    ] };
    const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
    const deliver = (eventId: string, status: string, item = 'item') => {
        const timestamp = Math.floor(Date.now() / 1000);
        const raw = Buffer.from(JSON.stringify({ event_id: eventId, event_type: 'order_item.results_status_change', timestamp,
            data: { order_id: 'remote', order_item_id: item, results_status: status, test_taker: { test_taker_id: 'taker' } } }));
        const signature = createHmac('sha256', 'test-secret').update(`${timestamp}.${raw.toString()}`).digest('hex');
        return service.handleWebhook(`t=${timestamp},v1=${signature}`, raw);
    };

    beforeEach(() => {
        process.env.TERRA_SIGNING_SECRET = 'test-secret';
        process.env.TERRA_DEV_ID = 'test-dev';
        process.env.TERRA_API_KEY = 'test-key';
        order = { id: 'local', terra_order_id: 'remote', patient_id: 'patient', terra_product_id: 'variant',
            terra_order_item_id: 'item', terra_test_taker_id: null, results_status: null, lab_result_id: null };
        events = new Map();
        db = {
            sandboxReportJob: { findUnique: jest.fn().mockResolvedValue(null) },
            $queryRaw: jest.fn().mockResolvedValue([]),
            terraOrder: {
                findUniqueOrThrow: jest.fn(async () => ({ ...order })),
                findUnique: jest.fn(async () => ({ ...order })),
                findFirst: jest.fn(async () => ({ ...order })),
                update: jest.fn(async ({ data }) => { Object.assign(order, data); return { ...order }; }),
            },
            terraWebhookEvent: {
                findUnique: jest.fn(async ({ where }) => events.get(where.event_id)),
                create: jest.fn(async ({ data }) => { events.set(data.event_id, data); return data; }),
            },
            patient: { findUnique: jest.fn().mockResolvedValue({ clinic_id: 'clinic' }) },
            labResult: { create: jest.fn().mockResolvedValue({ id: 'report' }), update: jest.fn().mockResolvedValue({ id: 'report' }) },
        };
        db.$transaction = jest.fn(async fn => fn(db));
        service = new TerraService(db);
        global.fetch = jest.fn(async (url: any) => response(String(url).includes('/api/v1/results/') ? { download_url: 'https://fixture.test/result' } : bundle)) as any;
    });

    afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; });

    it.each([
        [{ collectedDateTime: '2026-09-20T12:00:00Z' }, '2026-09-20T12:00:00Z'],
        [{ collectedPeriod: { start: '2026-09-20T12:00:00Z' } }, '2026-09-20T12:00:00Z'],
        [{ collectedDateTime: 'invalid' }, null],
        [{}, null],
    ])('uses specimen collection time rather than report upload/issue time %#', async (collection, expected) => {
        const specimenBundle = { ...bundle, entry: [...bundle.entry,
            { resource: { resourceType: 'Specimen', collection } },
        ] };
        global.fetch = jest.fn(async (url: any) => response(String(url).includes('/api/v1/results/')
            ? { download_url: 'https://fixture.test/result' } : specimenBundle)) as any;
        await deliver('collection', 'results.results_ready');
        expect(db.labResult.create.mock.calls[0][0].data.structured_report.collectedDate).toBe(expected);
    });

    it('does not invent a report while a sample is pending', async () => {
        await deliver('pending', 'results.awaiting_sample');
        expect(global.fetch).not.toHaveBeenCalled();
        expect(db.labResult.create).not.toHaveBeenCalled();
        expect(syncTerraWorkflow).toHaveBeenCalled();
    });

    it('creates the actual partial result then updates the same report for final results', async () => {
        await deliver('partial', 'results.partial_results_ready');
        expect(order.lab_result_id).toBe('report');
        expect(db.labResult.create.mock.calls[0][0].data).toMatchObject({ patient_id: 'patient', clinic_id: 'clinic', source: 'TERRA', structured_report: { isPartial: true, biomarkers: [{ name: 'Creatinine', value: 0 }] } });
        await deliver('final', 'results.results_ready');
        await deliver('final', 'results.results_ready');
        expect(db.labResult.create).toHaveBeenCalledTimes(1);
        expect(db.labResult.update).toHaveBeenCalledTimes(1);
        expect(db.$queryRaw).toHaveBeenCalled();
    });

    it('keeps the real ready status and retries the same event after an upstream failure', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(response(null, false));
        await expect(deliver('retry', 'results.results_ready')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(order.results_status).toBe('results.results_ready');
        expect(events.has('retry')).toBe(false);
        expect(db.labResult.create).not.toHaveBeenCalled();
        await deliver('retry', 'results.results_ready');
        expect(events.has('retry')).toBe(true);
        expect(db.labResult.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a mismatched order item before fetching or saving', async () => {
        await expect(deliver('wrong-item', 'results.results_ready', 'foreign-item')).rejects.toBeInstanceOf(BadRequestException);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(db.labResult.create).not.toHaveBeenCalled();
    });

    it('does not downgrade a final report on a delayed partial delivery', async () => {
        await deliver('final', 'results.results_ready');
        await deliver('late', 'results.partial_results_ready');
        expect(order.results_status).toBe('results.results_ready');
        expect(db.labResult.update).not.toHaveBeenCalled();
    });

    it('rejects a non-FHIR response without creating an empty report', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(response({ download_url: 'https://fixture.test/result' })).mockResolvedValueOnce(response({ message: 'not a report' }));
        await expect(deliver('invalid', 'results.results_ready')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(db.labResult.create).not.toHaveBeenCalled();
        expect(events.has('invalid')).toBe(false);
    });

    it('rejects unsigned events', async () => {
        await expect(service.handleWebhook(undefined, Buffer.from('{}'))).rejects.toBeInstanceOf(UnauthorizedException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
    it('keeps sandbox reports explicitly marked as simulated', async () => {
        order.environment = 'SANDBOX';
        process.env.TERRA_ENVIRONMENT = 'sandbox';
        await deliver('sandbox-report', 'results.results_ready');
        expect(db.labResult.create.mock.calls[0][0].data.structured_report.isSandbox).toBe(true);
    });

    it('fetches production results from production and preserves their provenance', async () => {
        order.environment = 'PRODUCTION';
        process.env.TERRA_ENVIRONMENT = 'production';
        await deliver('production-report', 'results.results_ready');
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://vantage.tryterra.co/api/v1/results/'), expect.anything());
        expect(db.labResult.create.mock.calls[0][0].data.structured_report.isSandbox).toBe(false);
    });

    it('never treats a legacy sandbox order as a production order', async () => {
        process.env.TERRA_ENVIRONMENT = 'production';
        await expect(deliver('wrong-environment', 'results.results_ready')).rejects.toBeInstanceOf(BadRequestException);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(db.labResult.create).not.toHaveBeenCalled();
    });

    it('blocks simulated ordering when real data is required, without contacting Terra', async () => {
        process.env.TERRA_ENVIRONMENT = 'sandbox';
        process.env.TERRA_REQUIRE_LIVE_DATA = 'true';
        await expect(service.createOrder({} as any, 'clinic')).rejects.toThrow('production access');
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it('polls order progress without re-downloading or downgrading a saved final report', async () => {
        order.lab_result_id = 'report';
        db.labResult.findFirst = jest.fn().mockResolvedValue({ structured_report: { isPartial: false, resultStatus: 'results.results_ready', isSandbox: true } });
        (global.fetch as jest.Mock).mockResolvedValue(response({ order_id: 'remote', order_status: 'order.completed',
            items: [{ order_item_id: 'item', results_status: 'results.awaiting_sample', test_taker_ids: ['taker'] }] }));
        await service.syncOrder('local', 'clinic');
        expect(order.results_status).toBe('results.results_ready');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(db.labResult.update).not.toHaveBeenCalled();
        expect(syncTerraWorkflow).toHaveBeenCalled();
    });

    it('re-fetches legacy final reports missing environment metadata without creating duplicate reports', async () => {
        order.lab_result_id = 'report';
        db.labResult.findFirst = jest.fn().mockResolvedValue({ structured_report: { isPartial: false, resultStatus: 'results.results_ready' } });
        (global.fetch as jest.Mock).mockResolvedValue(response({ order_id: 'remote', order_status: 'order.delivery_fulfilled',
            items: [{ order_item_id: 'item', results_status: 'results.results_ready', test_taker_ids: ['taker'] }] }));
        const refresh = jest.spyOn(service as any, 'syncResultForOrder').mockResolvedValue(undefined);
        await service.syncOrder('local', 'clinic');
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh.mock.calls[0][0]).toMatchObject({ lab_result_id: 'report' });
        expect(db.labResult.create).not.toHaveBeenCalled();
    });
});

describe('sandbox registration and manual orders', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });

    it.each([
        ['entitlement_required', 'TERRA_VANTAGE_ACCESS_REQUIRED', 503],
        ['product_disabled', undefined, 400],
    ])('handles forbidden ordering (%s) without retrying or saving an order', async (upstreamCode, code, status) => {
        Object.assign(process.env, { TERRA_ENVIRONMENT: 'sandbox', TERRA_REQUIRE_LIVE_DATA: 'false',
            TERRA_SANDBOX_AUTO_REPORTS: 'false', TERRA_DEV_ID: 'test', TERRA_API_KEY: 'test' });
        const save = jest.fn();
        const service = new TerraService({ patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) },
            terraOrder: { upsert: save } } as any);
        const post = jest.spyOn(service as any, 'postOrderToTerra').mockResolvedValue({ ok: false, status: 403,
            body: { code: upstreamCode, detail: 'Vantage access is unavailable' } });
        const input = { patient_id: 'patient', variant_id: '100091', collection_type: 'AT_HOME' as const,
            recipient: { first_name: 'Demo', last_name: 'Patient', email: 'patient@example.com', phone_number: '+12025550123', date_of_birth: '1990-01-01', gender_at_birth: 'male' as const },
            shipping_address: { address_line_1: '123 Test St', city: 'Austin', administrative_area: 'TX', postal_code: '78701', country_code: 'US' } };
        await expect(service.createOrder(input, 'clinic')).rejects.toMatchObject({ status, response: {
            code, httpStatus: 403, transient: false,
            message: code ? expect.stringContaining('enable Vantage sandbox access') : 'Vantage access is unavailable',
        } });
        expect(post).toHaveBeenCalledTimes(1);
        expect(save).not.toHaveBeenCalled();
    });

    it('allows manual sandbox ordering without generating automatic reports', async () => {
        process.env.TERRA_ENVIRONMENT = 'sandbox';
        process.env.TERRA_REQUIRE_LIVE_DATA = 'false';
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'false';
        process.env.TERRA_DEV_ID = 'test'; process.env.TERRA_API_KEY = 'test';
        const db: any = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) },
            $queryRaw: jest.fn().mockResolvedValue([]),
            terraOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'local', terra_order_id: 'remote' }), upsert: jest.fn().mockResolvedValue({ id: 'local', terra_order_id: 'remote' }) } };
        db.$transaction = jest.fn(async fn => fn(db));
        const service = new TerraService(db);
        const post = jest.spyOn(service as any, 'postOrderToTerra').mockResolvedValue({ ok: true, status: 200, body: { order_id: 'remote', order_status: 'order.payment_processing', order_items: [] } });
        expect(service.getOrderingConfiguration()).toMatchObject({ environment: 'SANDBOX', orderingEnabled: true });
        expect((await service.getSandboxConfiguration()).enabled).toBe(false);
        await service.createOrder({ patient_id: 'patient', variant_id: '100131', collection_type: 'AT_HOME',
            recipient: { first_name: 'Sandbox', last_name: 'Demo', email: 'sandbox@example.com', phone_number: '+447911123456', date_of_birth: '1990-01-01', gender_at_birth: 'male' },
            shipping_address: { address_line_1: '123 Main Street', city: 'New York', administrative_area: 'NY', postal_code: '10001', country_code: 'US' } }, 'clinic');
        expect(post).toHaveBeenCalledTimes(1);
        const saved = db.terraOrder.upsert.mock.calls[0][0].create;
        expect(saved.environment).toBe('SANDBOX');
        expect(saved.sandboxReportJob).toBeUndefined();
    });

    it('uses the live supported test catalogue and rejects unknown selections', async () => {
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'true';
        process.env.NODE_ENV = 'test';
        const service = new TerraService({} as any);
        jest.spyOn(service, 'getProductTypes').mockResolvedValue([{ id: 1 }, { id: 2 }]);
        jest.spyOn(service, 'getProductsByType').mockImplementation(async id => id === '1' ? [{ id: 10 }] : []);
        jest.spyOn(service, 'getProductVariants').mockResolvedValue([
            { id: 101, variant_name: 'US test', available_collection_types: ['AT_HOME'], supported_ship_to_countries: ['US'] },
            { id: 102, variant_name: 'UK test', available_collection_types: ['AT_HOME'], supported_ship_to_countries: ['GB'] },
            { id: 103, variant_name: 'Unsupported', available_collection_types: ['GO_TO_LAB'], supported_ship_to_countries: ['US'] },
        ]);
        expect((await service.getSandboxConfiguration()).tests).toEqual([
            { id: '101', name: 'US test', country: 'US' }, { id: '102', name: 'UK test', country: 'GB' },
        ]);
        expect(await service.prepareSandboxTest('102')).toEqual({ id: '102', name: 'UK test', country: 'GB' });
        await expect(service.prepareSandboxTest('unknown')).rejects.toBeInstanceOf(BadRequestException);
        process.env.NODE_ENV = 'production';
        expect(await service.prepareSandboxTest('unknown')).toBeNull();
        expect((await service.getSandboxConfiguration()).enabled).toBe(false);
    });

    it('queues manual tests and retries a confirmed supplier failure with a fresh key and the same order reference', async () => {
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'true';
        process.env.NODE_ENV = 'test';
        process.env.TERRA_DEV_ID = 'test'; process.env.TERRA_API_KEY = 'test';
        const db: any = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) },
            $queryRaw: jest.fn().mockResolvedValue([]),
            terraOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'local', terra_order_id: 'remote' }), upsert: jest.fn().mockResolvedValue({ id: 'local', terra_order_id: 'remote' }) } };
        db.$transaction = jest.fn(async fn => fn(db));
        const service = new TerraService(db);
        jest.spyOn(service, 'getSandboxConfiguration').mockResolvedValue({ enabled: true, delaySeconds: 300, tests: [{ id: '100131', name: 'Vitamin D', country: 'US' }] });
        const post = jest.spyOn(service as any, 'postOrderToTerra')
            .mockResolvedValueOnce({ ok: false, status: 503, body: {} })
            .mockResolvedValueOnce({ ok: true, status: 200, body: { order_id: 'remote', order_status: 'order.payment_processing', order_items: [] } });
        const before = Date.now();
        await service.createOrder({ patient_id: 'patient', variant_id: '100131', collection_type: 'AT_HOME',
            recipient: { first_name: 'Sandbox', last_name: 'Demo', email: 'sandbox@example.com', phone_number: '+447911123456', date_of_birth: '1990-01-01', gender_at_birth: 'male' },
            shipping_address: { address_line_1: '123 Main Street', city: 'New York', administrative_area: 'NY', postal_code: '10001', country_code: 'US' } }, 'clinic');
        expect(post.mock.calls[0][1]).not.toBe(post.mock.calls[1][1]);
        expect(post.mock.calls[0][0]).toEqual(post.mock.calls[1][0]);
        const queued = db.terraOrder.upsert.mock.calls[0][0].create.sandboxReportJob.create;
        expect(queued).toMatchObject({ patient_id: 'patient', variant_id: '100131', test_name: 'Vitamin D', status: 'WAITING' });
        expect(queued.due_at.getTime()).toBeGreaterThanOrEqual(before + 300000);
        expect(queued.next_attempt_at.getTime()).toBeLessThanOrEqual(Date.now() + 300000);
    });

    it('keeps four-package patient creation independent of the live Terra catalogue', async () => {
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'true'; process.env.NODE_ENV = 'test';
        const service = new TerraService({} as any);
        const catalog = jest.spyOn(service, 'getSandboxConfiguration');
        expect(await service.prepareSandboxTest(undefined)).toBeNull();
        expect(catalog).not.toHaveBeenCalled();
    });

    it('exposes both Essential kits from Terra', async () => {
        process.env.TERRA_DEV_ID = 'test'; process.env.TERRA_API_KEY = 'test';
        const db: any = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) } };
        const service = new TerraService(db);
        const previousFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 100011 }, { id: 100012 }] });
        try {
            expect(await service.getProductVariants('10001')).toEqual([{ id: 100011 }, { id: 100012 }]);
        } finally {
            global.fetch = previousFetch;
        }
    });
    it.each(['100011', '100012'])('sends Essential kit %s with the US address unchanged and preserves supplier rejection', async variant_id => {
        process.env.TERRA_ENVIRONMENT = 'sandbox'; process.env.TERRA_REQUIRE_LIVE_DATA = 'false';
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'false';
        process.env.TERRA_DEV_ID = 'test'; process.env.TERRA_API_KEY = 'test';
        const save = jest.fn();
        const patientLookup = jest.fn().mockResolvedValue({ id: 'patient' });
        const service = new TerraService({ patient: { findFirst: patientLookup }, terraOrder: { upsert: save } } as any);
        const post = jest.spyOn(service as any, 'postOrderToTerra').mockResolvedValue({ ok: false, status: 400, body: { detail: 'This test is not available in the provided country. Supported country codes: GB.' } });
        const input = { patient_id: 'patient', variant_id, collection_type: 'AT_HOME' as const,
            recipient: { first_name: 'Demo', last_name: 'Patient', email: 'patient@gmail.com', phone_number: '+12025550123', date_of_birth: '1990-01-01', gender_at_birth: 'male' as const },
            shipping_address: { address_line_1: '123 Test St', city: 'Austin', administrative_area: 'TX', postal_code: '78845', country_code: 'US' } };
        await expect(service.createOrder(input, 'clinic')).rejects.toMatchObject({ response: {
            code: 'TERRA_SHIPPING_COUNTRY_UNSUPPORTED',
            message: 'Terra does not deliver this kit to the United States. Choose a US-supported test.',
        } });
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][0]).toMatchObject({ items: [{ variant_id, quantity: 1 }], shipping_address: input.shipping_address });
        expect(save).not.toHaveBeenCalled();
    });
});

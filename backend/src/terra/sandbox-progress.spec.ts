import { TerraService } from './terra.service';

describe('sandbox timed progress', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });

    it('progresses confirmed stages separately and requests the final report at five minutes', async () => {
        Object.assign(process.env, { NODE_ENV: 'test', TERRA_ENVIRONMENT: 'sandbox', TERRA_SANDBOX_AUTO_REPORTS: 'true', TERRA_REQUIRE_LIVE_DATA: 'false', TERRA_DEV_ID: 'test', TERRA_API_KEY: 'test' });
        const remote = { order_id: 'remote', order_status: 'order.payment_processing', items: [{ order_item_id: 'item', variant_id: 'variant', results_status: 'results.awaiting_sample' }] };
        const events: string[] = [];
        global.fetch = jest.fn(async (_url, options: any) => {
            if (options?.method === 'POST') {
                const { event } = JSON.parse(options.body);
                events.push(event);
                if (['payment_complete', 'processing', 'delivery_fulfilled', 'completed'].includes(event)) remote.order_status = `order.${event}`;
                else remote.items[0].results_status = `results.${event}`;
            }
            return { ok: true, json: async () => remote } as any;
        });
        const service = new TerraService({ terraOrder: { findFirst: jest.fn().mockResolvedValue({ environment: 'SANDBOX', terra_order_id: 'remote', terra_order_item_id: 'item', terra_product_id: 'variant' }) } } as any);
        jest.spyOn(service, 'syncOrder').mockImplementation(async () => ({
            results_status: remote.items[0].results_status,
            terra_order_status: remote.order_status,
            lab_result_id: remote.items[0].results_status === 'results.results_ready' ? 'report' : null,
        }) as any);
        for (const elapsed of [0, 30000, 60000, 90000, 120000, 150000]) await service.advanceSandboxOrder('local', 'clinic', elapsed);
        expect(events).toEqual(['payment_complete', 'processing', 'delivery_fulfilled', 'kit_activated', 'sample_processing_in_lab']);
        await service.advanceSandboxOrder('local', 'clinic', 299999);
        expect(events).not.toContain('results_ready');
        await service.advanceSandboxOrder('local', 'clinic', 300000);
        expect(events.at(-1)).toBe('results_ready');
        expect(events).not.toContain('completed');
        await service.advanceSandboxOrder('local', 'clinic', 330000);
        expect(events.at(-1)).toBe('completed');
        await service.advanceSandboxOrder('local', 'clinic', 360000);
        expect(events.filter(e => e === 'results_ready')).toHaveLength(1);
        expect(events.filter(e => e === 'completed')).toHaveLength(1);
        expect((global.fetch as jest.Mock).mock.calls.every(([url]) => !String(url).includes('/acknowledge'))).toBe(true);
    });

    it('does not complete when the final report has not been saved', async () => {
        Object.assign(process.env, { NODE_ENV: 'test', TERRA_ENVIRONMENT: 'sandbox', TERRA_SANDBOX_AUTO_REPORTS: 'true', TERRA_REQUIRE_LIVE_DATA: 'false', TERRA_DEV_ID: 'test', TERRA_API_KEY: 'test' });
        global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ order_id: 'remote', order_status: 'order.delivery_fulfilled',
            items: [{ order_item_id: 'item', results_status: 'results.results_ready' }] }) }) as any);
        const service = new TerraService({ terraOrder: { findFirst: jest.fn().mockResolvedValue({ environment: 'SANDBOX', terra_order_id: 'remote', terra_order_item_id: 'item' }) } } as any);
        jest.spyOn(service, 'syncOrder').mockResolvedValue({ lab_result_id: null, results_status: 'results.results_ready' } as any);
        await service.advanceSandboxOrder('local', 'clinic', 360000);
        expect((global.fetch as jest.Mock).mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
    });

    it('never simulates a production order', async () => {
        Object.assign(process.env, { NODE_ENV: 'test', TERRA_ENVIRONMENT: 'sandbox', TERRA_SANDBOX_AUTO_REPORTS: 'true', TERRA_REQUIRE_LIVE_DATA: 'false' });
        global.fetch = jest.fn();
        const service = new TerraService({ terraOrder: { findFirst: jest.fn().mockResolvedValue({ environment: 'PRODUCTION' }) } } as any);
        await expect(service.advanceSandboxOrder('local', 'clinic')).rejects.toThrow('Only sandbox');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

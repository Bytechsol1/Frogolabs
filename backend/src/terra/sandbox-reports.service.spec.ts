import { SandboxReportsService } from './sandbox-reports.service';

describe('automatic sandbox reports', () => {
    const env = { ...process.env };
    let job: any;
    let db: any;
    let terra: any;
    let service: SandboxReportsService;
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-26T00:00:00Z'));
        process.env.NODE_ENV = 'test';
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'true';
        process.env.TERRA_ENVIRONMENT = 'sandbox';
        process.env.TERRA_REQUIRE_LIVE_DATA = 'false';
        job = { id: 'job', patient_id: 'patient', patient: { clinic_id: 'clinic' }, order_id: null, order: { patient_id: 'patient' },
            variant_id: '100091', test_name: 'Thyroid Function', country_code: 'US', attempts: 0,
            due_at: new Date(Date.now() + 300000) };
        db = { terraOrder: { findMany: jest.fn().mockResolvedValue([]) }, sandboxReportJob: { upsert: jest.fn(), findMany: jest.fn(async () => [{ ...job }]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn(async ({ data }) => Object.assign(job, data)) } };
        terra = { getSandboxConfiguration: jest.fn().mockResolvedValue({ tests: [{ id: '100091', name: 'Thyroid Function', country: 'US' }] }), createOrder: jest.fn().mockResolvedValue({ saved: { id: 'order' } }),
            advanceSandboxOrder: jest.fn(async (_id, _clinic, elapsed) => elapsed >= 300000 ? {
                lab_result_id: 'result', results_status: 'results.results_ready',
                terra_order_status: elapsed >= 330000 ? 'order.completed' : 'order.delivery_fulfilled',
            } : { lab_result_id: null, results_status: 'results.awaiting_sample' }) };
        service = new SandboxReportsService(db, terra);
    });
    afterEach(() => { service.onModuleDestroy(); jest.useRealTimers(); process.env = { ...env }; });

    it('recovers an existing order with its original five-minute deadline without placing another order', async () => {
        const created = new Date(Date.now() - 60000);
        db.terraOrder.findMany.mockResolvedValue([{ id: 'existing', patient_id: 'patient', terra_product_id: '100091', created_at: created }]);
        await service.restorePendingOrders();
        expect(db.sandboxReportJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { order_id: 'existing' }, update: {},
            create: expect.objectContaining({ order_id: 'existing', status: 'WAITING', due_at: new Date(created.getTime() + 300000) }),
        }));
        expect(terra.createOrder).not.toHaveBeenCalled();
    });

    it('orders the selected test immediately, then waits five minutes before requesting results', async () => {
        await service.runDueJobs();
        expect(terra.createOrder).toHaveBeenCalledWith(expect.objectContaining({ patient_id: 'patient', variant_id: '100091' }), 'clinic', { referenceId: 'frigoflow-sandbox-job', testName: 'Thyroid Function' });
        expect(terra.advanceSandboxOrder).toHaveBeenCalledWith('order', 'clinic', 0);
        expect(job).toMatchObject({ order_id: 'order', status: 'WAITING', next_attempt_at: new Date(Date.now() + 30000) });
        jest.advanceTimersByTime(300000);
        // A new worker instance resumes the persisted job after a restart.
        await new SandboxReportsService(db, terra).runDueJobs();
        expect(terra.createOrder).toHaveBeenCalledTimes(1);
        expect(terra.advanceSandboxOrder).toHaveBeenCalledWith('order', 'clinic', 300000);
        expect(job.status).toBe('WAITING');
        jest.advanceTimersByTime(30000);
        await service.runDueJobs();
        expect(job.status).toBe('COMPLETED');
    });

    it('does not process jobs while disabled or in production', async () => {
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'false';
        await service.runDueJobs();
        process.env.TERRA_SANDBOX_AUTO_REPORTS = 'true';
        process.env.NODE_ENV = 'production';
        await service.runDueJobs();
        expect(db.sandboxReportJob.findMany).not.toHaveBeenCalled();
        expect(terra.createOrder).not.toHaveBeenCalled();
    });

    it('never advances an order belonging to a different patient', async () => {
        job.order_id = 'other-order';
        job.order.patient_id = 'other-patient';
        await service.runDueJobs();
        expect(terra.advanceSandboxOrder).not.toHaveBeenCalled();
        expect(terra.createOrder).not.toHaveBeenCalled();
    });

    it('does not process a job leased by another worker', async () => {
        db.sandboxReportJob.updateMany.mockResolvedValue({ count: 0 });
        await service.runDueJobs();
        expect(terra.createOrder).not.toHaveBeenCalled();
    });

    it('reopens old report-only jobs only for eligible sandbox orders', async () => {
        await service.restorePendingOrders();
        expect(db.sandboxReportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: 'COMPLETED', order: expect.objectContaining({
                environment: 'SANDBOX', patient: { is_demo: false, clinic: { is_demo: false } },
            }) }),
            data: expect.objectContaining({ status: 'WAITING', attempts: 0 }),
        }));
    });

    it('retries upstream failures without creating another order or claiming a report is ready', async () => {
        job.order_id = 'order'; job.due_at = new Date();
        terra.advanceSandboxOrder.mockRejectedValueOnce(new Error('upstream unavailable'));
        await service.runDueJobs();
        expect(job.status).toBe('RETRYING');
        expect(job.next_attempt_at.getTime()).toBe(Date.now() + 30000);
        expect(terra.createOrder).not.toHaveBeenCalled();
        jest.advanceTimersByTime(30000);
        await service.runDueJobs();
        expect(job.status).toBe('COMPLETED');
    });

    it('keeps a failed job visible after the retry limit', async () => {
        job.attempts = 9;
        terra.createOrder.mockRejectedValue(new Error('supplier unavailable'));
        await service.runDueJobs();
        expect(job.status).toBe('FAILED');
        expect(job.last_error).toContain('retry');
    });
});

import { confirmedTerraStages, syncTerraWorkflow } from './terra-workflow-sync';

describe('automatic Terra workflow progression', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });
    const order = (extra = {}) => ({ id: 'order', patient_id: 'patient', workflow_id: 'workflow',
        created_at: new Date(), collection_type: 'AT_HOME', terra_order_status: 'order.payment_processing',
        results_status: 'results.awaiting_sample', lab_result_id: null, ...extra } as any);

    it('waits for real events and does not invent instructions, collection or reports', () => {
        expect(confirmedTerraStages(order(), false)).toEqual(['TEST_PACKAGE_SELECTED']);
        expect(confirmedTerraStages(order({ results_status: 'results.kit_activated' }), false)).toEqual(['TEST_PACKAGE_SELECTED']);
    });
    it('records shipped kits only for at-home fulfillment', () => {
        expect(confirmedTerraStages(order({ terra_order_status: 'order.delivery_fulfilled' }), false)).toContain('KIT_SHIPPED');
        expect(confirmedTerraStages(order({ terra_order_status: 'order.delivery_fulfilled', collection_type: 'GO_TO_LAB' }), false)).not.toContain('KIT_SHIPPED');
    });
    it('confirms sample collection and processing when the lab receives it', () => {
        expect(confirmedTerraStages(order({ results_status: 'results.sample_processing_in_lab' }), false)).toEqual(['TEST_PACKAGE_SELECTED', 'SAMPLE_COLLECTED', 'LAB_PROCESSING']);
    });
    it('requires a saved final report for ready/completed, not partial results or just remote status', () => {
        expect(confirmedTerraStages(order({ results_status: 'results.results_ready', terra_order_status: 'order.completed' }), false)).not.toContain('RESULTS_READY');
        expect(confirmedTerraStages(order({ results_status: 'results.partial_results_ready' }), true)).not.toContain('RESULTS_READY');
        expect(confirmedTerraStages(order({ results_status: 'results.results_ready' }), true)).toContain('RESULTS_READY');
        expect(confirmedTerraStages(order({ results_status: 'results.results_ready' }), true)).not.toContain('COMPLETED');
        expect(confirmedTerraStages(order({ results_status: 'results.results_ready', terra_order_status: 'order.completed' }), true)).toContain('COMPLETED');
    });

    function database(status = 'PATIENT_CREATED') {
        const workflow = { id: 'workflow', status };
        const tx: any = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ clinic_id: 'clinic' }) },
            workflow: {
                findFirst: jest.fn().mockResolvedValue(workflow),
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn().mockResolvedValue(workflow),
                updateMany: jest.fn(async ({ where, data }) => {
                    if (!where.status.in.includes(workflow.status)) return { count: 0 };
                    workflow.status = data.status; return { count: 1 };
                }),
            },
            terraOrder: { update: jest.fn() },
            workflowHistory: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            sandboxReportJob: { findUnique: jest.fn().mockResolvedValue(null) },
            labResult: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        };
        return { tx, workflow };
    }
    it('advances once, records automatic history, and ignores duplicate or older events', async () => {
        const { tx, workflow } = database();
        await syncTerraWorkflow(tx, order({ results_status: 'results.sample_processing_in_lab' }));
        expect(workflow.status).toBe('LAB_PROCESSING');
        expect(tx.workflowHistory.create).toHaveBeenCalledTimes(3);
        expect(tx.workflowHistory.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ updated_by: null, status: 'LAB_PROCESSING' }) });
        await syncTerraWorkflow(tx, order({ results_status: 'results.sample_processing_in_lab' }));
        await syncTerraWorkflow(tx, order());
        expect(workflow.status).toBe('LAB_PROCESSING');
        expect(tx.workflowHistory.create).toHaveBeenCalledTimes(3);
    });
    it('validates saved report data and links it to the same workflow', async () => {
        const { tx, workflow } = database('LAB_PROCESSING');
        tx.labResult.findFirst.mockResolvedValue({ id: 'report', structured_report: { isPartial: true } });
        await syncTerraWorkflow(tx, order({ lab_result_id: 'report', results_status: 'results.results_ready' }));
        expect(workflow.status).toBe('LAB_PROCESSING');
        tx.labResult.findFirst.mockResolvedValue({ id: 'report', structured_report: { isPartial: false, resultStatus: 'results.results_ready' } });
        await syncTerraWorkflow(tx, order({ lab_result_id: 'report', results_status: 'results.results_ready', terra_order_status: 'order.completed' }));
        expect(workflow.status).toBe('COMPLETED');
        expect(tx.labResult.update).toHaveBeenCalledWith({ where: { id: 'report' }, data: { workflow_id: 'workflow' } });
    });
    it('rejects cross-patient workflow links without updating history', async () => {
        const { tx } = database(); tx.workflow.findFirst.mockResolvedValue(null);
        await expect(syncTerraWorkflow(tx, order())).rejects.toThrow('mapping mismatch');
        expect(tx.workflowHistory.create).not.toHaveBeenCalled();
        expect(tx.workflow.findFirst).toHaveBeenCalledWith({ where: { id: 'workflow', patient_id: 'patient', clinic_id: 'clinic' } });
    });
    it('does not attach an extra order to a workflow that already has an order or report', async () => {
        const { tx } = database();
        await syncTerraWorkflow(tx, order({ workflow_id: null }));
        expect(tx.workflow.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ terraOrders: { none: {} }, results: { none: {} } }) }));
        expect(tx.workflow.create).toHaveBeenCalled();
    });

    it('repairs the sandbox instructions step once without regressing a later stage or inventing delivery', async () => {
        Object.assign(process.env, { NODE_ENV: 'test', TERRA_ENVIRONMENT: 'sandbox', TERRA_SANDBOX_AUTO_REPORTS: 'true', TERRA_REQUIRE_LIVE_DATA: 'false' });
        const { tx, workflow } = database('RESULTS_READY');
        const sandboxOrder = order({ environment: 'SANDBOX', terra_order_status: 'order.delivery_fulfilled' });
        await syncTerraWorkflow(tx, sandboxOrder);
        expect(workflow.status).toBe('RESULTS_READY');
        expect(tx.workflowHistory.create).toHaveBeenCalledTimes(1);
        expect(tx.workflowHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            status: 'TASSO_INSTRUCTIONS_SENT', notes: 'Sandbox demo: instructions step simulated; no email or SMS was sent.',
        }) });
        tx.workflowHistory.findFirst.mockResolvedValue({ id: 'existing' });
        await syncTerraWorkflow(tx, sandboxOrder);
        expect(tx.workflowHistory.create).toHaveBeenCalledTimes(1);
    });

    it.each(['production-order', 'disabled', 'production-process'])('never simulates instructions in %s', async mode => {
        Object.assign(process.env, { NODE_ENV: mode === 'production-process' ? 'production' : 'test', TERRA_ENVIRONMENT: 'sandbox', TERRA_SANDBOX_AUTO_REPORTS: mode === 'disabled' ? 'false' : 'true', TERRA_REQUIRE_LIVE_DATA: 'false' });
        const { tx } = database('RESULTS_READY');
        await syncTerraWorkflow(tx, order({ environment: mode === 'production-order' ? 'PRODUCTION' : 'SANDBOX', terra_order_status: 'order.delivery_fulfilled' }));
        expect(tx.workflowHistory.create).not.toHaveBeenCalled();
    });
});

import { Prisma, TerraOrder, WorkflowStatus } from '@prisma/client';
import { sandboxAutoReportsEnabled } from '../terra/sandbox-config';

const stages: WorkflowStatus[] = ['PATIENT_CREATED', 'TEST_PACKAGE_SELECTED', 'TASSO_INSTRUCTIONS_SENT',
    'KIT_SHIPPED', 'SAMPLE_COLLECTED', 'LAB_PROCESSING', 'RESULTS_READY', 'COMPLETED'];

export function confirmedTerraStages(order: Pick<TerraOrder, 'terra_order_status' | 'results_status' | 'collection_type'>,
    finalReportSaved: boolean): WorkflowStatus[] {
    const confirmed: WorkflowStatus[] = ['TEST_PACKAGE_SELECTED'];
    if (order.collection_type === 'AT_HOME' && ['order.delivery_fulfilled', 'order.completed'].includes(order.terra_order_status)) {
        confirmed.push('KIT_SHIPPED');
    }
    if (['results.sample_processing_in_lab', 'results.partial_results_ready', 'results.results_ready'].includes(order.results_status || '')) {
        // A sample processing in the lab confirms collection, not its exact time.
        confirmed.push('SAMPLE_COLLECTED', 'LAB_PROCESSING');
    }
    if (order.results_status === 'results.results_ready' && finalReportSaved) {
        confirmed.push('RESULTS_READY');
        if (order.terra_order_status === 'order.completed') confirmed.push('COMPLETED');
    }
    return confirmed;
}

// Called inside the same transaction as the signed webhook / order reconciliation.
export async function syncTerraWorkflow(tx: Prisma.TransactionClient, order: TerraOrder) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`terra-workflow:${order.patient_id}`}))`;
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: order.patient_id }, select: { clinic_id: true } });
    let workflow = order.workflow_id ? await tx.workflow.findFirst({
        where: { id: order.workflow_id, patient_id: order.patient_id, clinic_id: patient.clinic_id },
    }) : null;
    if (order.workflow_id && !workflow) throw new Error('Terra workflow patient mapping mismatch.');
    if (!workflow) {
        const candidates = await tx.workflow.findMany({
            where: { patient_id: order.patient_id, clinic_id: patient.clinic_id,
                created_at: { lte: order.created_at }, terraOrders: { none: {} }, results: { none: {} } },
            orderBy: { created_at: 'desc' }, take: 2,
        });
        // Reuse only an unambiguous enrollment workflow. Every additional order
        // gets its own mapping, so old deliveries cannot advance a newer test.
        workflow = candidates.length === 1 ? candidates[0] : await tx.workflow.create({ data: {
            patient_id: order.patient_id, clinic_id: patient.clinic_id,
            test_type: (await tx.sandboxReportJob.findUnique({ where: { order_id: order.id } }))?.test_name || 'Terra Lab Test',
            created_at: order.created_at,
        } });
        await tx.terraOrder.update({ where: { id: order.id }, data: { workflow_id: workflow.id } });
    }
    const report = order.lab_result_id ? await tx.labResult.findFirst({
        where: { id: order.lab_result_id, patient_id: order.patient_id, source: 'TERRA' },
    }) : null;
    if (report) await tx.labResult.update({ where: { id: report.id }, data: { workflow_id: workflow.id } });
    const structured = report?.structured_report as { isPartial?: boolean; resultStatus?: string } | null;
    const finalSaved = !!report && structured?.isPartial === false && structured.resultStatus === 'results.results_ready';
    const confirmed = confirmedTerraStages(order, finalSaved);
    const demoInstructions = order.environment === 'SANDBOX' && sandboxAutoReportsEnabled()
        && ['order.processing', 'order.delivery_fulfilled', 'order.completed'].includes(order.terra_order_status);
    if (demoInstructions) confirmed.splice(1, 0, 'TASSO_INSTRUCTIONS_SENT');
    for (const status of confirmed) {
        // Compare-and-set prevents duplicate history and regressions on retries.
        const changed = await tx.workflow.updateMany({
            where: { id: workflow.id, patient_id: order.patient_id, clinic_id: patient.clinic_id,
                status: { in: stages.slice(0, stages.indexOf(status)) } },
            data: { status },
        });
        // Older sandbox jobs skipped this step. Repair its history without
        // rolling a later stage backward, under the patient advisory lock.
        const simulatedInstructions = demoInstructions && status === 'TASSO_INSTRUCTIONS_SENT';
        const missingDemoHistory = simulatedInstructions && !await tx.workflowHistory.findFirst({
            where: { workflow_id: workflow.id, status }, select: { id: true },
        });
        if (simulatedInstructions ? missingDemoHistory : changed.count) await tx.workflowHistory.create({ data: {
            workflow_id: workflow.id, status, updated_by: null,
            notes: simulatedInstructions
                ? 'Sandbox demo: instructions step simulated; no email or SMS was sent.'
                : `Automatically confirmed from Terra (${order.terra_order_status}; ${order.results_status || 'results pending'}).`,
        } });
    }
}

import { Prisma } from '@prisma/client';
import { terraEnvironment } from '../terra/terra-environment';

// Registration totals belong to FrigoFlow. Clinical progress must have live Terra evidence.
export const registeredClinicWhere: Prisma.ClinicWhereInput = { is_demo: false };
export const registeredPatientWhere: Prisma.PatientWhereInput = { is_demo: false, clinic: { is_demo: false } };
export const liveWorkflowWhere: Prisma.WorkflowWhereInput = {
    patient: registeredPatientWhere,
    terraOrders: { some: { environment: 'PRODUCTION' } },
};
export const liveResultWhere: Prisma.LabResultWhereInput = {
    source: 'TERRA', patient: registeredPatientWhere,
    terraOrders: { some: { environment: 'PRODUCTION' } },
    structured_report: { path: ['isSandbox'], equals: false },
};

export function displayedTerraEnvironment() {
    return terraEnvironment() === 'SANDBOX' && process.env.TERRA_SHOW_SANDBOX_DATA === 'true' ? 'SANDBOX' : 'PRODUCTION';
}

export function displayedWorkflowWhere(): Prisma.WorkflowWhereInput {
    return { patient: registeredPatientWhere, terraOrders: { some: { environment: displayedTerraEnvironment() } } };
}

// Enrollment alone is not a placed lab order. Count each patient once in the
// currently displayed environment, regardless of workflow/result status.
export function awaitingTestOrderWhere(clinicId?: string | null): Prisma.PatientWhereInput {
    return {
        ...registeredPatientWhere,
        ...(clinicId ? { clinic_id: clinicId } : {}),
        terraOrders: { none: { environment: displayedTerraEnvironment() } },
    };
}

export function displayedResultWhere(): Prisma.LabResultWhereInput {
    return {
        source: 'TERRA', patient: registeredPatientWhere,
        terraOrders: { some: { environment: displayedTerraEnvironment() } },
        structured_report: { path: ['isSandbox'], equals: displayedTerraEnvironment() === 'SANDBOX' },
    };
}

// Count saved final reports, including reports attached to completed sessions.
// A workflow status alone is not evidence that a report is available.
export function readyResultWhere(): Prisma.LabResultWhereInput {
    return { ...displayedResultWhere(), AND: [
        { structured_report: { path: ['isPartial'], equals: false } },
        { structured_report: { path: ['resultStatus'], equals: 'results.results_ready' } },
    ] };
}

export function isFinalTerraReport(report: { source: string; structured_report: unknown }): boolean {
    const data = report.structured_report as { isPartial?: boolean; resultStatus?: string } | null;
    return report.source === 'TERRA' && data?.isPartial === false && data.resultStatus === 'results.results_ready';
}

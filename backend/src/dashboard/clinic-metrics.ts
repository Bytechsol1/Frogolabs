import { PrismaService } from '../prisma/prisma.service';
import { registeredPatientWhere, displayedWorkflowWhere, readyResultWhere, awaitingTestOrderWhere } from './live-data';

// Shared by the clinic dashboard and the administrator's view of that clinic.
export function clinicMetricQueries(prisma: PrismaService, clinicId: string) {
    const patientsWhere = { ...registeredPatientWhere, clinic_id: clinicId };
    const sessionsWhere = { ...displayedWorkflowWhere(), clinic_id: clinicId };
    return [
        prisma.patient.count({ where: patientsWhere }),
        prisma.workflow.count({ where: { ...sessionsWhere, status: { not: 'COMPLETED' } } }),
        prisma.patient.count({ where: { ...patientsWhere, results: { some: { ...readyResultWhere(), clinic_id: clinicId } } } }),
        prisma.workflow.count({ where: { ...sessionsWhere, status: 'COMPLETED' } }),
        prisma.patient.count({ where: awaitingTestOrderWhere(clinicId) }),
    ] as const;
}

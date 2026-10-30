import { Prisma } from '@prisma/client';
import { registeredPatientWhere, displayedWorkflowWhere } from '../dashboard/live-data';

export function patientDirectoryQuery(clinicId: string | null) {
    const scope = clinicId ? { clinic_id: clinicId } : {};
    return {
        where: { ...registeredPatientWhere, ...scope },
        omit: { validic_marketplace_url: true },
        include: {
            clinic: { select: { name: true } },
            workflows: {
                where: { ...displayedWorkflowWhere(), ...scope },
                orderBy: { created_at: 'desc' },
                take: 1,
                select: { id: true, test_type: true, status: true, created_at: true, updated_at: true },
            },
        },
        orderBy: { created_at: 'desc' },
    } satisfies Prisma.PatientFindManyArgs;
}

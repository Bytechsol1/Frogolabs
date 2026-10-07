import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registeredClinicWhere, registeredPatientWhere, displayedTerraEnvironment, displayedWorkflowWhere, readyResultWhere } from './live-data';
import { terraEnvironment } from '../terra/terra-environment';
import { clinicMetricQueries } from './clinic-metrics';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getAdminStats() {
        const include = { patient: true, clinic: { select: { name: true } } } as const;
        const [totalClinics, totalPatients, activeWorkflows, completedWorkflows, resultsReady, recent, attention, telemetry, activeClinics] = await this.prisma.$transaction([
            this.prisma.clinic.count({ where: registeredClinicWhere }),
            this.prisma.patient.count({ where: registeredPatientWhere }),
            this.prisma.workflow.count({ where: { ...displayedWorkflowWhere(), status: { not: 'COMPLETED' } } }),
            this.prisma.workflow.count({ where: { ...displayedWorkflowWhere(), status: 'COMPLETED' } }),
            this.prisma.patient.count({ where: { ...registeredPatientWhere, results: { some: readyResultWhere() } } }),
            this.prisma.workflow.findMany({ where: { ...displayedWorkflowWhere(), status: { not: 'COMPLETED' } }, take: 5, orderBy: { updated_at: 'desc' }, include }),
            this.prisma.workflow.findMany({ where: { ...displayedWorkflowWhere(), status: { in: ['RESULTS_READY', 'SAMPLE_COLLECTED', 'KIT_SHIPPED'] } }, take: 3, orderBy: { updated_at: 'desc' }, include }),
            this.prisma.patient.findMany({ where: { ...registeredPatientWhere, validic_user_id: { not: null } }, take: 3, orderBy: { updated_at: 'desc' } }),
            this.prisma.clinic.findMany({
                // The clinic directory treats legacy missing status as Active.
                where: { ...registeredClinicWhere, OR: [{ status: 'Active' }, { status: null }, { status: '' }] },
                select: { id: true, name: true, contact_name: true, email: true, status: true },
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
            }),
        ]);
        const rows = (workflows: typeof recent) => workflows.map(w => ({
            ...w.patient, clinic: w.clinic,
            workflows: [{ id: w.id, status: w.status, test_type: w.test_type, created_at: w.created_at, updated_at: w.updated_at }],
        }));
        return {
            kpi: { totalClinics, totalPatients, activeWorkflows, completedWorkflows, resultsReady },
            tables: { recentPatients: rows(recent), attentionPatients: rows(attention), telemetryPatients: telemetry, activeClinics },
            source: { environment: terraEnvironment(), liveOnly: displayedTerraEnvironment() === 'PRODUCTION' },
            updatedAt: new Date().toISOString(),
        };
    }

    async getClinicStats(clinicId: string) {
        if (!clinicId) throw new ForbiddenException('A clinic account is required.');
        const patientsWhere = { ...registeredPatientWhere, clinic_id: clinicId };
        const sessionsWhere = { ...displayedWorkflowWhere(), clinic_id: clinicId };
        const readySessionsWhere = { ...sessionsWhere, results: { some: readyResultWhere() } };
        const [totalPatients, activeTesting, resultsReady, completedTesting, awaitingTestOrders, recentPatients] = await this.prisma.$transaction([
            ...clinicMetricQueries(this.prisma, clinicId),
            this.prisma.patient.findMany({
                where: { ...patientsWhere, workflows: { some: readySessionsWhere } }, orderBy: { created_at: 'desc' },
                select: {
                    id: true, first_name: true, last_name: true,
                    workflows: {
                        where: readySessionsWhere, take: 1, orderBy: { updated_at: 'desc' },
                        select: { id: true, status: true, test_type: true, updated_at: true },
                    },
                },
            }),
        ]);
        return {
            kpi: { totalPatients, activeTesting, resultsReady, completedTesting, awaitingTestOrders },
            tables: { recentPatients },
            source: { environment: terraEnvironment(), liveOnly: displayedTerraEnvironment() === 'PRODUCTION' },
            updatedAt: new Date().toISOString(),
        };
    }
}

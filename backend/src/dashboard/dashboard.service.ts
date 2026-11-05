import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registeredClinicWhere, registeredPatientWhere, displayedTerraEnvironment, displayedWorkflowWhere, readyResultWhere } from './live-data';
import { terraEnvironment } from '../terra/terra-environment';
import { clinicMetricQueries } from './clinic-metrics';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getAdminStats(summary = false) {
        const include = { patient: { omit: { validic_marketplace_url: true } }, clinic: { select: { name: true } } } as const;
        // These are independent read-only aggregates. An array transaction adds
        // BEGIN/COMMIT round trips and serializes every read on one connection.
        const [totalClinics, totalPatients, activeWorkflows, completedWorkflows, resultsReady, recent, attention, telemetry, activeClinics] = await Promise.all([
            this.prisma.clinic.count({ where: registeredClinicWhere }),
            summary ? undefined : this.prisma.patient.count({ where: registeredPatientWhere }),
            summary ? undefined : this.prisma.workflow.count({ where: { ...displayedWorkflowWhere(), status: { not: 'COMPLETED' } } }),
            this.prisma.workflow.count({ where: { ...displayedWorkflowWhere(), status: 'COMPLETED' } }),
            this.prisma.patient.count({ where: { ...registeredPatientWhere, results: { some: readyResultWhere() } } }),
            summary ? [] : this.prisma.workflow.findMany({ where: { ...displayedWorkflowWhere(), status: { not: 'COMPLETED' } }, take: 5, orderBy: { updated_at: 'desc' }, include }),
            summary ? [] : this.prisma.workflow.findMany({ where: { ...displayedWorkflowWhere(), status: { in: ['RESULTS_READY', 'SAMPLE_COLLECTED', 'KIT_SHIPPED'] } }, take: 3, orderBy: { updated_at: 'desc' }, include }),
            summary ? [] : this.prisma.patient.findMany({ omit: { validic_marketplace_url: true }, where: { ...registeredPatientWhere, validic_user_id: { not: null } }, take: 3, orderBy: { updated_at: 'desc' } }),
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
            kpi: { totalClinics, completedWorkflows, resultsReady, ...(!summary ? { totalPatients, activeWorkflows } : {}) },
            tables: { activeClinics, ...(!summary ? { recentPatients: rows(recent), attentionPatients: rows(attention), telemetryPatients: telemetry } : {}) },
            source: { environment: terraEnvironment(), liveOnly: displayedTerraEnvironment() === 'PRODUCTION' },
            updatedAt: new Date().toISOString(),
        };
    }

    async getClinicStats(clinicId: string, summary = false) {
        if (!clinicId) throw new ForbiddenException('A clinic account is required.');
        const patientsWhere = { ...registeredPatientWhere, clinic_id: clinicId };
        const sessionsWhere = { ...displayedWorkflowWhere(), clinic_id: clinicId };
        const readySessionsWhere = { ...sessionsWhere, results: { some: readyResultWhere() } };
        const metrics = clinicMetricQueries(this.prisma, clinicId);
        const [totalPatients, activeTesting, resultsReady, completedTesting, awaitingTestOrders, recentPatients] = await Promise.all([
            metrics[0], summary ? undefined : metrics[1], metrics[2], summary ? undefined : metrics[3], metrics[4],
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
            kpi: { totalPatients, resultsReady, awaitingTestOrders, ...(!summary ? { activeTesting, completedTesting } : {}) },
            tables: { recentPatients },
            source: { environment: terraEnvironment(), liveOnly: displayedTerraEnvironment() === 'PRODUCTION' },
            updatedAt: new Date().toISOString(),
        };
    }
}

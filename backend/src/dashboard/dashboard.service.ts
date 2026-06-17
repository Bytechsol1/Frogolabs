import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getAdminStats() {
        const [clinics, patients] = await Promise.all([
            this.prisma.clinic.count(),
            this.prisma.patient.count(),
        ]);

        const activeWorkflows = await this.prisma.workflow.count({
            where: { status: { not: 'COMPLETED' as any } }
        });

        const completedWorkflows = await this.prisma.workflow.count({
            where: { status: 'COMPLETED' as any }
        });

        const pendingResults = await this.prisma.workflow.count({
            where: { status: { in: ['LAB_PROCESSING', 'RESULTS_READY'] as any[] } }
        });

        const recentPatients = await this.prisma.patient.findMany({
            take: 5,
            orderBy: { created_at: 'desc' },
            include: { clinic: { select: { name: true } } }
        });

        const recentWorkflows = await this.prisma.workflow.findMany({
            take: 5,
            orderBy: { updated_at: 'desc' },
            include: {
                patient: { select: { first_name: true, last_name: true } },
                clinic: { select: { name: true } }
            }
        });

        const pendingLabWorkflows = await this.prisma.workflow.findMany({
            where: { status: { in: ['LAB_PROCESSING', 'RESULTS_READY'] as any[] } },
            take: 5,
            include: {
                patient: { select: { first_name: true, last_name: true } },
                clinic: { select: { name: true } }
            }
        });

        return {
            kpi: {
                totalClinics: clinics,
                totalPatients: patients,
                activeWorkflows,
                completedWorkflows,
                pendingResults
            },
            tables: {
                recentPatients,
                recentWorkflows,
                pendingLabWorkflows
            }
        };
    }

    async getClinicStats(clinicId: string) {
        const [patients, workflows] = await Promise.all([
            this.prisma.patient.count({ where: { clinic_id: clinicId } }),
            this.prisma.workflow.findMany({
                where: { clinic_id: clinicId },
                include: { patient: { select: { first_name: true, last_name: true } } },
                orderBy: { updated_at: 'desc' }
            })
        ]);

        const activeTesting = workflows.filter(w => (w.status as any) !== 'COMPLETED').length;
        const resultsReady = workflows.filter(w => (w.status as any) === 'RESULTS_READY').length;
        const completedTesting = workflows.filter(w => (w.status as any) === 'COMPLETED').length;

        const recentPatients = await this.prisma.patient.findMany({
            where: { clinic_id: clinicId },
            take: 5,
            orderBy: { created_at: 'desc' }
        });

        const latestResults = workflows
            .filter(w => (w.status as any) === 'RESULTS_READY')
            .slice(0, 5);

        const activeWorkflows = workflows
            .filter(w => (w.status as any) !== 'COMPLETED')
            .slice(0, 5);

        return {
            kpi: {
                totalPatients: patients,
                activeTesting,
                resultsReady,
                completedTesting
            },
            tables: {
                recentPatients,
                activeWorkflows,
                latestResults
            }
        };
    }
}

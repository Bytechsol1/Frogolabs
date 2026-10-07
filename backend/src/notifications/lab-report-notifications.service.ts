import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readyResultWhere, displayedTerraEnvironment } from '../dashboard/live-data';

@Injectable()
export class LabReportNotificationsService {
    constructor(private prisma: PrismaService) {}

    async list(user: { role: string; clinic_id: string | null }) {
        if (user.role !== 'ADMIN' && (user.role !== 'CLINIC_USER' || !user.clinic_id)) {
            throw new ForbiddenException('Clinic membership required.');
        }
        const reports = await this.prisma.labResult.findMany({
            where: {
                ...(user.role === 'CLINIC_USER' ? { clinic_id: user.clinic_id! } : {}),
                ...readyResultWhere(),
            },
            take: 100, orderBy: { uploaded_at: 'desc' },
            select: {
                id: true, patient_id: true, test_name: true, uploaded_at: true,
                patient: { select: { first_name: true, last_name: true } },
                workflow: { select: { history: { where: { status: 'RESULTS_READY' }, take: 1, orderBy: { created_at: 'desc' }, select: { created_at: true } } } },
            },
        });
        return reports.map(report => ({
            id: report.id, patientId: report.patient_id,
            patientName: `${report.patient.first_name} ${report.patient.last_name}`,
            testName: report.test_name || 'Lab report',
            readyAt: report.workflow?.history[0]?.created_at || report.uploaded_at,
            isSandbox: displayedTerraEnvironment() === 'SANDBOX',
        })).sort((a, b) => b.readyAt.getTime() - a.readyAt.getTime());
    }
}

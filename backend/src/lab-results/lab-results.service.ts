import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LabResultsService {
    constructor(private prisma: PrismaService) { }

    async findAll(clinic_id: string | null) {
        return this.prisma.labResult.findMany({
            where: clinic_id ? { clinic_id } : undefined,
            include: {
                patient: { select: { id: true, first_name: true, last_name: true } },
                clinic: { select: { id: true, name: true, email: true } },
                user: { select: { name: true } },
            },
            orderBy: { uploaded_at: 'desc' },
        });
    }

    async findOne(id: string, clinic_id: string | null) {
        const result = await this.prisma.labResult.findFirst({
            where: { id, ...(clinic_id ? { clinic_id } : {}) },
            include: {
                patient: true,
                clinic: true,
                user: { select: { name: true } },
                workflow: { select: { id: true, test_type: true, status: true } },
            },
        });
        if (!result) throw new NotFoundException('Lab result not found');
        return result;
    }

    async create(data: {
        patient_id: string;
        clinic_id: string;
        test_name?: string;
        result_date?: string;
        status?: string;
        notes?: string;
        file_url: string;
        file_name?: string;
        uploaded_by: string;
    }) {
        // Auto-link to patient's most recent workflow
        const workflow = await this.prisma.workflow.findFirst({
            where: { patient_id: data.patient_id },
            orderBy: { created_at: 'desc' },
        });

        return this.prisma.labResult.create({
            data: {
                patient_id: data.patient_id,
                clinic_id: data.clinic_id,
                workflow_id: workflow?.id ?? null,
                file_url: data.file_url,
                file_name: data.file_name,
                test_name: data.test_name,
                result_date: data.result_date ? new Date(data.result_date) : null,
                status: data.status || 'Available',
                notes: data.notes,
                uploaded_by: data.uploaded_by,
            },
            include: {
                patient: { select: { first_name: true, last_name: true } },
                clinic: { select: { name: true } },
            },
        });
    }

    async updateStatus(id: string, status: string) {
        return this.prisma.labResult.update({ where: { id }, data: { status } });
    }
}

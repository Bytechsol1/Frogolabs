import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkflowsService {
    constructor(private prisma: PrismaService) { }

    async findAll(clinic_id: string | null): Promise<any[]> {
        return this.prisma.workflow.findMany({
            where: clinic_id ? { clinic_id } : undefined,
            include: {
                patient: { select: { first_name: true, last_name: true, email: true, phone: true } },
                clinic: { select: { name: true } },
                history: { orderBy: { created_at: 'desc' } },
                results: true,
            },
            orderBy: { updated_at: 'desc' },
        });
    }

    async findOne(id: string, clinic_id: string | null): Promise<any> {
        const workflow = await this.prisma.workflow.findFirst({
            where: { id, ...(clinic_id ? { clinic_id } : {}) },
            include: {
                patient: true,
                clinic: { select: { name: true } },
                history: {
                    orderBy: { created_at: 'desc' },
                    include: { user: { select: { name: true } } },
                },
                results: true,
            },
        });
        if (!workflow) throw new NotFoundException('Workflow not found');
        return workflow;
    }

    async create(clinic_id: string, data: any): Promise<any> {
        const { patient_id, test_type, updated_by } = data;
        return this.prisma.workflow.create({
            data: {
                test_type,
                patient: { connect: { id: patient_id } },
                clinic: { connect: { id: clinic_id } },
                history: {
                    create: {
                        status: 'PATIENT_CREATED' as any,
                        notes: 'Workflow initiated',
                        updated_by,
                    },
                },
            },
        });
    }

    async updateStatus(id: string, clinic_id: string | null, data: any): Promise<any> {
        await this.findOne(id, clinic_id);
        const { status, notes, updated_by } = data;
        return this.prisma.workflow.update({
            where: { id },
            data: {
                status: status as any,
                history: {
                    create: { status, notes: notes || null, updated_by },
                },
            },
            include: {
                patient: { select: { first_name: true, last_name: true } },
                clinic: { select: { name: true } },
            },
        });
    }
}

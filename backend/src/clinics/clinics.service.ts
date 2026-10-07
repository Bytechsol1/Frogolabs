import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registeredClinicWhere, registeredPatientWhere, displayedWorkflowWhere } from '../dashboard/live-data';
import { Clinic, Prisma } from '@prisma/client';
import { clinicCreateSchema, clinicUpdateSchema, parseRecord } from '../common/email-records.dto';
import { clinicMetricQueries } from '../dashboard/clinic-metrics';
import { patientDirectoryQuery } from '../patients/patient-directory-query';

@Injectable()
export class ClinicsService {
    constructor(private prisma: PrismaService) { }

    async findAll(): Promise<any[]> {
        return this.prisma.clinic.findMany({
            where: registeredClinicWhere,
            include: {
                _count: { select: { patients: { where: registeredPatientWhere }, workflows: { where: displayedWorkflowWhere() } } },
                patients: { where: registeredPatientWhere, select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async findOne(id: string): Promise<any> {
        const [clinic, totalPatients, activeTesting, resultsReady, completedTesting, awaitingTestOrders] = await this.prisma.$transaction([
            this.prisma.clinic.findFirst({
            where: { id, ...registeredClinicWhere },
            include: {
                _count: { select: { patients: { where: registeredPatientWhere }, workflows: { where: displayedWorkflowWhere() } } },
                users: { select: { id: true, name: true, email: true, role: true } },
                patients: patientDirectoryQuery(id),
            },
            }),
            ...clinicMetricQueries(this.prisma, id),
        ]);
        return clinic ? { ...clinic, kpi: { totalPatients, activeTesting, resultsReady, completedTesting, awaitingTestOrders } } : null;
    }

    async create(input: unknown): Promise<Clinic> {
        const data = parseRecord(clinicCreateSchema, input);
        await this.checkEmailAvailable(data.email);
        try { return await this.prisma.clinic.create({ data: { ...data, status: 'Active' } }); }
        catch (error) { this.rethrowDuplicate(error); }
    }

    async update(id: string, input: unknown): Promise<Clinic> {
        const data = parseRecord(clinicUpdateSchema, input);
        await this.checkEmailAvailable(data.email, id);
        try { return await this.prisma.clinic.update({ where: { id }, data }); }
        catch (error) { this.rethrowDuplicate(error); }
    }

    private async checkEmailAvailable(email: string | null | undefined, id?: string) {
        if (!email) return;
        const duplicate = await this.prisma.clinic.findFirst({
            where: { email: { equals: email, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) }, select: { id: true },
        });
        if (duplicate) throw new BadRequestException('Unable to use this email address.');
    }

    private rethrowDuplicate(error: unknown): never {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new BadRequestException('Unable to use this email address.');
        }
        throw error;
    }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Patient } from '@prisma/client';

@Injectable()
export class PatientsService {
    constructor(private prisma: PrismaService) { }

    async findAll(clinic_id: string | null): Promise<any[]> {
        return this.prisma.patient.findMany({
            where: clinic_id ? { clinic_id } : undefined,
            include: {
                clinic: { select: { name: true } },
                workflows: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: { id: true, test_type: true, status: true, created_at: true },
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async findOne(id: string, clinic_id: string | null): Promise<any> {
        const patient = await this.prisma.patient.findFirst({
            where: { id, ...(clinic_id ? { clinic_id } : {}) },
            include: {
                clinic: true,
                workflows: {
                    include: {
                        history: {
                            orderBy: { created_at: 'desc' },
                            include: { user: { select: { name: true } } },
                        },
                        results: true,
                        notifications: true,
                    },
                    orderBy: { created_at: 'desc' },
                },
                results: true,
            },
        });
        if (!patient) throw new NotFoundException('Patient not found');
        return patient;
    }

    async create(clinic_id: string, user_id: string, data: any): Promise<any> {
        const { test_type, dob, ...patientData } = data;
        return this.prisma.patient.create({
            data: {
                ...patientData,
                dob: dob ? new Date(dob) : null,
                clinic: { connect: { id: clinic_id } },
                workflows: {
                    create: {
                        clinic_id,
                        test_type: test_type || 'Unspecified',
                        status: 'TEST_PACKAGE_SELECTED' as any,
                        history: {
                            create: {
                                status: 'TEST_PACKAGE_SELECTED' as any,
                                notes: 'Patient enrolled and test package selected',
                                updated_by: user_id,
                            },
                        },
                    },
                },
            },
            include: {
                workflows: { select: { id: true, test_type: true, status: true } },
            },
        });
    }

    async update(id: string, clinic_id: string | null, data: any): Promise<Patient> {
        await this.findOne(id, clinic_id);
        return this.prisma.patient.update({ where: { id }, data });
    }
}

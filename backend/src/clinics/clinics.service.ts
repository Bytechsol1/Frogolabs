import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Clinic, Prisma } from '@prisma/client';

@Injectable()
export class ClinicsService {
    constructor(private prisma: PrismaService) { }

    async findAll(): Promise<any[]> {
        return this.prisma.clinic.findMany({
            include: {
                _count: { select: { patients: true, workflows: true } },
                patients: { select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async findOne(id: string): Promise<any> {
        return this.prisma.clinic.findUnique({
            where: { id },
            include: {
                _count: { select: { patients: true, workflows: true } },
                users: { select: { id: true, name: true, email: true, role: true } },
                patients: {
                    orderBy: { created_at: 'desc' },
                    include: {
                        workflows: {
                            orderBy: { created_at: 'desc' },
                            take: 1,
                            select: { id: true, test_type: true, status: true, updated_at: true },
                        },
                    },
                },
            },
        });
    }

    async create(data: Prisma.ClinicCreateInput): Promise<Clinic> {
        return this.prisma.clinic.create({ data });
    }

    async update(id: string, data: Prisma.ClinicUpdateInput): Promise<Clinic> {
        return this.prisma.clinic.update({ where: { id }, data });
    }
}

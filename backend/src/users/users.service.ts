import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findAll(): Promise<any[]> {
        return this.prisma.user.findMany({
            select: {
                id: true, name: true, email: true, role: true,
                clinic_id: true, created_at: true,
                clinic: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    async findOne(email: string): Promise<any> {
        return this.prisma.user.findUnique({
            where: { email },
            include: { clinic: { select: { id: true, status: true } } },
        });
    }

    async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    async update(id: string, data: { name?: string; email?: string }): Promise<User> {
        return this.prisma.user.update({ where: { id }, data });
    }
}

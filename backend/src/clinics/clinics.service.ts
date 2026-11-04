import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
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

    async remove(id: string, input: unknown) {
        const { confirmationName } = parseRecord(z.object({ confirmationName: z.string().trim().min(1).max(120) }).strict(), input);
        try {
            return await this.prisma.$transaction(async tx => {
                const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Clinic" WHERE id = ${id} FOR UPDATE`;
                if (!locked) throw new NotFoundException('Clinic not found.');
                const clinic = await tx.clinic.findUniqueOrThrow({ where: { id } });
                if (confirmationName !== clinic.name.trim()) throw new BadRequestException('Type the clinic name exactly to confirm deletion.');
                const initialUsers = await tx.user.findMany({ where: { clinic_id: id }, select: { id: true, email: true } });
                const pending = await tx.otpVerification.findMany({ where: { user_id: { in: initialUsers.map(user => user.id) } }, select: { email: true } });
                const initialEmails = [...new Set([clinic.email, ...initialUsers.map(user => user.email), ...pending.map(row => row.email)]
                    .filter((email): email is string => !!email).map(email => email.trim().toLowerCase()))].sort();
                // Same lock order as OTP issuance: email, then user. A concurrent
                // resend cannot leave an orphan challenge for a deleted account.
                for (const email of initialEmails) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`email-otp:${email}`}))`;
                await tx.$queryRaw`SELECT id FROM "User" WHERE clinic_id = ${id} FOR UPDATE`;
                const users = await tx.user.findMany({ where: { clinic_id: id }, select: { id: true, email: true, role: true } });
                if (users.some(user => user.role === 'ADMIN')) throw new ConflictException('Move platform administrator accounts out of this clinic before deleting it.');
                const userIds = users.map(user => user.id);
                const challenges = await tx.otpVerification.findMany({ where: { user_id: { in: userIds } }, select: { email: true } });
                const emails = [...new Set([clinic.email, ...users.map(user => user.email), ...challenges.map(row => row.email)]
                    .filter((email): email is string => !!email).map(email => email.trim().toLowerCase()))];
                const otherUsers = emails.length ? await tx.user.findMany({ where: { clinic_id: { not: id }, email: { in: emails, mode: 'insensitive' } }, select: { email: true } }) : [];
                // Nullable clinic_id (platform users) must also protect their email challenges.
                const platformUsers = emails.length ? await tx.user.findMany({ where: { clinic_id: null, email: { in: emails, mode: 'insensitive' } }, select: { email: true } }) : [];
                const retainedEmails = new Set([...otherUsers, ...platformUsers].map(user => user.email.toLowerCase()));
                const releasedEmails = emails.filter(email => !retainedEmails.has(email));
                await tx.$queryRaw`SELECT id FROM "Patient" WHERE clinic_id = ${id} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "Workflow" WHERE clinic_id = ${id} FOR UPDATE`;
                await tx.sandboxReportJob.deleteMany({ where: { patient: { clinic_id: id } } });
                await tx.terraOrder.deleteMany({ where: { patient: { clinic_id: id } } });
                await tx.labResult.deleteMany({ where: { OR: [{ clinic_id: id }, { patient: { clinic_id: id } }] } });
                await tx.notification.deleteMany({ where: { workflow: { clinic_id: id } } });
                await tx.workflowHistory.deleteMany({ where: { workflow: { clinic_id: id } } });
                await tx.workflow.deleteMany({ where: { clinic_id: id } });
                await tx.patient.deleteMany({ where: { clinic_id: id } });
                await tx.otpVerification.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { user_id: null, email: { in: releasedEmails, mode: 'insensitive' } }] } });
                await tx.user.deleteMany({ where: { clinic_id: id, role: 'CLINIC_USER' } });
                // Keep IP limits; clear only the deleted accounts' email send limits.
                const keys = releasedEmails.flatMap(email => ['send:email:', 'send:cooldown:'].map(prefix => createHash('sha256').update(prefix + email).digest('hex')));
                await tx.authRateLimit.deleteMany({ where: { key: { in: keys } } });
                // Database logo, report bytes, report access codes and health metrics cascade.
                await tx.clinic.delete({ where: { id } });
                return { id, deleted: true, message: 'Clinic deleted. You can now register a new clinic.' };
            }, { timeout: 30000 });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2034'].includes(error.code)) {
                throw new ConflictException('Clinic data changed while deleting. Please retry.');
            }
            throw error;
        }
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

import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { existsSync } from 'fs';
import { extname, join } from 'path';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { displayedResultWhere, isFinalTerraReport, awaitingTestOrderWhere } from '../dashboard/live-data';
import { MailService } from '../mail/mail.service';
import { requireMailboxEmail } from '../common/email-validation';

const RESULT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const ACCESS_EXPIRY_DAYS = 7;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

type ReportType = 'pdf' | 'image' | 'structured' | 'unsupported' | 'none';

function classifyReport(fileUrl: string | null): ReportType {
    if (!fileUrl) return 'none';
    const ext = extname(fileUrl).toLowerCase();
    if (ext === '.pdf') return 'pdf';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    return 'unsupported';
}

// Terra Vantage results are structured biomarker data (from Terra's FHIR
// bundle), not an uploaded file — classified separately from file-based reports.
function resolveReportType(lr: { source: string; file_url: string; structured_report: unknown }): ReportType {
    if (lr.source === 'TERRA') {
        return lr.structured_report ? 'structured' : 'none';
    }
    return classifyReport(lr.file_url);
}

function generateResultCode(): string {
    const segment = (len: number) =>
        Array.from({ length: len }, () => RESULT_ID_ALPHABET[randomInt(RESULT_ID_ALPHABET.length)]).join('');
    return `FF-${segment(4)}-${segment(4)}`;
}

function generateAccessCode(): string {
    return randomInt(100000, 1000000).toString();
}

@Injectable()
export class LabResultsService {
    constructor(private prisma: PrismaService, private mailService: MailService) { }

    async findAll(clinic_id: string | null, db: Prisma.TransactionClient = this.prisma) {
        const results = await db.labResult.findMany({
            where: { ...displayedResultWhere(), ...(clinic_id ? { clinic_id } : {}) },
            include: {
                patient: { select: { id: true, first_name: true, last_name: true, gender: true, dob: true, age: true } },
                clinic: { select: { id: true, name: true, email: true } },
                user: { select: { name: true } },
                access: { select: { result_code: true, expires_at: true, access_count: true } },
                terraOrders: { select: { created_at: true }, orderBy: { created_at: 'asc' }, take: 1 },
            },
            orderBy: { uploaded_at: 'desc' },
        });
        return results.map(({ terraOrders, ...report }) => ({
            ...report,
            ordered_at: terraOrders[0]?.created_at ?? null,
            is_ready: isFinalTerraReport(report),
        }));
    }

    async overview(clinic_id: string | null) {
        // Keep the report list and patients without an order in one snapshot.
        return this.prisma.$transaction(async tx => {
            const results = await this.findAll(clinic_id, tx);
            const patients = await tx.patient.findMany({
                where: awaitingTestOrderWhere(clinic_id),
                select: {
                    id: true, first_name: true, last_name: true, created_at: true,
                    clinic: { select: { name: true } },
                },
                orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
            });
            const pendingPatients = patients.map(patient => ({
                ...patient,
                test_name: null,
                awaiting_order: true,
            }));
            return { results, pendingPatients };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }

    async findOne(id: string, clinic_id: string | null) {
        const result = await this.prisma.labResult.findFirst({
            where: { id, ...(clinic_id ? { clinic_id } : {}) },
            include: {
                patient: true,
                clinic: true,
                user: { select: { name: true } },
                workflow: { select: { id: true, test_type: true, status: true } },
                terraOrders: { select: { created_at: true }, orderBy: { created_at: 'asc' }, take: 1 },
            },
        });
        if (!result) throw new NotFoundException('Lab result not found');
        const { terraOrders, ...report } = result;
        return { ...report, ordered_at: terraOrders[0]?.created_at ?? null };
    }

    async create(data: {
        patient_id: string;
        test_name?: string;
        result_date?: string;
        status?: string;
        notes?: string;
        file_url: string;
        file_name?: string;
        uploaded_by: string;
        caller_clinic_id: string | null;
    }) {
        const patient = await this.prisma.patient.findUnique({ where: { id: data.patient_id } });
        if (!patient) throw new NotFoundException('Patient not found');

        // A clinic user (non-null caller_clinic_id) may only upload results
        // for their own clinic's patients. ADMIN (null caller_clinic_id) is
        // unrestricted, matching existing behavior.
        if (data.caller_clinic_id && patient.clinic_id !== data.caller_clinic_id) {
            throw new ForbiddenException('You can only upload lab results for patients in your own clinic.');
        }

        // Auto-link to patient's most recent workflow
        const workflow = await this.prisma.workflow.findFirst({
            where: { patient_id: data.patient_id },
            orderBy: { created_at: 'desc' },
        });

        return this.prisma.labResult.create({
            data: {
                patient_id: data.patient_id,
                clinic_id: patient.clinic_id,
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

    async sendToClinic(id: string, clinic_id: string, caller_clinic_id: string | null) {
        // A clinic user may only send a result that already belongs to their
        // own clinic, and only to their own clinic — prevents a clinic user
        // from reassigning another clinic's result or rerouting their own
        // result to a different clinic. ADMIN (null caller_clinic_id) keeps
        // the existing unrestricted behavior.
        if (caller_clinic_id) {
            const existing = await this.prisma.labResult.findUnique({ where: { id }, select: { clinic_id: true } });
            if (!existing) throw new NotFoundException('Lab result not found');
            if (existing.clinic_id !== caller_clinic_id || clinic_id !== caller_clinic_id) {
                throw new ForbiddenException('You can only send your own clinic\'s lab results to your own clinic.');
            }
        }

        return this.prisma.labResult.update({
            where: { id },
            data: { clinic_id, status: 'Sent to Clinic' },
            include: {
                patient: { select: { first_name: true, last_name: true } },
                clinic: { select: { name: true } },
            },
        });
    }

    private isEmailConfigured(): boolean {
        return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    }

    async generateAccess(labResultId: string, clinic_id: string | null) {
        const labResult = await this.prisma.labResult.findFirst({
            where: { id: labResultId, ...(clinic_id ? { clinic_id } : {}) },
            include: { access: true },
        });
        if (!labResult) throw new NotFoundException('Lab result not found');

        if (labResult.access && labResult.access.expires_at > new Date()) {
            return {
                status: 'exists' as const,
                resultId: labResult.access.result_code,
                accessCode: null,
                expiresAt: labResult.access.expires_at,
                emailConfigured: this.isEmailConfigured(),
            };
        }

        const wasExpired = !!labResult.access;
        const result = await this.issueAccess(labResultId, labResult.access?.result_code);
        return { status: wasExpired ? ('renewed' as const) : ('created' as const), ...result, emailConfigured: this.isEmailConfigured() };
    }

    async regenerateAccess(labResultId: string, clinic_id: string | null) {
        const labResult = await this.prisma.labResult.findFirst({
            where: { id: labResultId, ...(clinic_id ? { clinic_id } : {}) },
            include: { access: true },
        });
        if (!labResult) throw new NotFoundException('Lab result not found');

        const result = await this.issueAccess(labResultId, labResult.access?.result_code);
        return { status: 'regenerated' as const, ...result, emailConfigured: this.isEmailConfigured() };
    }

    private async issueAccess(labResultId: string, existingResultCode?: string) {
        const accessCode = generateAccessCode();
        const accessCodeHash = await bcrypt.hash(accessCode, 10);
        const expiresAt = new Date(Date.now() + ACCESS_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        for (let attempt = 0; attempt < 3; attempt++) {
            const resultCode = existingResultCode ?? (await this.generateUniqueResultCode());
            try {
                const access = await this.prisma.labResultAccess.upsert({
                    where: { lab_result_id: labResultId },
                    create: {
                        lab_result_id: labResultId,
                        result_code: resultCode,
                        access_code_hash: accessCodeHash,
                        expires_at: expiresAt,
                    },
                    update: {
                        result_code: resultCode,
                        access_code_hash: accessCodeHash,
                        expires_at: expiresAt,
                        access_count: 0,
                        last_accessed_at: null,
                    },
                });
                return { resultId: access.result_code, accessCode, expiresAt: access.expires_at };
            } catch (err: any) {
                // Unique constraint race on result_code — retry with a freshly generated one.
                if (err?.code === 'P2002' && !existingResultCode && attempt < 2) continue;
                throw err;
            }
        }
        throw new BadRequestException('Failed to generate a unique Result ID. Please try again.');
    }

    private async generateUniqueResultCode(): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = generateResultCode();
            const existing = await this.prisma.labResultAccess.findUnique({ where: { result_code: code } });
            if (!existing) return code;
        }
        throw new BadRequestException('Failed to generate a unique Result ID. Please try again.');
    }

    async sendAccessToPatient(labResultId: string, clinic_id: string | null, accessCode: string) {
        const labResult = await this.prisma.labResult.findFirst({
            where: { id: labResultId, ...(clinic_id ? { clinic_id } : {}) },
            include: { access: true, patient: true },
        });
        if (!labResult) throw new NotFoundException('Lab result not found');
        if (!labResult.access) throw new BadRequestException('Generate an access code before sending it to the patient.');
        if (labResult.access.expires_at < new Date()) {
            throw new BadRequestException('This access code has expired. Please regenerate it first.');
        }

        const matches = await bcrypt.compare(accessCode, labResult.access.access_code_hash);
        if (!matches) {
            throw new BadRequestException('The access code provided does not match. Please regenerate and try again.');
        }

        if (!labResult.patient.email) {
            throw new BadRequestException('This patient has no email address on file.');
        }

        const patientEmail = requireMailboxEmail(labResult.patient.email);
        await this.mailService.sendLabResultAccess(
            patientEmail,
            `${labResult.patient.first_name} ${labResult.patient.last_name}`,
            labResult.access.result_code,
            accessCode,
            labResult.access.expires_at,
        );

        return { sent: true, patientEmail, emailConfigured: this.isEmailConfigured() };
    }

    private async authorizeAccess(resultId: string, accessCode: string) {
        const normalizedResultId = (resultId || '').trim().toUpperCase();
        if (!normalizedResultId || !accessCode?.trim()) {
            throw new BadRequestException('Result ID and Access Code are required.');
        }

        const access = await this.prisma.labResultAccess.findUnique({
            where: { result_code: normalizedResultId },
            include: {
                lab_result: {
                    include: {
                        patient: { select: { first_name: true, last_name: true } },
                        clinic: { select: { name: true } },
                    },
                },
            },
        });

        if (!access) {
            throw new UnauthorizedException('Invalid Result ID or Access Code.');
        }

        const matches = await bcrypt.compare(accessCode.trim(), access.access_code_hash);
        if (!matches) {
            throw new UnauthorizedException('Invalid Result ID or Access Code.');
        }

        if (access.expires_at < new Date()) {
            throw new UnauthorizedException('This access code has expired. Please contact your clinic for a new one.');
        }

        return access;
    }

    async verifyPatientAccess(resultId: string, accessCode: string) {
        const access = await this.authorizeAccess(resultId, accessCode);

        await this.prisma.labResultAccess.update({
            where: { id: access.id },
            data: { access_count: { increment: 1 }, last_accessed_at: new Date() },
        });

        const lr = access.lab_result;
        return {
            patientName: `${lr.patient.first_name} ${lr.patient.last_name}`,
            testName: lr.test_name,
            status: lr.status,
            resultDate: lr.result_date,
            notes: lr.notes,
            uploadedAt: lr.uploaded_at,
            clinicName: lr.clinic?.name ?? null,
            reportType: resolveReportType(lr),
        };
    }

    async getPatientReport(
        resultId: string,
        accessCode: string,
    ): Promise<{ kind: 'file'; filePath: string; reportType: ReportType } | { kind: 'structured'; report: unknown }> {
        const access = await this.authorizeAccess(resultId, accessCode);
        const lr = access.lab_result;
        const reportType = resolveReportType(lr);

        if (reportType === 'structured') {
            return { kind: 'structured', report: lr.structured_report };
        }
        if (reportType === 'none') {
            throw new NotFoundException('No report file is attached to this result.');
        }
        if (reportType === 'unsupported') {
            throw new BadRequestException('This file format cannot be previewed in the portal.');
        }

        const filePath = join(process.cwd(), lr.file_url as string);
        if (!existsSync(filePath)) {
            throw new NotFoundException('The report file could not be found.');
        }

        return { kind: 'file', filePath, reportType };
    }
}

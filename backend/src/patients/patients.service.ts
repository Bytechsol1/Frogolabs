import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registeredPatientWhere, displayedTerraEnvironment, displayedWorkflowWhere, displayedResultWhere } from '../dashboard/live-data';
import { Patient } from '@prisma/client';
import { ValidicService } from '../validic/validic.service';
import { TerraService } from '../terra/terra.service';
import { SANDBOX_REPORT_DELAY_MS } from '../terra/sandbox-config';
import { patientCreateSchema, patientUpdateSchema, parseRecord } from '../common/email-records.dto';
import { patientDirectoryQuery } from './patient-directory-query';

@Injectable()
export class PatientsService {
    constructor(
        private prisma: PrismaService,
        private validicService: ValidicService,
        private terraService: TerraService,
    ) { }

    async findAll(clinic_id: string | null): Promise<any[]> {
        return this.prisma.patient.findMany(patientDirectoryQuery(clinic_id));
    }

    async findOne(id: string, clinic_id: string | null): Promise<any> {
        const patient = await this.prisma.patient.findFirst({
            omit: { validic_marketplace_url: true },
            where: { id, ...registeredPatientWhere, ...(clinic_id ? { clinic_id } : {}) },
            include: {
                clinic: true,
                workflows: {
                    where: { ...displayedWorkflowWhere(), ...(clinic_id ? { clinic_id } : {}) },
                    include: {
                        history: {
                            orderBy: { created_at: 'desc' },
                            include: { user: { select: { name: true } } },
                        },
                        results: { where: displayedResultWhere() },
                        notifications: true,
                    },
                    orderBy: { created_at: 'desc' },
                },
                results: { where: displayedResultWhere() },
                terraOrders: { where: { environment: displayedTerraEnvironment() }, orderBy: { created_at: 'desc' } },
                sandboxReportJobs: displayedTerraEnvironment() === 'SANDBOX' ? { orderBy: { created_at: 'desc' }, select: { id: true, status: true, test_name: true, due_at: true, last_error: true } } : false,
                metrics: {
                    orderBy: { recorded_at: 'desc' },
                    take: 50,
                },
            },
        });
        if (!patient) throw new NotFoundException('Patient not found');
        return patient;
    }

    async create(clinic_id: string, user_id: string, input: unknown): Promise<any> {
        const { test_type, terra_variant_id, dob, date_of_birth, age, ...patientData } = parseRecord(patientCreateSchema, input);
        const sandboxTest = await this.terraService.prepareSandboxTest(terra_variant_id);
        const initialStatus = sandboxTest || test_type ? 'TEST_PACKAGE_SELECTED' : 'PATIENT_CREATED';
        const patient = await this.prisma.patient.create({
            data: {
                ...patientData,
                dob: dob || date_of_birth || null,
                age: age ?? null,
                clinic: { connect: { id: clinic_id } },
                ...(sandboxTest ? { sandboxReportJobs: { create: {
                    variant_id: sandboxTest.id, test_name: sandboxTest.name, country_code: sandboxTest.country,
                    due_at: new Date(Date.now() + SANDBOX_REPORT_DELAY_MS),
                } } } : {}),
                workflows: {
                    create: {
                        clinic_id,
                        test_type: sandboxTest?.name || test_type || 'Unspecified',
                        status: initialStatus,
                        history: {
                            create: {
                                status: initialStatus,
                                notes: test_type || sandboxTest ? 'Patient enrolled and test package selected' : 'Patient enrolled',
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

        // Seamless background provisioning for Validic Platform
        this.validicService.provisionUser(patient.id, clinic_id).catch((err) => {
            console.warn('Device provisioning deferred for the new patient.');
        });

        return patient;
    }

    async update(id: string, clinic_id: string | null, input: unknown): Promise<Omit<Patient, 'validic_marketplace_url'>> {
        const data = parseRecord(patientUpdateSchema, input);
        await this.findOne(id, clinic_id);
        return this.prisma.patient.update({ where: { id, ...(clinic_id ? { clinic_id } : {}) }, data, omit: { validic_marketplace_url: true } });
    }
}

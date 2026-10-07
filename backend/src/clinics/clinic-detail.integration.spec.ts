import { PrismaClient, WorkflowStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClinicsService } from './clinics.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PatientsService } from '../patients/patients.service';
import { LabResultsService } from '../lab-results/lab-results.service';
import { PrismaService } from '../prisma/prisma.service';

const integration = process.env.AUTH_DB_TESTS === '1' ? describe : describe.skip;
integration('Admin clinic detail matches clinic Terra data', () => {
    const prisma = new PrismaClient();
    const originalEnvironment = process.env.TERRA_ENVIRONMENT;
    const originalDisplay = process.env.TERRA_SHOW_SANDBOX_DATA;
    afterAll(async () => {
        process.env.TERRA_ENVIRONMENT = originalEnvironment;
        process.env.TERRA_SHOW_SANDBOX_DATA = originalDisplay;
        await prisma.$disconnect();
    });

    it.each(['SANDBOX', 'PRODUCTION'])('shares counts and patient sessions in %s', async environment => {
        process.env.TERRA_ENVIRONMENT = environment.toLowerCase();
        process.env.TERRA_SHOW_SANDBOX_DATA = 'true';
        const rollback = new Error('Rollback clinic detail fixture');
        await expect(prisma.$transaction(async tx => {
            const db = new Proxy(tx, {
                get(target, key) { return key === '$transaction' ? (queries: Promise<unknown>[] | ((db: typeof tx) => Promise<unknown>)) => typeof queries === 'function' ? queries(tx) : Promise.all(queries) : target[key]; },
            }) as unknown as PrismaService;
            const clinics = new ClinicsService(db);
            const dashboard = new DashboardService(db);
            const labResults = new LabResultsService(db, null as any);
            const patients = new PatientsService(db, null as any, null as any);
            const clinic = await tx.clinic.create({ data: { name: 'Detail Fixture', contact_name: 'Fixture', status: 'Active' } });
            const other = await tx.clinic.create({ data: { name: 'Other Fixture', contact_name: 'Fixture', status: 'Active' } });
            const createPatient = (clinicId: string, is_demo = false) => tx.patient.create({ data: { clinic_id: clinicId, first_name: 'Detail', last_name: 'Fixture', is_demo } });
            const ready = await createPatient(clinic.id);
            const active = await createPatient(clinic.id);
            const noOrder = await createPatient(clinic.id);
            const demo = await createPatient(clinic.id, true);
            const outsider = await createPatient(other.id);
            await createPatient(other.id); // Other-clinic unordered patients stay out of this clinic.
            await createPatient(clinic.id, true); // Demo enrollments never count.
            const session = async (patient: typeof ready, status: WorkflowStatus, test: string, env = environment, final = false) => {
                const workflow = await tx.workflow.create({ data: { clinic_id: patient.clinic_id, patient_id: patient.id, status, test_type: test } });
                const result = final ? await tx.labResult.create({ data: {
                    clinic_id: patient.clinic_id, patient_id: patient.id, workflow_id: workflow.id, file_url: '', source: 'TERRA',
                    structured_report: { isSandbox: env === 'SANDBOX', isPartial: false, resultStatus: 'results.results_ready' },
                } }) : null;
                await tx.terraOrder.create({ data: {
                    patient_id: patient.id, workflow_id: workflow.id, environment: env,
                    terra_order_id: randomUUID(), terra_product_id: 'fixture', terra_order_status: 'order.completed', lab_result_id: result?.id,
                } });
                return workflow;
            };
            await session(ready, 'COMPLETED', 'First report', environment, true);
            await session(ready, 'COMPLETED', 'Second report', environment, true);
            const real = await session(active, 'LAB_PROCESSING', 'Correct Terra Test');
            // A newer enrollment workflow and opposite-environment order must not replace the displayed Terra session.
            await tx.workflow.create({ data: { clinic_id: clinic.id, patient_id: active.id, test_type: 'Unspecified', status: 'COMPLETED', created_at: new Date(Date.now() + 10000) } });
            await session(active, 'COMPLETED', 'Wrong environment', environment === 'SANDBOX' ? 'PRODUCTION' : 'SANDBOX', true);
            await session(demo, 'LAB_PROCESSING', 'Demo');
            await session(outsider, 'COMPLETED', 'Other clinic', environment, true);
            const admin = await clinics.findOne(clinic.id);
            const clinicStats = await dashboard.getClinicStats(clinic.id);
            expect(admin.kpi).toEqual({ totalPatients: 3, activeTesting: 1, resultsReady: 1, completedTesting: 2, awaitingTestOrders: 1 });
            expect(admin.kpi).toEqual(clinicStats.kpi);
            expect(admin.patients).toEqual(await patients.findAll(clinic.id));
            expect(admin.patients.find(p => p.id === active.id).workflows[0].id).toBe(real.id);
            expect(admin.patients.find(p => p.id === noOrder.id).workflows).toEqual([]);
            const overview = await labResults.overview(clinic.id);
            expect(overview.pendingPatients.map(p => p.id)).toEqual([noOrder.id]);
            expect(overview.pendingPatients[0].awaiting_order).toBe(true);
            // An order in the other environment must not hide an unordered patient here.
            await session(noOrder, 'TEST_PACKAGE_SELECTED', 'Other environment order', environment === 'SANDBOX' ? 'PRODUCTION' : 'SANDBOX');
            expect((await dashboard.getClinicStats(clinic.id)).kpi.awaitingTestOrders).toBe(1);
            expect((await labResults.overview(clinic.id)).pendingPatients.map(p => p.id)).toEqual([noOrder.id]);
            // Once placed, even without a report, the patient leaves both the card count and list.
            await session(noOrder, 'TEST_PACKAGE_SELECTED', 'New order');
            expect((await dashboard.getClinicStats(clinic.id)).kpi.awaitingTestOrders).toBe(0);
            expect((await labResults.overview(clinic.id)).pendingPatients).toEqual([]);
            throw rollback;
        }, { timeout: 20000 })).rejects.toBe(rollback);
    });
});

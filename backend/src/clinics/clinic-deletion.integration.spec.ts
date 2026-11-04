import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { EmailOtpService } from '../auth/email-otp.service';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';

const target = process.env.CLINIC_DELETE_TEST_DATABASE_URL;
const integration = target ? describe : describe.skip;
integration('Clinic deletion with real PostgreSQL and JWT authorization', () => {
    let app: INestApplication;
    let db: PrismaClient;
    let jwt: JwtService;
    let administrator: string;
    const previousSecret = process.env.JWT_SECRET;
    const secret = 'disposable-clinic-delete-test-secret';
    const mail = { sendOtp: jest.fn().mockResolvedValue(undefined) };
    const auth = (id: string) => `Bearer ${jwt.sign({ sub: id })}`;
    async function fixture() {
        const suffix = randomUUID();
        const clinic = await db.clinic.create({ data: { name: `Fixture ${suffix}`, contact_name: 'Synthetic Contact', email: `clinic-${suffix}@example.com`, primary_color: '#163D8C', branding_logo: 'synthetic.png' } });
        const user = await db.user.create({ data: { clinic_id: clinic.id, name: 'Synthetic Staff', email: clinic.email!, password_hash: await bcrypt.hash('fixture-password', 4), email_verified: true, is_clinic_admin: true } });
        const patient = await db.patient.create({ data: { clinic_id: clinic.id, first_name: 'Synthetic', last_name: 'Patient' } });
        const workflow = await db.workflow.create({ data: { clinic_id: clinic.id, patient_id: patient.id, test_type: 'Synthetic Test' } });
        const history = await db.workflowHistory.create({ data: { workflow_id: workflow.id, status: 'PATIENT_CREATED', updated_by: user.id } });
        await db.notification.create({ data: { workflow_id: workflow.id, channel: 'EMAIL', recipient: 'synthetic@example.com', message: 'Synthetic only', status: 'SENT' } });
        const result = await db.labResult.create({ data: { clinic_id: clinic.id, patient_id: patient.id, workflow_id: workflow.id, uploaded_by: user.id, file_url: `/uploads/lab-results/${suffix}.pdf` } });
        await db.labResultAccess.create({ data: { lab_result_id: result.id, result_code: suffix, access_code_hash: 'synthetic-hash', expires_at: new Date(Date.now() + 60000) } });
        await db.labResultFile.create({ data: { lab_result_id: result.id, mime_type: 'application/pdf', data: Buffer.from('synthetic report') } });
        await db.clinicLogo.create({ data: { clinic_id: clinic.id, file_name: 'synthetic.png', mime_type: 'image/png', data: Buffer.from('synthetic logo') } });
        await db.healthMetric.create({ data: { patient_id: patient.id, metric_type: 'heart_rate', value: '72', recorded_at: new Date() } });
        const order = await db.terraOrder.create({ data: { patient_id: patient.id, workflow_id: workflow.id, lab_result_id: result.id, terra_order_id: suffix, terra_product_id: 'synthetic', terra_order_status: 'synthetic' } });
        await db.sandboxReportJob.create({ data: { patient_id: patient.id, order_id: order.id, variant_id: 'synthetic', test_name: 'Synthetic', country_code: 'US', due_at: new Date() } });
        await db.otpVerification.create({ data: { email: user.email, user_id: user.id, purpose: 'EMAIL_VERIFICATION', expires_at: new Date(), verified_at: new Date() } });
        await db.otpVerification.create({ data: { email: `pending-${suffix}@example.com`, user_id: user.id, purpose: 'EMAIL_CHANGE', expires_at: new Date(Date.now() + 60000) } });
        return { clinic, user, patient, workflow, history, result, order };
    }
    beforeAll(async () => {
        const url = new URL(target!);
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/frigo_clinic_delete_test_[a-f0-9]+$/.test(url.pathname)) throw new Error('Disposable local clinic-deletion database required.');
        process.env.JWT_SECRET = secret;
        db = new PrismaClient({ datasourceUrl: target });
        if (await db.clinic.count() || await db.user.count()) throw new Error('The test database must be empty.');
        const admin = await db.user.create({ data: { name: 'Synthetic Administrator', email: 'fixture-admin@example.com', role: 'ADMIN', email_verified: true, password_hash: 'not-used-by-jwt-test' } });
        administrator = admin.id;
        const module = await Test.createTestingModule({ imports: [PassportModule, JwtModule.register({ secret })], controllers: [ClinicsController], providers: [ClinicsService, JwtStrategy, { provide: PrismaService, useValue: db }] }).compile();
        app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
        jwt = module.get(JwtService);
    });
    afterAll(async () => {
        await app?.close(); await db?.$disconnect();
        if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    });
    it('rejects unauthenticated users and clinic staff, including clinic managers', async () => {
        const { clinic, user } = await fixture();
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).send({ confirmationName: clinic.name }).expect(401);
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).set('Authorization', auth(user.id)).send({ confirmationName: clinic.name }).expect(403);
        expect(await db.clinic.count({ where: { id: clinic.id } })).toBe(1);
    });
    it('requires matching confirmation and returns 404 for an unknown clinic', async () => {
        const { clinic } = await fixture();
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).set('Authorization', auth(administrator)).send({}).expect(400);
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).set('Authorization', auth(administrator)).send({ confirmationName: 'Wrong clinic' }).expect(400);
        expect(await db.patient.count({ where: { clinic_id: clinic.id } })).toBe(1);
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${randomUUID()}`).set('Authorization', auth(administrator)).send({ confirmationName: 'Unknown' }).expect(404);
    });
    it('removes only the selected clinic and permits immediate registration with its previous email', async () => {
        const a = await fixture(); const b = await fixture();
        // Other clinics' history survives even if a departing staff member authored it.
        await db.workflowHistory.update({ where: { id: b.history.id }, data: { updated_by: a.user.id } });
        const setHeader = jest.fn();
        const ip = `fixture-${randomUUID()}`;
        const guard = new AuthRateLimitGuard(db as any);
        const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', route: { path: '/auth/register' }, ip, body: { email: a.user.email } }), getResponse: () => ({ setHeader }) }) };
        await guard.canActivate(context as any);
        const ipKey = createHash('sha256').update(`send:ip:${ip}`).digest('hex');
        const response = await request(app.getHttpServer()).delete(`/api/v1/clinics/${a.clinic.id}`).set('Authorization', auth(administrator)).send({ confirmationName: a.clinic.name }).expect(200);
        expect(response.body.deleted).toBe(true);
        expect(await db.clinic.findUnique({ where: { id: a.clinic.id } })).toBeNull();
        expect(await db.user.count({ where: { clinic_id: a.clinic.id } })).toBe(0);
        expect(await db.patient.count({ where: { id: a.patient.id } })).toBe(0);
        expect(await db.workflow.count({ where: { id: a.workflow.id } })).toBe(0);
        expect(await db.workflowHistory.count({ where: { workflow_id: a.workflow.id } })).toBe(0);
        expect(await db.notification.count({ where: { workflow_id: a.workflow.id } })).toBe(0);
        expect(await db.labResult.count({ where: { id: a.result.id } })).toBe(0);
        expect(await db.labResultAccess.count({ where: { lab_result_id: a.result.id } })).toBe(0);
        expect(await db.labResultFile.count({ where: { lab_result_id: a.result.id } })).toBe(0);
        expect(await db.clinicLogo.count({ where: { clinic_id: a.clinic.id } })).toBe(0);
        expect(await db.healthMetric.count({ where: { patient_id: a.patient.id } })).toBe(0);
        expect(await db.terraOrder.count({ where: { id: a.order.id } })).toBe(0);
        expect(await db.sandboxReportJob.count({ where: { patient_id: a.patient.id } })).toBe(0);
        expect(await db.otpVerification.count({ where: { user_id: a.user.id } })).toBe(0);
        expect(await db.authRateLimit.count({ where: { key: ipKey } })).toBe(1);
        expect(await db.labResultFile.count({ where: { lab_result_id: b.result.id } })).toBe(1);
        expect(await db.clinicLogo.count({ where: { clinic_id: b.clinic.id } })).toBe(1);
        expect(await db.healthMetric.count({ where: { patient_id: b.patient.id } })).toBe(1);
        expect((await db.workflowHistory.findUniqueOrThrow({ where: { id: b.history.id } })).updated_by).toBeNull();
        await request(app.getHttpServer()).get(`/api/v1/clinics/${b.clinic.id}`).set('Authorization', auth(a.user.id)).expect(401);
        await guard.canActivate(context as any); // No leftover per-email cooldown blocks fresh signup.
        const codes = new Map<string, string>();
        mail.sendOtp.mockImplementation(async (email, code) => { codes.set(email, code); });
        const otp = new EmailOtpService(db as any, mail as any);
        await otp.register({ clinicName: a.clinic.name, contactName: 'Fresh Contact', email: a.user.email, phone: '+12025550123', password: 'new-fixture-password' });
        const fresh = await otp.verify(a.user.email, codes.get(a.user.email)!);
        expect(fresh.id).not.toBe(a.user.id);
        expect(fresh.clinic_id).not.toBe(a.clinic.id);
        expect(fresh.email_verified).toBe(true);
        expect((await db.clinic.findUniqueOrThrow({ where: { id: fresh.clinic_id! } })).primary_color).toBe('#0F766E');
        expect(await db.patient.count({ where: { clinic_id: fresh.clinic_id! } })).toBe(0);
    });
    it('protects platform administrator accounts and leaves all clinic data intact on refusal', async () => {
        const { clinic, patient } = await fixture();
        await db.user.create({ data: { clinic_id: clinic.id, name: 'Synthetic Platform Admin', email: `admin-${randomUUID()}@example.com`, role: 'ADMIN', email_verified: true, password_hash: 'not-used' } });
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).set('Authorization', auth(administrator)).send({ confirmationName: clinic.name }).expect(409);
        expect(await db.patient.count({ where: { id: patient.id } })).toBe(1);
        expect(await db.user.count({ where: { clinic_id: clinic.id } })).toBe(2);
    });
    it('also deletes disabled clinics and clinics that have no staff or patient records', async () => {
        const { clinic } = await fixture();
        await db.clinic.update({ where: { id: clinic.id }, data: { status: 'Inactive' } });
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${clinic.id}`).set('Authorization', auth(administrator)).send({ confirmationName: clinic.name }).expect(200);
        const empty = await db.clinic.create({ data: { name: 'Empty Synthetic Clinic', contact_name: 'Synthetic', email: `empty-${randomUUID()}@example.com` } });
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${empty.id}`).set('Authorization', auth(administrator)).send({ confirmationName: empty.name }).expect(200);
    });
    it('preserves another clinic account and its challenge when its email is used as a clinic contact', async () => {
        const a = await fixture(); const b = await fixture();
        const shared = await db.user.create({ data: { clinic_id: b.clinic.id, name: 'Synthetic Shared Contact', email: `shared-${randomUUID()}@example.com`, password_hash: 'unused', email_verified: false } });
        await db.clinic.update({ where: { id: a.clinic.id }, data: { email: shared.email } });
        await db.otpVerification.create({ data: { email: shared.email, purpose: 'EMAIL_VERIFICATION', expires_at: new Date(Date.now() + 60000) } });
        await request(app.getHttpServer()).delete(`/api/v1/clinics/${a.clinic.id}`).set('Authorization', auth(administrator)).send({ confirmationName: a.clinic.name }).expect(200);
        expect(await db.user.findUnique({ where: { id: shared.id } })).toEqual(shared);
        expect(await db.otpVerification.count({ where: { email: shared.email } })).toBe(1);
        expect(await db.patient.count({ where: { clinic_id: b.clinic.id } })).toBe(1);
    });
    it('rolls back child deletions if the final clinic delete fails', async () => {
        const { clinic, result, patient, user } = await fixture();
        const failing = new ClinicsService({ $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, {
            get(target, key) {
                if (key === 'clinic') return new Proxy(target.clinic, { get(model, method) {
                    if (method === 'delete') return async () => { throw new Error('Synthetic final deletion failure'); };
                    const value = Reflect.get(model, method); return typeof value === 'function' ? value.bind(model) : value;
                } });
                const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
            },
        })), options) } as any);
        await expect(failing.remove(clinic.id, { confirmationName: clinic.name })).rejects.toThrow('Synthetic final deletion failure');
        expect(await db.clinic.count({ where: { id: clinic.id } })).toBe(1);
        expect(await db.user.count({ where: { id: user.id } })).toBe(1);
        expect(await db.patient.count({ where: { id: patient.id } })).toBe(1);
        expect(await db.labResultFile.count({ where: { lab_result_id: result.id } })).toBe(1);
        expect(await db.otpVerification.count({ where: { user_id: user.id } })).toBe(2);
    });
});

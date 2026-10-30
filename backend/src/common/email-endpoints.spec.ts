import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';
import { EmailOtpService } from '../auth/email-otp.service';
import { LocalStrategy } from '../auth/strategies/local.strategy';
import { LocalAuthGuard } from '../auth/guards/local-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PatientsController } from '../patients/patients.controller';
import { PatientsService } from '../patients/patients.service';
import { ClinicsController } from '../clinics/clinics.controller';
import { ClinicsService } from '../clinics/clinics.service';
import { ValidicService } from '../validic/validic.service';
import { TerraController } from '../terra/terra.controller';
import { TerraService } from '../terra/terra.service';

describe('email validation at HTTP boundaries (no database or mail delivery)', () => {
    let app: INestApplication;
    const identity = { id: 'fixture-user', name: 'Fixture', email: 'test@gmail.com', email_verified: true, role: 'CLINIC_USER', clinic_id: 'fixture-clinic' };
    const db = {
        $queryRaw: jest.fn().mockResolvedValue([{ attempts: 1, resets_at: new Date(Date.now() + 60000) }]),
        authRateLimit: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        patient: { create: jest.fn().mockResolvedValue({ id: 'patient' }), findFirst: jest.fn().mockResolvedValue({ id: 'patient' }), update: jest.fn().mockResolvedValue({ id: 'patient' }) },
        clinic: { create: jest.fn().mockResolvedValue({ id: 'clinic' }), update: jest.fn().mockResolvedValue({ id: 'clinic' }), findFirst: jest.fn().mockResolvedValue(null) },
        user: { findUniqueOrThrow: jest.fn().mockResolvedValue(identity) },
    };
    const users = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(identity) };
    const otp = { register: jest.fn().mockResolvedValue({ message: 'Accepted' }), resend: jest.fn().mockResolvedValue({ message: 'Accepted' }), verify: jest.fn().mockResolvedValue(identity), changeEmail: jest.fn().mockResolvedValue({ requires_verification: true }) };
    const terra = { prepareSandboxTest: jest.fn().mockResolvedValue(null), createOrder: jest.fn().mockResolvedValue({ id: 'order' }) };
    const registration = { clinicName: 'Fixture', contactName: 'Fixture', email: 'test@gmail.com', phone: '+12025550123', password: 'fixture-pass' };
    const patientDetails = { first_name: 'Fixture', last_name: 'Patient', address: '123 Test Street', postal_code: '10001' };
    const writes = () => [otp.register, otp.resend, otp.verify, otp.changeEmail, db.patient.create, db.patient.update, db.clinic.create, db.clinic.update, terra.createOrder];

    beforeAll(async () => {
        users.findOne.mockResolvedValue({ ...identity, password_hash: await bcrypt.hash('fixture-pass', 4) });
        const module = await Test.createTestingModule({
            imports: [PassportModule],
            controllers: [AuthController, PatientsController, ClinicsController, TerraController],
            providers: [AuthService, AuthRateLimitGuard, LocalAuthGuard, LocalStrategy, RolesGuard, PatientsService, ClinicsService,
                { provide: PrismaService, useValue: db }, { provide: UsersService, useValue: users },
                { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('test-session') } },
                { provide: EmailOtpService, useValue: otp }, { provide: TerraService, useValue: terra },
                { provide: ValidicService, useValue: { provisionUser: jest.fn().mockResolvedValue(null) } },
            ],
        }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: ExecutionContext) {
            const req = context.switchToHttp().getRequest();
            req.user = req.path.includes('/clinics') ? { ...identity, role: 'ADMIN', clinic_id: null } : identity;
            return true;
        } }).compile();
        app = module.createNestApplication();
        app.setGlobalPrefix('api/v1');
        await app.init();
    });
    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app?.close(); });

    const targets = [
        ['post', '/auth/login', { password: 'fixture-pass' }],
        ['post', '/auth/register', registration],
        ['post', '/auth/register/resend', {}],
        ['post', '/auth/register/verify', { otp: '123456' }],
        ['patch', '/auth/me', { name: 'Fixture' }],
        ['post', '/patients', { first_name: 'Fixture', last_name: 'Patient' }],
        ['put', '/patients/patient', {}],
        ['post', '/clinics', { name: 'Fixture', contact_name: 'Contact' }],
        ['put', '/clinics/clinic', {}],
        ['post', '/terra/orders', { patient_id: 'patient', recipient: {} }],
    ] as const;
    for (const [method, route, base] of targets) {
        it.each(['test', 'test@', '@gmail.com', 'test@example', 'test..test@gmail.com', 'has spaces@gmail.com', 'name@gmailcom', 'doctor', 'doctor@', 'doctor@gmail', 'doctor @gmail.com', 'doctor..test@gmail.com', 'doctor@.com', { set: 'valid@gmail.com' }, ['test@gmail.com']])(`${method} ${route} rejects malformed email %# before business writes`, async email => {
            const body = route === '/terra/orders' ? { ...base, recipient: { email } } : { ...base, email };
            const response = await request(app.getHttpServer())[method](`/api/v1${route}`).send(body).expect(400);
            expect(response.body.message).toContain('email');
            for (const write of writes()) expect(write).not.toHaveBeenCalled();
            expect(users.findOne).not.toHaveBeenCalled();
        });
    }

    for (const [method, route, base] of targets.filter(([, route]) => route.startsWith('/auth/') || route === '/terra/orders')) {
        it.each(['', null, '   '])(`${method} ${route} rejects blank required email %#`, async email => {
            const body = route === '/terra/orders' ? { ...base, recipient: { email } } : { ...base, email };
            await request(app.getHttpServer())[method](`/api/v1${route}`).send(body).expect(400);
            for (const write of writes()) expect(write).not.toHaveBeenCalled();
        });
    }

    it('normalizes a valid whitespace login and preserves normal bad-password behavior', async () => {
        await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: ' TEST@GMAIL.COM ', password: 'fixture-pass' }).expect(200);
        expect(users.findOne).toHaveBeenCalledWith('test@gmail.com');
        await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'test@gmail.com', password: 'wrong' }).expect(401);
    });
    it('allows a custom admin domain without a hardcoded exception', async () => {
        await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: ' ADMIN@FRIGOLABS.COM ', password: 'wrong' }).expect(401);
        expect(users.findOne).toHaveBeenCalledWith('admin@frigolabs.com');
        await request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...registration, email: 'admin@frigolabs.com' }).expect(201);
        expect(otp.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'admin@frigolabs.com' }));
    });
    it.each(['doctor@gmail.com', 'doctor@yahoo.com', 'doctor@outlook.com', 'doctor@hotmail.com', 'doctor@icloud.com', 'doctor@proton.me', 'doctor@clinic.com', 'doctor@hospital.org', 'doctor@myclinic.co.uk', 'doctor+test@example.com', 'doctor+clinic@example.com'])('accepts %s through registration, resend, verification and login guards', async email => {
        await request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...registration, email }).expect(201);
        expect(otp.register).toHaveBeenCalledWith(expect.objectContaining({ email }));
        await request(app.getHttpServer()).post('/api/v1/auth/register/resend').send({ email }).expect(201);
        expect(otp.resend).toHaveBeenCalledWith(email);
        await request(app.getHttpServer()).post('/api/v1/auth/register/verify').send({ email, otp: '123456' }).expect(201);
        expect(otp.verify).toHaveBeenCalledWith(email, '123456');
        await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'fixture-pass' }).expect(200);
        expect(users.findOne).toHaveBeenCalledWith(email);
    });
    it('registers Gmail plus-tag emails without rewriting their content', async () => {
        await request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...registration, email: ' John.Doe+Test@gmail.com ' }).expect(201);
        expect(otp.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'john.doe+test@gmail.com' }));
    });
    it('normalizes patient/clinic writes and preserves optional blank emails', async () => {
        await request(app.getHttpServer()).post('/api/v1/patients').send({ ...patientDetails, email: ' USER_NAME@GMAIL.COM ' }).expect(201);
        expect(db.patient.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'user_name@gmail.com' }) }));
        await request(app.getHttpServer()).put('/api/v1/patients/patient').send({ email: '   ' }).expect(200);
        expect(db.patient.update).toHaveBeenCalledWith(expect.objectContaining({ data: { email: null } }));
        await request(app.getHttpServer()).put('/api/v1/clinics/clinic').send({ status: 'Inactive' }).expect(200);
        expect(db.clinic.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Inactive' } }));
    });
    it('creates active clinics and only accepts active/inactive updates', async () => {
        await request(app.getHttpServer()).post('/api/v1/clinics').send({ name: 'Fixture', contact_name: 'Contact' }).expect(201);
        expect(db.clinic.create).toHaveBeenCalledWith({ data: { name: 'Fixture', contact_name: 'Contact', status: 'Active' } });
        await request(app.getHttpServer()).put('/api/v1/clinics/clinic').send({ status: 'Pending' }).expect(400);
        expect(db.clinic.update).not.toHaveBeenCalled();
        await request(app.getHttpServer()).put('/api/v1/clinics/clinic').send({ status: 'Active' }).expect(200);
        expect(db.clinic.update).toHaveBeenCalledWith({ where: { id: 'clinic' }, data: { status: 'Active' } });
    });
    it('normalizes nested Terra recipients before reaching order placement', async () => {
        await request(app.getHttpServer()).post('/api/v1/terra/orders').send({ patient_id: 'patient', recipient: { email: ' PERSON+LAB@GMAIL.COM ', phone_number: '(202) 555-0123' } }).expect(201);
        expect(terra.createOrder).toHaveBeenCalledWith(expect.objectContaining({ recipient: { email: 'person+lab@gmail.com', phone_number: '+12025550123' } }), identity.clinic_id);
    });
    it.each([undefined, null, '', '   ', '123', '+923001234567', '+14165550123', '4165550123', '1122334455'])('rejects missing or invalid lab phone %# before placing an order', async phone_number => {
        await request(app.getHttpServer()).post('/api/v1/terra/orders')
            .send({ patient_id: 'patient', recipient: { email: 'patient@gmail.com', phone_number } }).expect(400);
        expect(terra.createOrder).not.toHaveBeenCalled();
    });
    it('rejects nested clinic/user writes instead of passing arbitrary emails to Prisma', async () => {
        await request(app.getHttpServer()).put('/api/v1/clinics/clinic').send({ users: { create: { email: 'invalid' } } }).expect(400);
        expect(db.clinic.update).not.toHaveBeenCalled();
    });

    it('retains duplicate protection using a normalized, case-insensitive clinic lookup', async () => {
        db.clinic.findFirst.mockResolvedValueOnce({ id: 'existing' });
        await request(app.getHttpServer()).post('/api/v1/clinics').send({ name: 'Fixture', contact_name: 'Contact', email: ' TEST@GMAIL.COM ' }).expect(400);
        expect(db.clinic.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'test@gmail.com', mode: 'insensitive' } } }));
        expect(db.clinic.create).not.toHaveBeenCalled();
    });

    for (const method of ['post', 'put'] as const) {
        for (const field of ['phone', 'secondary_phone']) {
            it.each(['123', '+923001234567', '+447911123456', '0000000000', '2025550123 ext 5', { set: '+12025550123' }])(`${method} patients rejects invalid ${field} %# before patient/integration writes`, async value => {
                const route = method === 'post' ? '/api/v1/patients' : '/api/v1/patients/patient';
                const response = await request(app.getHttpServer())[method](route)
                    .send({ first_name: 'Fixture', last_name: 'Patient', [field]: value }).expect(400);
                expect(response.body.message).toContain('+1');
                expect(db.patient.create).not.toHaveBeenCalled();
                expect(db.patient.update).not.toHaveBeenCalled();
                expect(terra.prepareSandboxTest).not.toHaveBeenCalled();
            });
        }
    }
    it('normalizes both patient phones, allows optional clears and preserves omitted update fields', async () => {
        await request(app.getHttpServer()).post('/api/v1/patients').send({ ...patientDetails,
            phone: '(202) 555-0123', secondary_phone: '+1 202 555 0124' }).expect(201);
        expect(db.patient.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone: '+12025550123', secondary_phone: '+12025550124' }) }));
        await request(app.getHttpServer()).put('/api/v1/patients/patient').send({ phone: '', secondary_phone: null }).expect(200);
        expect(db.patient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { phone: null, secondary_phone: null } }));
        await request(app.getHttpServer()).put('/api/v1/patients/patient').send({ first_name: 'Updated' }).expect(200);
        expect(db.patient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { first_name: 'Updated' } }));
    });

    for (const field of ['first_name', 'last_name', 'address', 'postal_code']) {
        it.each(['', '   ', null, undefined])(`patient creation rejects missing ${field} %# before any side effects`, async value => {
            await request(app.getHttpServer()).post('/api/v1/patients').send({ ...patientDetails, [field]: value }).expect(400);
            expect(db.patient.create).not.toHaveBeenCalled();
            expect(terra.prepareSandboxTest).not.toHaveBeenCalled();
        });
        it(`patient update cannot clear required ${field}`, async () => {
            await request(app.getHttpServer()).put('/api/v1/patients/patient').send({ [field]: '   ' }).expect(400);
            expect(db.patient.update).not.toHaveBeenCalled();
        });
    }
    it.each([{ dob: '2025-02-29' }, { dob: '2999-01-01' }, { gender: 'invalid' }, { address: { set: '123 Main St' } }])('rejects malformed patient formats %#', async fields => {
        await request(app.getHttpServer()).post('/api/v1/patients').send({ ...patientDetails, ...fields }).expect(400);
        expect(db.patient.create).not.toHaveBeenCalled();
    });
    it('blocks empty profile name and email before any user updates', async () => {
        for (const fields of [{ name: ' ' }, { name: 'Fixture', email: '' }, { email: 'abc@gmail' }]) {
            await request(app.getHttpServer()).patch('/api/v1/auth/me').send(fields).expect(400);
        }
        expect(users.update).not.toHaveBeenCalled();
        expect(otp.changeEmail).not.toHaveBeenCalled();
    });
});

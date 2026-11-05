import type { Server } from 'node:http';
import type { publicBranding } from './branding.service';
type BrandingPayload = ReturnType<typeof publicBranding>;
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { ClinicsController } from '../clinics/clinics.controller';
import { ClinicsService } from '../clinics/clinics.service';
import { PatientsController } from '../patients/patients.controller';
import { PatientsService } from '../patients/patients.service';
import { WorkflowsController } from '../workflows/workflows.controller';
import { WorkflowsService } from '../workflows/workflows.service';
import { LabResultsController } from '../lab-results/lab-results.controller';
import { LabResultFilesController } from '../lab-results/lab-result-files.controller';
import { LabResultsService } from '../lab-results/lab-results.service';
import { PatientAccessController } from '../patient-access/patient-access.controller';
import { PatientAccessGuard } from '../patient-access/patient-access.guard';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { TerraController } from '../terra/terra.controller';
import { TerraService } from '../terra/terra.service';
import { ValidicController } from '../validic/validic.controller';
import { ValidicService } from '../validic/validic.service';
import { MailService } from '../mail/mail.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';

// Explicit opt-in, and ONLY a disposable local database with this exact prefix.
// No connection is opened during the normal suite or for an arbitrary URL.
const integration = process.env.TENANT_TEST_DATABASE_URL
  ? describe
  : describe.skip;
integration('Two-clinic HTTP isolation with real PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let queryCount = 0;
  let directory: string;
  let previousCwd: string;
  let jwt: JwtService;
  let codeA: string;
  let codeB: string;
  const secret = randomBytes(32).toString('hex');
  const originalSecret = process.env.JWT_SECRET;
  const originalTerra = process.env.TERRA_ENVIRONMENT;
  const originalDisplay = process.env.TERRA_SHOW_SANDBOX_DATA;
  const clinics = ['tenant-fixture-a', 'tenant-fixture-b'];
  const brandA = {
    name: 'NextGen Health',
    primary_color: '#163d8c',
    secondary_color: '#f2b84c',
    information: 'Synthetic NextGen clinic',
    services: ['Synthetic blood testing'],
  };
  const brandB = {
    name: 'Harbor Clinic',
    primary_color: '#74264f',
    secondary_color: '#73d8cb',
    information: 'Synthetic Harbor clinic',
    services: ['Synthetic health reviews'],
  };
  const auth = (id: string) => `Bearer ${jwt.sign({ sub: id })}`;
  const own = (index: number) => auth(`tenant-staff-${index}`);
  const admin = () => auth('tenant-platform-admin');
  // Two actual, distinct PNG files; the bytes never come from real patient files.
  const pngA = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=',
    'base64',
  );
  const pngB = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    const url = new URL(process.env.TENANT_TEST_DATABASE_URL!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/frigo_tenant_test_[a-z0-9_]+$/.test(url.pathname)
    )
      throw new Error('A disposable local tenant test database is required.');
    process.env.JWT_SECRET = secret;
    process.env.TERRA_ENVIRONMENT = 'sandbox';
    process.env.TERRA_SHOW_SANDBOX_DATA = 'true';
    const client = new PrismaClient({ datasourceUrl: url.toString(), log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', () => { queryCount++; });
    db = client;
    await db.$connect();
    // A fresh DB is mandatory; never erase an existing fixture or user database.
    if (await db.clinic.count())
      throw new Error('Tenant test database must be empty.');
    previousCwd = process.cwd();
    directory = await mkdtemp(join(tmpdir(), 'frigo-tenant-test-'));
    process.chdir(directory);
    await mkdir(join(directory, 'uploads', 'lab-results'), { recursive: true });
    await writeFile(
      join(directory, 'uploads', 'lab-results', 'tenant-report-a.pdf'),
      '%PDF-1.4\nSynthetic fixture A',
    );
    await writeFile(
      join(directory, 'uploads', 'lab-results', 'tenant-report-b.pdf'),
      '%PDF-1.4\nSynthetic fixture B',
    );
    codeA = String(100000 + Math.floor(Math.random() * 400000));
    codeB = String(500000 + Math.floor(Math.random() * 400000));
    for (const [index, clinicId] of clinics.entries()) {
      await db.clinic.create({
        data: {
          id: clinicId,
          ...(index ? brandB : brandA),
          contact_name: 'Synthetic administrator',
          status: 'Active',
        },
      });
      await db.user.create({
        data: {
          id: `tenant-staff-${index}`,
          clinic_id: clinicId,
          name: `Synthetic staff ${index}`,
          email: `staff-${index}@tenant-fixture.invalid`,
          password_hash: await bcrypt.hash(randomBytes(24).toString('hex'), 4),
          email_verified: true,
          is_clinic_admin: true,
        },
      });
      await db.patient.create({
        data: {
          id: `tenant-patient-${index}`,
          clinic_id: clinicId,
          first_name: 'Synthetic',
          last_name: `Patient ${index}`,
        },
      });
      await db.workflow.create({
        data: {
          id: `tenant-workflow-${index}`,
          clinic_id: clinicId,
          patient_id: `tenant-patient-${index}`,
          test_type: 'Synthetic test',
        },
      });
      await db.labResult.create({
        data: {
          id: `tenant-result-${index}`,
          patient_id: `tenant-patient-${index}`,
          clinic_id: clinicId,
          workflow_id: `tenant-workflow-${index}`,
          file_url: `/uploads/lab-results/tenant-report-${index ? 'b' : 'a'}.pdf`,
          source: 'TERRA',
          structured_report: {
            isSandbox: true,
            isPartial: false,
            resultStatus: 'results.results_ready',
            biomarkers: [],
          },
        },
      });
      await db.terraOrder.create({
        data: {
          id: `tenant-order-${index}`,
          patient_id: `tenant-patient-${index}`,
          workflow_id: `tenant-workflow-${index}`,
          lab_result_id: `tenant-result-${index}`,
          terra_order_id: `synthetic-order-${index}`,
          terra_product_id: 'synthetic-product',
          terra_order_status: 'order.completed',
        },
      });
      await db.labResultAccess.create({
        data: {
          lab_result_id: `tenant-result-${index}`,
          result_code: `SYNTHETIC-${index}`,
          access_code_hash: await bcrypt.hash(index ? codeB : codeA, 4),
          expires_at: new Date(Date.now() + 3600000),
        },
      });
    }
    await db.user.create({
      data: {
        id: 'tenant-platform-admin',
        name: 'Synthetic platform admin',
        email: 'platform@tenant-fixture.invalid',
        role: 'ADMIN',
        password_hash: await bcrypt.hash(randomBytes(24).toString('hex'), 4),
        email_verified: true,
      },
    });
    await db.user.create({
      data: {
        id: 'tenant-unassigned',
        name: 'Synthetic unassigned',
        email: 'unassigned@tenant-fixture.invalid',
        password_hash: 'unusable',
        email_verified: true,
      },
    });
    jwt = new JwtService({ secret });
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [
        BrandingController,
        ClinicsController,
        PatientsController,
        WorkflowsController,
        LabResultsController,
        LabResultFilesController,
        PatientAccessController,
        DashboardController,
        TerraController,
        ValidicController,
        UsersController,
      ],
      providers: [
        BrandingService,
        ClinicsService,
        PatientsService,
        WorkflowsService,
        LabResultsService,
        DashboardService,
        TerraService,
        ValidicService,
        UsersService,
        JwtStrategy,
        RolesGuard,
        PatientAccessGuard,
        { provide: PrismaService, useValue: db },
        { provide: MailService, useValue: { sendLabResultAccess: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, rawBody: true });
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'uploads/lab-results/:filename', method: RequestMethod.GET },
      ],
    });
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (previousCwd) process.chdir(previousCwd);
    if (directory) await rm(directory, { recursive: true, force: true });
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalTerra === undefined) delete process.env.TERRA_ENVIRONMENT;
    else process.env.TERRA_ENVIRONMENT = originalTerra;
    if (originalDisplay === undefined)
      delete process.env.TERRA_SHOW_SANDBOX_DATA;
    else process.env.TERRA_SHOW_SANDBOX_DATA = originalDisplay;
  });

  it.each([0, 1])(
    'saves and reloads separate branding and logos for clinic %i',
    async (index) => {
      const id = clinics[index],
        draft = index ? brandB : brandA;
      await request(app.getHttpServer<Server>())
        .put(`/api/v1/branding/${id}`)
        .set('Authorization', own(index))
        .send(draft)
        .expect(200);
      const uploaded = await request(app.getHttpServer<Server>())
        .post(`/api/v1/branding/${id}/logo`)
        .set('Authorization', own(index))
        .attach('file', index ? pngB : pngA, 'fixture.png')
        .expect(201);
      const reloaded = await request(app.getHttpServer<Server>())
        .get(`/api/v1/branding/${id}`)
        .set('Authorization', own(index))
        .expect(200);
      expect(reloaded.body).toMatchObject(draft);
      expect((reloaded.body as BrandingPayload).logo_url).toBe(
        (uploaded.body as BrandingPayload).logo_url,
      );
      const storedLogo = await db.clinicLogo.findUniqueOrThrow({ where: { clinic_id: id } });
      expect(Buffer.from(storedLogo.data).equals(index ? pngB : pngA)).toBe(true);
      expect(storedLogo.mime_type).toBe('image/png');
      expect(reloaded.body).not.toHaveProperty('data');
      const publicResponse = await request(app.getHttpServer<Server>())
        .get(`/api/v1/branding/public/${id}`)
        .expect(200);
      expect(publicResponse.body).not.toHaveProperty('contact_name');
      expect(publicResponse.body).not.toHaveProperty('users');
      await request(app.getHttpServer<Server>())
        .get((reloaded.body as BrandingPayload).logo_url)
        .expect('Content-Type', /image\/png/)
        .expect(200);
    },
  );

  it.each([0, 1])(
    'blocks all direct cross-clinic reads and writes for clinic %i',
    async (index) => {
      const other = 1 - index;
      const denied = [
        ['get', `/branding/${clinics[other]}`, undefined, 403],
        ['put', `/branding/${clinics[other]}`, brandA, 403],
        ['delete', `/branding/${clinics[other]}/logo`, undefined, 403],
        ['get', `/clinics/${clinics[other]}`, undefined, 403],
        ['get', '/clinics', undefined, 403],
        ['post', '/clinics', { name: 'Unauthorized', contact_name: 'No' }, 403],
        ['get', `/patients/tenant-patient-${other}`, undefined, 404],
        [
          'put',
          `/patients/tenant-patient-${other}`,
          { first_name: 'Changed' },
          404,
        ],
        ['get', `/workflows/tenant-workflow-${other}`, undefined, 404],
        [
          'patch',
          `/workflows/tenant-workflow-${other}/status`,
          { status: 'COMPLETED' },
          404,
        ],
        [
          'post',
          '/workflows',
          {
            patient_id: `tenant-patient-${other}`,
            test_type: 'Synthetic',
            clinic_id: clinics[other],
          },
          404,
        ],
        ['get', `/lab-results/tenant-result-${other}`, undefined, 404],
        [
          'patch',
          `/lab-results/tenant-result-${other}/status`,
          { status: 'Reviewed' },
          404,
        ],
        ['post', `/lab-results/tenant-result-${other}/access`, {}, 404],
        [
          'get',
          `/terra/patients/tenant-patient-${other}/orders`,
          undefined,
          404,
        ],
        ['post', `/terra/orders/tenant-order-${other}/sync`, {}, 404],
        [
          'get',
          `/validic/patient/tenant-patient-${other}/metrics`,
          undefined,
          404,
        ],
        ['get', `/validic/connect-url/tenant-patient-${other}`, undefined, 404],
        ['get', '/dashboard/admin/stats', undefined, 403],
        ['get', '/users', undefined, 403],
        [
          'patch',
          '/users/tenant-platform-admin/clinic-admin',
          { is_clinic_admin: true },
          404,
        ],
      ] as const;
      for (const [method, path, body, status] of denied) {
        const req = request(app.getHttpServer<Server>())
          [method](`/api/v1${path}`)
          .set('Authorization', own(index));
        if (body) req.send(body);
        await req.expect(status);
      }
      await request(app.getHttpServer<Server>())
        .get(`/uploads/lab-results/tenant-report-${other ? 'b' : 'a'}.pdf`)
        .set('Authorization', own(index))
        .expect(404);
    },
  );

  it.each([0, 1])(
    'scopes directories and dashboards even with a spoofed clinic query %i',
    async (index) => {
      const patients = await request(app.getHttpServer<Server>())
        .get(`/api/v1/patients?clinic_id=${clinics[1 - index]}`)
        .set('Authorization', own(index))
        .expect(200);
      expect(
        (patients.body as { id: string }[]).map(
          (patient: { id: string }) => patient.id,
        ),
      ).toEqual([`tenant-patient-${index}`]);
      const results = await request(app.getHttpServer<Server>())
        .get(`/api/v1/lab-results/overview?clinic_id=${clinics[1 - index]}`)
        .set('Authorization', own(index))
        .expect(200);
      expect(
        (results.body as { results: { id: string }[] }).results.map(
          (result: { id: string }) => result.id,
        ),
      ).toEqual([`tenant-result-${index}`]);
      const stats = await request(app.getHttpServer<Server>())
        .get('/api/v1/dashboard/clinic/stats')
        .set('Authorization', own(index))
        .expect(200);
      expect(
        (stats.body as { kpi: { totalPatients: number } }).kpi.totalPatients,
      ).toBe(1);
      await request(app.getHttpServer<Server>())
        .get(`/uploads/lab-results/tenant-report-${index ? 'b' : 'a'}.pdf`)
        .set('Authorization', own(index))
        .expect(200);
    },
  );

  it('loads dashboard summaries with fewer queries and the same clinic-scoped data', async () => {
    for (const index of [0, 1]) {
      const before = queryCount;
      const full = await request(app.getHttpServer<Server>()).get('/api/v1/dashboard/clinic/stats').set('Authorization', own(index)).expect(200);
      const fullQueries = queryCount - before;
      const summaryBefore = queryCount;
      const summary = await request(app.getHttpServer<Server>()).get(`/api/v1/dashboard/clinic/stats?summary=true&clinic_id=${clinics[1 - index]}`).set('Authorization', own(index)).expect(200);
      const summaryQueries = queryCount - summaryBefore;
      expect(summary.body.kpi).toEqual({ totalPatients: full.body.kpi.totalPatients, resultsReady: full.body.kpi.resultsReady, awaitingTestOrders: full.body.kpi.awaitingTestOrders });
      expect(summary.body.tables).toEqual(full.body.tables);
      expect(summaryQueries).toBeLessThan(fullQueries);
      await request(app.getHttpServer<Server>()).get('/api/v1/dashboard/admin/stats?summary=true').set('Authorization', own(index)).expect(403);
    }
    const before = queryCount;
    const full = await request(app.getHttpServer<Server>()).get('/api/v1/dashboard/admin/stats').set('Authorization', admin()).expect(200);
    const fullQueries = queryCount - before;
    const summaryBefore = queryCount;
    const summary = await request(app.getHttpServer<Server>()).get('/api/v1/dashboard/admin/stats?summary=true').set('Authorization', admin()).expect(200);
    expect(summary.body.kpi).toEqual({ totalClinics: full.body.kpi.totalClinics, resultsReady: full.body.kpi.resultsReady, completedWorkflows: full.body.kpi.completedWorkflows });
    expect(summary.body.tables.activeClinics).toEqual(full.body.tables.activeClinics);
    expect(queryCount - summaryBefore).toBeLessThan(fullQueries);
  });

  it('binds patient report access to both the result and the clinic', async () => {
    const verified = await request(app.getHttpServer<Server>())
      .post('/api/v1/patient-access/verify')
      .send({
        result_id: 'SYNTHETIC-0',
        access_code: codeA,
        clinic_id: clinics[0],
      })
      .expect(200);
    expect((verified.body as { branding: BrandingPayload }).branding.name).toBe(
      brandA.name,
    );
    expect(verified.body).not.toHaveProperty('patient_id');
    await request(app.getHttpServer<Server>())
      .post('/api/v1/patient-access/verify')
      .send({ result_id: 'SYNTHETIC-1', access_code: codeA })
      .expect(401);
    await request(app.getHttpServer<Server>())
      .post('/api/v1/patient-access/report')
      .send({ result_id: 'SYNTHETIC-1', access_code: codeA })
      .expect(401);
    await request(app.getHttpServer<Server>())
      .post('/api/v1/patient-access/verify')
      .send({
        result_id: 'SYNTHETIC-0',
        access_code: codeA,
        clinic_id: clinics[1],
      })
      .expect(401);
    await request(app.getHttpServer<Server>())
      .get('/uploads/lab-results/tenant-report-a.pdf')
      .expect(401);
  });

  it('allows own-clinic branding without a permission flag and rejects retired assignment routes and unassigned users', async () => {
    await request(app.getHttpServer<Server>())
      .get('/api/v1/clinics')
      .set('Authorization', admin())
      .expect(200);
    await request(app.getHttpServer<Server>())
      .get('/api/v1/patients/tenant-patient-1')
      .set('Authorization', admin())
      .expect(200);
    for (const legacyFlag of [false, true]) {
      await db.user.update({ where: { id: 'tenant-staff-0' }, data: { is_clinic_admin: legacyFlag } });
      await request(app.getHttpServer<Server>()).put(`/api/v1/branding/${clinics[0]}`).set('Authorization', own(0)).send(brandA).expect(200);
      await request(app.getHttpServer<Server>()).put(`/api/v1/branding/${clinics[1]}`).set('Authorization', own(0)).send(brandA).expect(403);
    }
    await request(app.getHttpServer<Server>()).patch('/api/v1/users/tenant-staff-0/clinic-admin').set('Authorization', admin()).send({ is_clinic_admin: true }).expect(404);
    await request(app.getHttpServer<Server>()).put(`/api/v1/branding/${clinics[0]}`).set('Authorization', auth('tenant-unassigned')).send(brandA).expect(403);
    await request(app.getHttpServer<Server>())
      .get('/api/v1/patients')
      .set('Authorization', auth('tenant-unassigned'))
      .expect(403);
  });

  it('stores uploaded report bytes in PostgreSQL and serves only the owning clinic and authorized patient', async () => {
    const bytes = Buffer.from('%PDF-1.4\nSynthetic database report\n%%EOF');
    const uploaded = await request(app.getHttpServer<Server>())
      .post('/api/v1/lab-results')
      .set('Authorization', own(0))
      .field('patient_id', 'tenant-patient-0')
      .attach('file', bytes, { filename: 'synthetic.pdf', contentType: 'application/pdf' })
      .expect(201);
    const result = uploaded.body as { id: string; file_url: string };
    expect(uploaded.body).not.toHaveProperty('stored_file');
    const stored = await db.labResultFile.findUniqueOrThrow({ where: { lab_result_id: result.id } });
    expect(Buffer.from(stored.data)).toEqual(bytes);
    expect(stored.mime_type).toBe('application/pdf');
    const ownFile = await request(app.getHttpServer<Server>()).get(result.file_url).set('Authorization', own(0)).expect(200);
    expect(ownFile.body).toEqual(bytes);
    await request(app.getHttpServer<Server>()).get(result.file_url).set('Authorization', own(1)).expect(404);
    await request(app.getHttpServer<Server>()).get(result.file_url).expect(401);
    const access = await request(app.getHttpServer<Server>()).post(`/api/v1/lab-results/${result.id}/access`).set('Authorization', own(0)).expect(201);
    const code = access.body as { resultId: string; accessCode: string };
    const patientFile = await request(app.getHttpServer<Server>()).post('/api/v1/patient-access/report').send({ result_id: code.resultId, access_code: code.accessCode, clinic_id: clinics[0] }).expect(200);
    expect(patientFile.body).toEqual(bytes);
    await request(app.getHttpServer<Server>()).post('/api/v1/patient-access/report').send({ result_id: code.resultId, access_code: code.accessCode, clinic_id: clinics[1] }).expect(401);
    await db.labResult.delete({ where: { id: result.id } });
    expect(await db.labResultFile.count({ where: { lab_result_id: result.id } })).toBe(0);
  });

  it('enforces clinic links inside PostgreSQL as well as the API', async () => {
    await expect(
      db.patient.update({
        where: { id: 'tenant-patient-0' },
        data: { clinic_id: clinics[1] },
      }),
    ).rejects.toThrow();
    await expect(
      db.labResult.update({
        where: { id: 'tenant-result-0' },
        data: { patient_id: 'tenant-patient-1' },
      }),
    ).rejects.toThrow();
    await expect(
      db.workflow.create({
        data: {
          patient_id: 'tenant-patient-0',
          clinic_id: clinics[1],
          test_type: 'Invalid cross-clinic fixture',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.labResult.create({
        data: {
          patient_id: 'tenant-patient-0',
          clinic_id: clinics[1],
          file_url: '',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.terraOrder.create({
        data: {
          patient_id: 'tenant-patient-0',
          workflow_id: 'tenant-workflow-1',
          terra_order_id: 'synthetic-invalid',
          terra_product_id: 'fixture',
          terra_order_status: 'order.created',
        },
      }),
    ).rejects.toThrow();
  });

  it('does not expose shared legacy device portal links through patient responses', async () => {
    await db.patient.updateMany({
      where: { id: { in: ['tenant-patient-0', 'tenant-patient-1'] } },
      data: {
        validic_user_id: 'shared-legacy-fixture',
        validic_marketplace_url: 'https://example.invalid/device-fixture',
      },
    });
    for (const index of [0, 1]) {
      const patient = await request(app.getHttpServer<Server>())
        .get(`/api/v1/patients/tenant-patient-${index}`)
        .set('Authorization', own(index))
        .expect(200);
      expect(patient.body).not.toHaveProperty('validic_marketplace_url');
      await request(app.getHttpServer<Server>())
        .get(`/api/v1/validic/connect-url/tenant-patient-${index}`)
        .set('Authorization', own(index))
        .expect(503);
    }
    await db.patient.updateMany({
      where: { id: { in: ['tenant-patient-0', 'tenant-patient-1'] } },
      data: { validic_user_id: null, validic_marketplace_url: null },
    });
  });

  it('rejects unsafe logo content, supports replacement/removal, and restores defaults', async () => {
    await request(app.getHttpServer<Server>())
      .post(`/api/v1/branding/${clinics[0]}/logo`)
      .set('Authorization', own(0))
      .attach('file', Buffer.from('<svg onload="alert(1)" />'), 'evil.png')
      .expect(400);
    await request(app.getHttpServer<Server>())
      .post(`/api/v1/branding/${clinics[0]}/logo`)
      .set('Authorization', own(0))
      .attach('file', pngB, 'replacement.png')
      .expect(201);
    const removed = await request(app.getHttpServer<Server>())
      .delete(`/api/v1/branding/${clinics[0]}/logo`)
      .set('Authorization', own(0))
      .expect(200);
    expect((removed.body as BrandingPayload).logo_url).toBeNull();
    expect(await db.clinicLogo.count({ where: { clinic_id: clinics[0] } })).toBe(0);
    const clinic = await db.clinic.create({
      data: { name: 'Default Fixture Clinic', contact_name: 'Synthetic' },
    });
    const defaults = await request(app.getHttpServer<Server>())
      .get(`/api/v1/branding/public/${clinic.id}`)
      .expect(200);
    expect((defaults.body as BrandingPayload).primary_color).toBe('#0F766E');
    expect((defaults.body as BrandingPayload).services).toEqual([]);
    await db.clinic.update({
      where: { id: clinic.id },
      data: { status: 'Inactive' },
    });
    await request(app.getHttpServer<Server>())
      .get(`/api/v1/branding/public/${clinic.id}`)
      .expect(404);
  });
});

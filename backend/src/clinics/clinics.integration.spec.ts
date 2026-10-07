import { PrismaClient } from '@prisma/client';
import { ClinicsService } from './clinics.service';
import { PrismaService } from '../prisma/prisma.service';

const integration = process.env.AUTH_DB_TESTS === '1' ? describe : describe.skip;
integration('Clinic patient totals', () => {
    const prisma = new PrismaClient();
    afterAll(() => prisma.$disconnect());
    it('counts the first saved patient without requiring a session or result', async () => {
        const rollback = new Error('Rollback clinic count fixture');
        await expect(prisma.$transaction(async tx => {
            const clinic = await tx.clinic.create({ data: { name: 'Count Test Fixture', contact_name: 'Fixture', status: 'Active' } });
            const service = new ClinicsService(tx as unknown as PrismaService);
            const count = async () => (await service.findAll()).find(row => row.id === clinic.id)._count.patients;
            expect(await count()).toBe(0);
            await tx.patient.create({ data: { clinic_id: clinic.id, first_name: 'First', last_name: 'Fixture' } });
            expect(await count()).toBe(1);
            await tx.patient.create({ data: { clinic_id: clinic.id, first_name: 'Second', last_name: 'Fixture' } });
            expect(await count()).toBe(2);
            throw rollback;
        })).rejects.toBe(rollback);
    });
});

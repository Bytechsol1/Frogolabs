import { PatientsService } from './patients.service';

describe('patient registration sandbox scheduling', () => {
    it('creates the patient, selected workflow and five-minute queue job atomically', async () => {
        const db: any = { patient: { create: jest.fn().mockResolvedValue({ id: 'patient' }) } };
        const validic: any = { provisionUser: jest.fn().mockResolvedValue(null) };
        const terra: any = { prepareSandboxTest: jest.fn().mockResolvedValue({ id: '100091', name: 'Thyroid Function', country: 'US' }) };
        const before = Date.now();
        await new PatientsService(db, validic, terra).create('clinic', 'user', { first_name: 'Demo', last_name: 'Patient', address: '123 Test Street', postal_code: '10001', terra_variant_id: '100091', test_type: 'Untrusted label' });
        const data = db.patient.create.mock.calls[0][0].data;
        expect(terra.prepareSandboxTest).toHaveBeenCalledWith('100091');
        expect(data.workflows.create.test_type).toBe('Thyroid Function');
        expect(data.sandboxReportJobs.create).toMatchObject({ variant_id: '100091', test_name: 'Thyroid Function' });
        expect(data.sandboxReportJobs.create.due_at.getTime()).toBeGreaterThanOrEqual(before + 300000);
        expect(data.sandboxReportJobs.create.due_at.getTime()).toBeLessThanOrEqual(Date.now() + 300000);
    });

    it('rejects an unavailable test before creating a patient', async () => {
        const db: any = { patient: { create: jest.fn() } };
        const terra: any = { prepareSandboxTest: jest.fn().mockRejectedValue(new Error('Unavailable test')) };
        await expect(new PatientsService(db, {} as any, terra).create('clinic', 'user', { first_name: 'Demo', last_name: 'Patient', address: '123 Test Street', postal_code: '10001', terra_variant_id: 'fake' })).rejects.toThrow('Unavailable test');
        expect(db.patient.create).not.toHaveBeenCalled();
    });
});

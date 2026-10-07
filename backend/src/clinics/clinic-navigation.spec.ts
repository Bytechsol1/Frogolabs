import { PatientsController } from '../patients/patients.controller';
import { LabResultsController } from '../lab-results/lab-results.controller';
jest.mock('uuid', () => ({ v4: () => 'unused-upload-fixture' }));

describe('Clinic-scoped navigation', () => {
    const patients = { findAll: jest.fn().mockResolvedValue([]) };
    const results = { overview: jest.fn().mockResolvedValue({ results: [], pendingPatients: [] }) };
    const patientController = new PatientsController(patients as any);
    const resultsController = new LabResultsController(results as any);
    beforeEach(() => jest.clearAllMocks());

    it('lets an admin open the selected clinic patients and results', async () => {
        const req = { user: { role: 'ADMIN', clinic_id: null } };
        await patientController.findAll(req, 'selected-clinic');
        await resultsController.overview(req, 'selected-clinic');
        expect(patients.findAll).toHaveBeenCalledWith('selected-clinic');
        expect(results.overview).toHaveBeenCalledWith('selected-clinic');
    });
    it('keeps normal admin directory links unfiltered', async () => {
        const req = { user: { role: 'ADMIN', clinic_id: null } };
        await patientController.findAll(req);
        await resultsController.overview(req);
        expect(patients.findAll).toHaveBeenCalledWith(null);
        expect(results.overview).toHaveBeenCalledWith(null);
    });
    it('does not let clinic staff select another clinic using the URL', async () => {
        const req = { user: { role: 'CLINIC_USER', clinic_id: 'own-clinic' } };
        await patientController.findAll(req, 'other-clinic');
        await resultsController.overview(req, 'other-clinic');
        expect(patients.findAll).toHaveBeenCalledWith('own-clinic');
        expect(results.overview).toHaveBeenCalledWith('own-clinic');
    });
});

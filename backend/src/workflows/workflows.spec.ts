import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

describe('Workflow status authorization', () => {
    const prisma = { workflow: { findFirst: jest.fn(), update: jest.fn() } };
    const service = new WorkflowsService(prisma as any);
    const controller = new WorkflowsController(service);
    const request = (role: string, clinic_id: string | null) => ({ user: { id: 'actor', role, clinic_id } });

    beforeEach(() => jest.resetAllMocks());

    it('uses the existing update/history operation for the clinic and ignores a spoofed actor', async () => {
        prisma.workflow.findFirst.mockResolvedValue({ id: 'own' });
        prisma.workflow.update.mockResolvedValue({ id: 'own', status: 'COMPLETED' });
        await controller.updateStatus('own', { status: 'COMPLETED', updated_by: 'attacker' }, request('CLINIC_USER', 'clinic-a'));
        expect(prisma.workflow.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'own', clinic_id: 'clinic-a', patient: { clinic_id: 'clinic-a' } },
            data: { status: 'COMPLETED', history: { create: { status: 'COMPLETED', notes: null, updated_by: 'actor' } } },
        }));
    });

    it('rejects a workflow outside the authenticated clinic before writing history', async () => {
        prisma.workflow.findFirst.mockResolvedValue(null);
        await expect(controller.updateStatus('foreign', { status: 'COMPLETED' }, request('CLINIC_USER', 'clinic-a'))).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.workflow.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', clinic_id: 'clinic-a' } }));
        expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it.each([['CLINIC_USER', null], ['UNKNOWN', 'clinic-a']])('fails closed for role %s and clinic %s', async (role, clinic) => {
        await expect(controller.updateStatus('own', {}, request(role!, clinic))).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
    });

    it('preserves unrestricted admin updates', async () => {
        prisma.workflow.findFirst.mockResolvedValue({ id: 'any' });
        await controller.updateStatus('any', { status: 'RESULTS_READY' }, request('ADMIN', null));
        expect(prisma.workflow.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'any' } }));
    });
});

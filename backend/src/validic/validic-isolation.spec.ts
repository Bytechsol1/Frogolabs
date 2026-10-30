import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ValidicController } from './validic.controller';
import { ValidicService } from './validic.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('Device event isolation', () => {
  const original = process.env.VALIDIC_WEBHOOK_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.VALIDIC_WEBHOOK_SECRET;
    else process.env.VALIDIC_WEBHOOK_SECRET = original;
  });
  it('rejects unsigned callbacks and fails closed when the shared header is not configured', async () => {
    const service = { processWebhook: jest.fn() };
    const controller = new ValidicController(
      service as unknown as ValidicService,
    );
    delete process.env.VALIDIC_WEBHOOK_SECRET;
    await expect(controller.handleWebhook({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    process.env.VALIDIC_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    await expect(controller.handleWebhook({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.processWebhook).not.toHaveBeenCalled();
    await controller.handleWebhook(
      {},
      `Bearer ${process.env.VALIDIC_WEBHOOK_SECRET}`,
    );
    expect(service.processWebhook).toHaveBeenCalledTimes(1);
  });
  it('rejects legacy provider mappings shared by multiple patients instead of guessing a clinic', async () => {
    const db = {
      patient: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'patient-a' }, { id: 'patient-b' }]),
      },
      healthMetric: { create: jest.fn() },
    };
    const service = new ValidicService(db as unknown as PrismaService);
    await expect(
      service.processWebhook({ user_id: 'ambiguous-fixture' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.healthMetric.create).not.toHaveBeenCalled();
  });
  it('checks a patient belongs to the caller before returning metrics', async () => {
    const db = {
      patient: { findFirst: jest.fn().mockResolvedValue(null) },
      healthMetric: { findMany: jest.fn() },
    };
    const service = new ValidicService(db as unknown as PrismaService);
    await expect(
      service.getPatientMetrics('foreign-patient', undefined, 'clinic-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.healthMetric.findMany).not.toHaveBeenCalled();
  });
});

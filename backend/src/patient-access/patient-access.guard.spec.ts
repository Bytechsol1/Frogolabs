import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PatientAccessGuard } from './patient-access.guard';

describe('Patient report access rate limiting', () => {
  const query = jest.fn();
  const guard = new PatientAccessGuard({
    $queryRaw: query,
  } as unknown as PrismaService);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '127.0.0.1',
        body: { result_id: 'SYNTHETIC-0' },
      }),
    }),
  } as unknown as ExecutionContext;
  beforeEach(() => query.mockReset());
  it('limits both the client IP and result identifier using persisted counters', async () => {
    query.mockResolvedValue([{ attempts: 1 }]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects repeated attempts even if the previous counter update succeeded', async () => {
    query
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ attempts: 61 }]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});

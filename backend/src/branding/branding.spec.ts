import type { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import {
  brandingSchema,
  logoType,
  publicBranding,
  BrandingService,
} from './branding.service';
import { clinicScope, requireClinic } from '../common/tenant';

describe('Clinic branding validation and permissions', () => {
  const user = {
    id: 'staff-a',
    role: 'CLINIC_USER',
    clinic_id: 'clinic-a',
    is_clinic_admin: true,
  };
  const draft = {
    name: 'NextGen Health',
    primary_color: '#123456',
    secondary_color: '#e6a847',
    information: 'Synthetic clinic',
    services: ['Blood testing'],
  };
  it('accepts plain text clinic settings and rejects nested writes, CSS and unsafe colors', () => {
    expect(brandingSchema.parse(draft)).toEqual(draft);
    for (const extra of [
      { primary_color: 'red;display:none' },
      { logo_url: 'javascript:alert(1)' },
      { users: { create: {} } },
      { services: ['x'.repeat(121)] },
    ]) {
      expect(brandingSchema.safeParse({ ...draft, ...extra }).success).toBe(
        false,
      );
    }
  });
  it('does not leak contact details, storage keys, or staff in the public branding response', () => {
    const record = {
      id: 'clinic-a',
      name: 'NextGen Health',
      branding_logo: 'private-key.png',
      email: 'private@example.com',
      users: ['hidden'],
    };
    const result = publicBranding(record);
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('users');
    expect(result).not.toHaveProperty('branding_logo');
    expect(result.primary_color).toBe('#0F766E');
    expect(result.services).toEqual([]);
  });
  it('restricts editing to the assigned clinic administrator or platform administrator', () => {
    expect(() => requireClinic(user, 'clinic-b', true)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      requireClinic({ ...user, is_clinic_admin: false }, 'clinic-a', true),
    ).toThrow(ForbiddenException);
    expect(() => requireClinic(user, 'clinic-a', true)).not.toThrow();
    expect(() =>
      requireClinic({ ...user, role: 'ADMIN' }, 'clinic-b', true),
    ).not.toThrow();
    expect(() => clinicScope({ ...user, clinic_id: null })).toThrow(
      ForbiddenException,
    );
    expect(() => clinicScope({ ...user, role: 'UNKNOWN' })).toThrow(
      ForbiddenException,
    );
  });
  it('checks tenant permission before a logo upload can write to disk or the database', async () => {
    const prisma = { clinic: { findUnique: jest.fn(), update: jest.fn() } };
    const branding = new BrandingService(prisma as unknown as PrismaService);
    await expect(branding.upload('clinic-b', undefined, user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.clinic.findUnique).not.toHaveBeenCalled();
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });
  it('rejects SVG, HTML masquerading as images, and oversized logos', () => {
    for (const file of [
      Buffer.from('<svg onload="alert(1)"></svg>'),
      Buffer.from('<html>not an image</html>'),
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ]) {
      expect(() => logoType(file)).toThrow(BadRequestException);
    }
  });

  it('reads remote-database logo bytes from PostgreSQL and refuses a filesystem override', async () => {
    const previousDatabase = process.env.DATABASE_URL;
    const previousStorage = process.env.CLINIC_LOGO_STORAGE;
    const endpoint = new URL('postgresql:' + '//' + 'db.fixture.supabase.co' + '/postgres');
    process.env.DATABASE_URL = endpoint.toString();
    delete process.env.CLINIC_LOGO_STORAGE;
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64');
    const filename = '11111111-1111-4111-8111-111111111111.png';
    const db = {
      clinic: { findFirst: jest.fn().mockResolvedValue({ id: 'clinic-a', name: 'Synthetic clinic', branding_logo: filename }) },
      clinicLogo: { findUnique: jest.fn().mockResolvedValue({ file_name: filename, data: Uint8Array.from(bytes), mime_type: 'image/png' }) },
    };
    try {
      const service = new BrandingService(db as unknown as PrismaService);
      const result = await service.logo('clinic-a');
      expect(result.body.equals(bytes)).toBe(true);
      expect(result.mime).toBe('image/png');
      expect(db.clinicLogo.findUnique).toHaveBeenCalledWith({ where: { clinic_id: 'clinic-a' } });
      process.env.CLINIC_LOGO_STORAGE = 'filesystem';
      await expect(service.logo('clinic-a')).rejects.toThrow(ServiceUnavailableException);
    } finally {
      if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
      if (previousStorage === undefined) delete process.env.CLINIC_LOGO_STORAGE; else process.env.CLINIC_LOGO_STORAGE = previousStorage;
    }
  });
});

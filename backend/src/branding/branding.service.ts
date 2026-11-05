import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseRecord } from '../common/email-records.dto';
import { requireClinic, TenantUser } from '../common/tenant';

export const brandingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    primary_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.'),
    secondary_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.'),
    information: z.string().trim().max(3000),
    services: z.array(z.string().trim().min(1).max(120)).max(30),
  })
  .strict();

export const brandingSelect = {
  id: true,
  name: true,
  primary_color: true,
  secondary_color: true,
  information: true,
  services: true,
  branding_logo: true,
} as const;

export function publicBranding(clinic: {
  id: string;
  name: string;
  primary_color?: string;
  secondary_color?: string;
  information?: string;
  services?: unknown;
  branding_logo?: string | null;
}) {
  return {
    id: clinic.id,
    name: clinic.name,
    primary_color: clinic.primary_color || '#0F766E',
    secondary_color: clinic.secondary_color || '#14B8A6',
    information: clinic.information || '',
    services: Array.isArray(clinic.services)
      ? clinic.services.filter((s) => typeof s === 'string')
      : [],
    logo_url: clinic.branding_logo
      ? `/api/v1/branding/public/${encodeURIComponent(clinic.id)}/logo?v=${createHash('sha256').update(clinic.branding_logo).digest('hex').slice(0, 16)}`
      : null,
  };
}

export function logoType(buffer: Buffer) {
  if (buffer.length > 2 * 1024 * 1024 || buffer.length < 12)
    throw new BadRequestException(
      'Choose a PNG, JPEG or WebP image up to 2 MB.',
    );
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { extension: 'png', mime: 'image/png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { extension: 'jpg', mime: 'image/jpeg' };
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
    return { extension: 'webp', mime: 'image/webp' };
  throw new BadRequestException(
    'Choose a PNG, JPEG or WebP image. SVG and other file types are not allowed.',
  );
}

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async publicClinic(id: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id, OR: [{ status: null }, { status: { not: 'Inactive' } }] },
      select: brandingSelect,
    });
    if (!clinic) throw new NotFoundException('Clinic not available.');
    return clinic;
  }

  async get(id: string, user: TenantUser) {
    requireClinic(user, id);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      select: brandingSelect,
    });
    if (!clinic) throw new NotFoundException('Clinic not found.');
    return publicBranding(clinic);
  }

  async save(id: string, input: unknown, user: TenantUser) {
    requireClinic(user, id);
    const data = parseRecord(brandingSchema, input);
    return publicBranding(
      await this.prisma.clinic.update({
        where: { id },
        data,
        select: brandingSelect,
      }),
    );
  }

  async upload(
    id: string,
    file: Express.Multer.File | undefined,
    user: TenantUser,
  ) {
    requireClinic(user, id);
    if (!file) throw new BadRequestException('Choose a logo image.');
    const { extension, mime } = logoType(file.buffer);
    const existing = await this.prisma.clinic.findUnique({
      where: { id },
      select: brandingSelect,
    });
    if (!existing) throw new NotFoundException('Clinic not found.');
    const key = `${randomUUID()}.${extension}`;
    if (this.databaseLogos()) {
      const data = Uint8Array.from(file.buffer);
      const clinic = await this.prisma.$transaction(async (tx) => {
        await tx.clinicLogo.upsert({
          where: { clinic_id: id },
          create: { clinic_id: id, file_name: key, mime_type: mime, data },
          update: { file_name: key, mime_type: mime, data },
        });
        return tx.clinic.update({ where: { id }, data: { branding_logo: key }, select: brandingSelect });
      });
      return publicBranding(clinic);
    }
    await mkdir(join(process.cwd(), 'uploads', 'clinic-logos'), {
      recursive: true,
    });
    await writeFile(this.logoPath(key), file.buffer, { flag: 'wx' });
    let clinic: Prisma.ClinicGetPayload<{ select: typeof brandingSelect }>;
    try {
      clinic = await this.prisma.clinic.update({
        where: { id },
        data: { branding_logo: key },
        select: brandingSelect,
      });
    } catch (error) {
      await unlink(this.logoPath(key)).catch(() => {});
      throw error;
    }
    if (existing.branding_logo)
      await unlink(this.logoPath(existing.branding_logo)).catch(() => {});
    return publicBranding(clinic);
  }

  async remove(id: string, user: TenantUser) {
    requireClinic(user, id);
    const existing = await this.prisma.clinic.findUnique({
      where: { id },
      select: brandingSelect,
    });
    if (!existing) throw new NotFoundException('Clinic not found.');
    if (this.databaseLogos()) {
      const clinic = await this.prisma.$transaction(async (tx) => {
        await tx.clinicLogo.deleteMany({ where: { clinic_id: id } });
        return tx.clinic.update({ where: { id }, data: { branding_logo: null }, select: brandingSelect });
      });
      return publicBranding(clinic);
    }
    const clinic = await this.prisma.clinic.update({
      where: { id },
      data: { branding_logo: null },
      select: brandingSelect,
    });
    if (existing.branding_logo)
      await unlink(this.logoPath(existing.branding_logo)).catch(() => {});
    return publicBranding(clinic);
  }

  async logo(id: string) {
    const clinic = await this.publicClinic(id);
    if (!clinic.branding_logo) throw new NotFoundException('Logo not found.');
    if (this.databaseLogos()) {
      const asset = await this.prisma.clinicLogo.findUnique({ where: { clinic_id: id } });
      if (!asset || asset.file_name !== clinic.branding_logo) throw new NotFoundException('Logo not found.');
      const body = Buffer.from(asset.data);
      return { body, mime: logoType(body).mime };
    }
    let body: Buffer;
    try {
      body = await readFile(this.logoPath(clinic.branding_logo));
    } catch {
      throw new NotFoundException('Logo not found.');
    }
    return { body, mime: logoType(body).mime };
  }

  private logoPath(key: string) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key))
      throw new NotFoundException('Logo not found.');
    return join(process.cwd(), 'uploads', 'clinic-logos', key);
  }

  private databaseLogos() {
    const configured = process.env.CLINIC_LOGO_STORAGE?.trim();
    if (configured && configured !== 'database' && configured !== 'filesystem') throw new ServiceUnavailableException('Clinic logo storage is not configured correctly.');
    let local = process.env.NODE_ENV !== 'production';
    if (process.env.DATABASE_URL) {
      try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname); }
      catch { throw new ServiceUnavailableException('Clinic logo storage is not configured correctly.'); }
    }
    if (!local && configured === 'filesystem') throw new ServiceUnavailableException('Remote databases require database logo storage.');
    if (!local) return true;
    return configured === 'database';
  }
}

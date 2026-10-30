import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { clinicScope, type TenantUser } from '../common/tenant';
import { LabResultsService } from './lab-results.service';

// Preserve stored /uploads URLs, but require the same authorization as the result.
@Controller('uploads/lab-results')
@UseGuards(JwtAuthGuard)
export class LabResultFilesController {
  constructor(private readonly results: LabResultsService) {}

  @Get(':filename')
  async file(
    @Param('filename') filename: string,
    @Req() request: { user: TenantUser },
    @Res() response: Response,
  ) {
    const report = await this.results.staffFile(
      filename,
      clinicScope(request.user),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    if (report.kind === 'bytes') response.type(report.mimeType).send(report.data);
    else response.sendFile(report.filePath);
  }
}

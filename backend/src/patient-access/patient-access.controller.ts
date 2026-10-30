import { Controller, Post, Body, HttpCode, Res, UseGuards, Header } from '@nestjs/common';
import { PatientAccessGuard } from './patient-access.guard';
import type { Response } from 'express';
import { LabResultsService } from '../lab-results/lab-results.service';

@Controller('patient-access')
@UseGuards(PatientAccessGuard)
export class PatientAccessController {
    constructor(private labResultsService: LabResultsService) { }

    @Post('verify')
    @Header('Cache-Control', 'private, no-store')
    @HttpCode(200)
    verify(@Body() body: { result_id: string; access_code: string; clinic_id?: string }) {
        return this.labResultsService.verifyPatientAccess(body?.result_id, body?.access_code, body?.clinic_id);
    }

    @Post('report')
    @HttpCode(200)
    async getReport(@Body() body: { result_id: string; access_code: string; clinic_id?: string }, @Res() res: Response) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        const report = await this.labResultsService.getPatientReport(body?.result_id, body?.access_code, body?.clinic_id);
        if (report.kind === 'structured') {
            res.json(report.report);
            return;
        }
        res.setHeader('Content-Disposition', 'inline');
        if (report.kind === 'bytes') res.type(report.mimeType).send(report.data);
        else res.sendFile(report.filePath);
    }
}

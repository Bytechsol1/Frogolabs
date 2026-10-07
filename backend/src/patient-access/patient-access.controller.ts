import { Controller, Post, Body, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LabResultsService } from '../lab-results/lab-results.service';

@Controller('patient-access')
export class PatientAccessController {
    constructor(private labResultsService: LabResultsService) { }

    @Post('verify')
    @HttpCode(200)
    verify(@Body() body: { result_id: string; access_code: string }) {
        return this.labResultsService.verifyPatientAccess(body.result_id, body.access_code);
    }

    @Post('report')
    @HttpCode(200)
    async getReport(@Body() body: { result_id: string; access_code: string }, @Res() res: Response) {
        const report = await this.labResultsService.getPatientReport(body.result_id, body.access_code);
        if (report.kind === 'structured') {
            res.json(report.report);
            return;
        }
        res.setHeader('Content-Disposition', 'inline');
        res.sendFile(report.filePath);
    }
}

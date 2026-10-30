import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Headers, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { clinicScope } from '../common/tenant';
import { ValidicService } from './validic.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('validic')
export class ValidicController {
    constructor(private readonly validicService: ValidicService) { }

    @UseGuards(JwtAuthGuard)
    @Get('connect-url/:patientId')
    async getConnectUrl(@Param('patientId') patientId: string, @Req() req) {
        return this.validicService.getConnectUrl(patientId, clinicScope(req.user));
    }

    @UseGuards(JwtAuthGuard)
    @Get('patient/:patientId/metrics')
    async getPatientMetrics(
        @Param('patientId') patientId: string,
        @Query('type') metricType?: string,
        @Req() req?,
    ) {
        return this.validicService.getPatientMetrics(patientId, metricType, clinicScope(req.user));
    }

    @UseGuards(JwtAuthGuard)
    @Post('patient/:patientId/seed-demo')
    async seedDemoMetrics(@Param('patientId') patientId: string, @Req() req) {
        return this.validicService.seedDemoMetrics(patientId, clinicScope(req.user));
    }

    @Post('webhook')
    async handleWebhook(@Body() payload: any, @Headers('authorization') authorization?: string) {
        const secret = process.env.VALIDIC_WEBHOOK_SECRET;
        if (!secret) throw new ServiceUnavailableException('Device webhook authentication is not configured.');
        const provided = Buffer.from(authorization || '');
        const expected = Buffer.from(`Bearer ${secret}`);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new UnauthorizedException('Invalid device webhook authentication.');
        return this.validicService.processWebhook(payload);
    }
}

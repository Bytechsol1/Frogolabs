import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ValidicService } from './validic.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('validic')
export class ValidicController {
    constructor(private readonly validicService: ValidicService) { }

    @UseGuards(JwtAuthGuard)
    @Get('connect-url/:patientId')
    async getConnectUrl(@Param('patientId') patientId: string) {
        return this.validicService.getConnectUrl(patientId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('patient/:patientId/metrics')
    async getPatientMetrics(
        @Param('patientId') patientId: string,
        @Query('type') metricType?: string,
    ) {
        return this.validicService.getPatientMetrics(patientId, metricType);
    }

    @UseGuards(JwtAuthGuard)
    @Post('patient/:patientId/seed-demo')
    async seedDemoMetrics(@Param('patientId') patientId: string) {
        return this.validicService.seedDemoMetrics(patientId);
    }

    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        return this.validicService.processWebhook(payload);
    }
}

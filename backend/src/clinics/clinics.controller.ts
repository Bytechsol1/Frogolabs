import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { requireClinic, requirePlatformAdmin } from '../common/tenant';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('clinics')
export class ClinicsController {
    constructor(private clinicsService: ClinicsService) { }

    @Get()
    findAll(@Request() req) {
        requirePlatformAdmin(req.user);
        return this.clinicsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        requireClinic(req.user, id);
        return this.clinicsService.findOne(id);
    }

    @Post()
    create(@Body() data: unknown, @Request() req) {
        requirePlatformAdmin(req.user);
        return this.clinicsService.create(data);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() data: unknown, @Request() req) {
        requirePlatformAdmin(req.user);
        return this.clinicsService.update(id, data);
    }
}

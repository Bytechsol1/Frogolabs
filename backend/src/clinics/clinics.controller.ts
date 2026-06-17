import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('clinics')
export class ClinicsController {
    constructor(private clinicsService: ClinicsService) { }

    @Get()
    findAll() {
        return this.clinicsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.clinicsService.findOne(id);
    }

    @Post()
    create(@Body() data: any) {
        return this.clinicsService.create(data);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.clinicsService.update(id, data);
    }
}

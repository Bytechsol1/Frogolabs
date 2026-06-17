import { Controller, Get, Post, Put, Body, UseGuards, Request, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
    constructor(private patientsService: PatientsService) { }

    @Get()
    async findAll(@Request() req) {
        return this.patientsService.findAll(req.user.clinic_id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req) {
        return this.patientsService.findOne(id, req.user.clinic_id);
    }

    @Post()
    async create(@Body() data: any, @Request() req) {
        if (!req.user.clinic_id) {
            throw new ForbiddenException('Only clinic users can add patients');
        }
        return this.patientsService.create(req.user.clinic_id, req.user.id, data);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() data: any, @Request() req) {
        return this.patientsService.update(id, req.user.clinic_id, data);
    }
}

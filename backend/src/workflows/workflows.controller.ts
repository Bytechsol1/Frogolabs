import { clinicScope } from '../common/tenant';
import { Controller, Get, Post, Patch, Body, UseGuards, Request, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';

@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
    constructor(private workflowsService: WorkflowsService) { }

    @Get()
    async findAll(@Request() req) {
        return this.workflowsService.findAll(clinicScope(req.user));
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req) {
        return this.workflowsService.findOne(id, clinicScope(req.user));
    }

    @Post()
    async create(@Body() data: any, @Request() req) {
        return this.workflowsService.create(clinicScope(req.user)!, { ...data, updated_by: req.user.id });
    }

    @Patch(':id/status')
    async updateStatus(@Param('id') id: string, @Body() data: any, @Request() req) {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'CLINIC_USER') {
            throw new ForbiddenException('You cannot update session status.');
        }
        if (req.user.role === 'CLINIC_USER' && !clinicScope(req.user)) {
            throw new ForbiddenException('A clinic membership is required to update session status.');
        }
        return this.workflowsService.updateStatus(id, clinicScope(req.user), { ...data, updated_by: req.user.id });
    }
}

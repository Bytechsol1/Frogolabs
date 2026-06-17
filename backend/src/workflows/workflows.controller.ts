import { Controller, Get, Post, Patch, Body, UseGuards, Request, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';

@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
    constructor(private workflowsService: WorkflowsService) { }

    @Get()
    async findAll(@Request() req) {
        return this.workflowsService.findAll(req.user.clinic_id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req) {
        return this.workflowsService.findOne(id, req.user.clinic_id);
    }

    @Post()
    async create(@Body() data: any, @Request() req) {
        return this.workflowsService.create(req.user.clinic_id, { ...data, updated_by: req.user.id });
    }

    @Patch(':id/status')
    async updateStatus(@Param('id') id: string, @Body() data: any, @Request() req) {
        if (req.user.role !== 'ADMIN') {
            throw new ForbiddenException('Only Frigo Labs admins can update workflow status.');
        }
        return this.workflowsService.updateStatus(id, req.user.clinic_id, { ...data, updated_by: req.user.id });
    }
}

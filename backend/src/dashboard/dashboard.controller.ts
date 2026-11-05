import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    @Get('admin/stats')
    @Roles('ADMIN')
    async getAdminStats(@Query('summary') summary?: string) {
        return this.dashboardService.getAdminStats(summary === 'true');
    }

    @Get('clinic/stats')
    @Roles('CLINIC_USER')
    async getClinicStats(@Request() req, @Query('summary') summary?: string) {
        return this.dashboardService.getClinicStats(req.user.clinic_id, summary === 'true');
    }
}

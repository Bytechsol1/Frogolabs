import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LabReportNotificationsService } from './lab-report-notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private reports: LabReportNotificationsService) {}

    @Get('lab-reports')
    @Header('Cache-Control', 'private, no-store')
    list(@Req() req) { return this.reports.list(req.user); }
}

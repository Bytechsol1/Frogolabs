import { Controller, Get, Patch, Param, Body, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Patch(':id/clinic-admin')
    async clinicAdmin(@Param('id') id: string, @Body() body: { is_clinic_admin?: unknown }, @Request() req) {
        if (req.user.role !== 'ADMIN') throw new ForbiddenException('Only platform admins can assign clinic administrators.');
        if (typeof body?.is_clinic_admin !== 'boolean' || Object.keys(body).length !== 1) throw new BadRequestException('Specify a clinic administrator permission.');
        return this.usersService.setClinicAdmin(id, body.is_clinic_admin);
    }

    @Get()
    async findAll(@Request() req) {
        if (req.user.role !== 'ADMIN') {
            throw new ForbiddenException('Only admins can list users.');
        }
        return this.usersService.findAll();
    }
}

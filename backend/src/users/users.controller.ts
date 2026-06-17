import { Controller, Get, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get()
    async findAll(@Request() req) {
        if (req.user.role !== 'ADMIN') {
            throw new ForbiddenException('Only admins can list users.');
        }
        return this.usersService.findAll();
    }
}

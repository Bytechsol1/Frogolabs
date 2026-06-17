import { Controller, Post, Get, Patch, UseGuards, Request, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @HttpCode(HttpStatus.OK)
    @UseGuards(LocalAuthGuard)
    @Post('login')
    async login(@Request() req) {
        return this.authService.login(req.user);
    }

    @Post('register')
    async register(@Body() body: {
        clinicName: string;
        contactName: string;
        email: string;
        phone: string;
        password: string;
    }) {
        return this.authService.initiateRegistration(body);
    }

    @Post('register/verify')
    async verifyOtp(@Body() body: { email: string; otp: string }) {
        return this.authService.verifyOtp(body.email, body.otp);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me')
    updateProfile(@Body() body: { name?: string; email?: string }, @Request() req) {
        return this.authService.updateProfile(req.user.id, body);
    }
}

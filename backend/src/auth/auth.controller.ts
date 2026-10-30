import { Controller, Post, Get, Patch, UseGuards, Request, Body, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthDtoPipe, registrationSchema, emailOtpSchema, verifyOtpSchema, profileSchema } from './auth.dto';
import type { RegisterDto, EmailOtpDto, VerifyOtpDto } from './auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @HttpCode(HttpStatus.OK)
    @UseGuards(AuthRateLimitGuard, LocalAuthGuard)
    @Post('login')
    async login(@Request() req) {
        if (req.body?.clinic_id && req.body.clinic_id !== req.user.clinic_id) throw new ForbiddenException('Please use the sign-in link for your assigned clinic.');
        return this.authService.login(req.user);
    }

    @Post('register')
    @UseGuards(AuthRateLimitGuard)
    async register(@Body(new AuthDtoPipe(registrationSchema)) body: RegisterDto) {
        return this.authService.initiateRegistration(body);
    }

    @Post('register/verify')
    @UseGuards(AuthRateLimitGuard)
    async verifyOtp(@Body(new AuthDtoPipe(verifyOtpSchema)) body: VerifyOtpDto) {
        return this.authService.verifyOtp(body.email, body.otp);
    }

    @Post('register/resend')
    @UseGuards(AuthRateLimitGuard)
    async resendOtp(@Body(new AuthDtoPipe(emailOtpSchema)) body: EmailOtpDto) {
        return this.authService.resendOtp(body.email);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
    @Patch('me')
    updateProfile(@Body(new AuthDtoPipe(profileSchema)) body: { name?: string; email?: string }, @Request() req) {
        return this.authService.updateProfile(req.user.id, body);
    }
}

import { readJwtSecret } from './jwt.config';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { EmailOtpService } from './email-otp.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Module({
  imports: [
    UsersModule,
    ClinicsModule,
    MailModule,
    PassportModule,
    JwtModule.register({
      secret: readJwtSecret(),
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [AuthService, EmailOtpService, AuthRateLimitGuard, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule { }

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
    handleRequest(err: any, user: any) {
        if (err) throw err; // re-throw our custom UnauthorizedException with real message
        if (!user) throw new UnauthorizedException('Invalid email or password');
        return user;
    }
}

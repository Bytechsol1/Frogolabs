import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { requireLoginEmail } from '../../common/email-validation';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown> }>();
        const email = requireLoginEmail(request.body?.email);
        request.body = { ...request.body, email };
        return super.canActivate(context);
    }
    handleRequest(err: any, user: any) {
        if (err) throw err; // re-throw our custom UnauthorizedException with real message
        if (!user) throw new UnauthorizedException('Invalid email or password');
        return user;
    }
}

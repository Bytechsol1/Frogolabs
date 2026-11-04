import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';

type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'clinic_id' | 'email_verified' | 'is_clinic_admin'> & {
    clinic: { name: string; status: string | null } | null;
};

// Verification and JWT requests must apply the same account/membership checks.
export function sessionProfile(user: SessionUser | null) {
    if (!user || user.clinic?.status === 'Inactive') throw new UnauthorizedException('This session is no longer available.');
    if (!user.email_verified) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Your email has not been verified.' });
    if (user.role !== 'ADMIN' && (!user.clinic_id || !user.clinic)) throw new ForbiddenException('An active clinic membership is required.');
    return {
        id: user.id, email: user.email, name: user.name, role: user.role,
        clinic_id: user.clinic_id, clinic_name: user.clinic?.name ?? null,
        email_verified: user.email_verified, is_clinic_admin: user.is_clinic_admin,
    };
}

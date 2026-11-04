import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { sessionProfile } from './session-profile';

describe('Authenticated session profiles', () => {
    const user = { id: 'fixture-user', email: 'clinic@example.com', name: 'Fixture', role: 'CLINIC_USER' as const,
        clinic_id: 'fixture-clinic', email_verified: true, is_clinic_admin: true, clinic: { name: 'Fixture Clinic', status: 'Active' } };
    it('returns only safe fields for an authorized verified user', () => {
        const profile = sessionProfile({ ...user, password_hash: 'private-fixture-hash' } as typeof user);
        expect(profile).toEqual({ id: user.id, email: user.email, name: user.name, role: user.role, clinic_id: user.clinic_id,
            email_verified: true, is_clinic_admin: true, clinic_name: 'Fixture Clinic' });
        expect(profile).not.toHaveProperty('password_hash');
        expect(profile).not.toHaveProperty('clinic');
    });
    it('restricts missing or disabled accounts', () => {
        expect(() => sessionProfile(null)).toThrow(UnauthorizedException);
        expect(() => sessionProfile({ ...user, clinic: { ...user.clinic, status: 'Inactive' } })).toThrow(UnauthorizedException);
    });
    it('restricts unverified accounts', () => {
        expect(() => sessionProfile({ ...user, email_verified: false })).toThrow(ForbiddenException);
    });
    it('requires a clinic membership for clinic users', () => {
        expect(() => sessionProfile({ ...user, clinic_id: null })).toThrow(ForbiddenException);
        expect(() => sessionProfile({ ...user, clinic: null })).toThrow(ForbiddenException);
    });
    it('preserves administrator access without a clinic', () => {
        expect(sessionProfile({ ...user, role: 'ADMIN', clinic_id: null, clinic: null })).toMatchObject({ role: 'ADMIN', clinic_name: null });
    });
});

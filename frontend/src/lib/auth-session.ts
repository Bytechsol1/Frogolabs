export interface SessionProfile {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CLINIC_USER';
    clinic_id: string | null;
    clinic_name: string | null;
    is_clinic_admin: boolean;
    email_verified: boolean;
}

// Accept only the safe profile returned with a successful authentication response.
// Protected API requests still validate the JWT and current database permissions.
export function readVerifiedSessionProfile(value: unknown): SessionProfile | null {
    if (!value || typeof value !== 'object') return null;
    const profile = value as Record<string, unknown>;
    if (typeof profile.id !== 'string' || !profile.id || typeof profile.email !== 'string' || !profile.email
        || typeof profile.name !== 'string' || (profile.role !== 'ADMIN' && profile.role !== 'CLINIC_USER')
        || profile.email_verified !== true || typeof profile.is_clinic_admin !== 'boolean'
        || (profile.clinic_id !== null && typeof profile.clinic_id !== 'string')
        || (profile.clinic_name !== null && typeof profile.clinic_name !== 'string')
        || (profile.role === 'CLINIC_USER' && !profile.clinic_id)) return null;
    return {
        id: profile.id, email: profile.email, name: profile.name, role: profile.role as SessionProfile['role'],
        clinic_id: profile.clinic_id as string | null, clinic_name: profile.clinic_name as string | null,
        email_verified: true, is_clinic_admin: profile.is_clinic_admin,
    };
}

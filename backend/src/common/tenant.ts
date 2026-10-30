import { ForbiddenException } from '@nestjs/common';

export interface TenantUser {
  id: string;
  role: string;
  clinic_id: string | null;
  is_clinic_admin?: boolean;
}

// Only an explicitly authenticated platform administrator has an unscoped view.
export function clinicScope(user: TenantUser): string | null {
  if (user?.role === 'ADMIN') return null;
  if (user?.role !== 'CLINIC_USER' || !user.clinic_id) {
    throw new ForbiddenException('An active clinic membership is required.');
  }
  return user.clinic_id;
}

export function requirePlatformAdmin(user: TenantUser): void {
  if (user?.role !== 'ADMIN')
    throw new ForbiddenException('Platform administrator access required.');
}

export function requireClinic(
  user: TenantUser,
  id: string,
  manage = false,
): void {
  const scope = clinicScope(user);
  if (scope !== null && (scope !== id || (manage && !user.is_clinic_admin))) {
    throw new ForbiddenException('You cannot manage or access this clinic.');
  }
}

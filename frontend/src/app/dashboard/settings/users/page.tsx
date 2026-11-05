import { redirect } from 'next/navigation';

// The separate branding-permission screen has been retired.
export default function LegacyBrandingPermissionsPage() {
    redirect('/dashboard/settings?tab=branding');
}

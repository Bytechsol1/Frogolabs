import { redirect } from 'next/navigation';

// Keep saved links working while branding lives inside Settings.
export default async function BrandingRedirect({ searchParams }: {
    searchParams: Promise<{ clinic?: string | string[] }>;
}) {
    const { clinic } = await searchParams;
    const query = new URLSearchParams({ tab: 'branding' });
    if (typeof clinic === 'string') query.set('clinic', clinic);
    redirect(`/dashboard/settings?${query}`);
}

import { DashboardSettings } from '@/components/DashboardSettings';

export default async function SettingsPage({ searchParams }: {
    searchParams: Promise<{ tab?: string | string[] }>;
}) {
    const { tab } = await searchParams;
    const initialTab = typeof tab === 'string' ? tab : undefined;
    return <DashboardSettings key={initialTab ?? 'default'} initialTab={initialTab} />;
}

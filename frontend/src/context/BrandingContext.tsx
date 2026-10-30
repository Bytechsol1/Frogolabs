'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import type { ClinicBranding } from '@/lib/branding';

const BrandingContext = createContext<{ branding: ClinicBranding | null; refresh: () => Promise<void> }>({ branding: null, refresh: async () => {} });

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const clinic = user?.role === 'CLINIC_USER' ? user.clinic_id as string : null;
    const token = user?.token as string | undefined;
    const [saved, setSaved] = useState<{ clinic: string; brand: ClinicBranding } | null>(null);
    const refresh = useCallback(async () => {
        if (!clinic || !token) return;
        const response = await fetch(`/api/v1/branding/${encodeURIComponent(clinic)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) throw new Error('Clinic branding could not be loaded.');
        setSaved({ clinic, brand: await response.json() });
    }, [clinic, token]);
    useEffect(() => {
        if (!clinic || !token) return;
        const controller = new AbortController();
        fetch(`/api/v1/branding/${encodeURIComponent(clinic)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
            .then(async response => { if (response.ok) setSaved({ clinic, brand: await response.json() }); })
            .catch(() => {});
        return () => controller.abort();
    }, [clinic, token]);
    const branding = clinic ? saved?.clinic === clinic ? saved.brand : {
        id: clinic, name: user?.clinic_name || 'Your clinic', primary_color: '#0F766E', secondary_color: '#14B8A6', information: '', services: [], logo_url: null,
    } : null;
    return <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);

// Public context is explicit in the URL; it never grants membership or report access.
export function usePublicBranding() {
    const [branding, setBranding] = useState<ClinicBranding | null>(null);
    const [clinicId, setClinicId] = useState<string | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get('clinic');
        if (!id) return;
        const controller = new AbortController();
        const run = async () => {
            setClinicId(id);
            try {
                const response = await fetch(`/api/v1/branding/public/${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('This clinic portal is not available. Please check your clinic link.');
                setBranding(await response.json());
            } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Clinic branding could not be loaded.'); }
        };
        void run();
        return () => controller.abort();
    }, []);
    return { branding, clinicId, error };
}

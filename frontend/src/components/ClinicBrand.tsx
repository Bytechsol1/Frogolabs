'use client';

import { brandStyle, type ClinicBranding } from '@/lib/branding';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export function useBrandTitle(branding: ClinicBranding | null) {
    const name = branding?.name;
    useEffect(() => {
        if (!name) return;
        const previous = document.title;
        const title = `${name} | Clinic portal`;
        const apply = () => { if (document.title !== title) document.title = title; };
        apply();
        // App Router metadata may stream after the clinic is loaded on the client.
        const observer = new MutationObserver(apply);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        return () => { observer.disconnect(); document.title = previous; };
    }, [name]);
}

export function BrandSurface({ branding, children, className = '' }: { branding: ClinicBranding | null; children: React.ReactNode; className?: string }) {
    return <div style={brandStyle(branding)} className={`${branding ? 'clinic-theme' : ''} ${className}`}>{children}</div>;
}

function NavbarClinicLogo({ src }: { src: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return <span className="inline-flex shrink-0 items-center gap-2 sm:gap-3">
        <span aria-hidden="true" className="h-8 w-px shrink-0 bg-slate-300 sm:h-10" />
        <span className="relative block h-10 w-10 shrink-0 sm:h-12 sm:w-16">
            <Image src={src} alt="Clinic logo" fill unoptimized loading="eager" sizes="(min-width: 640px) 64px, 40px" className="object-contain" onError={() => setFailed(true)} />
        </span>
    </span>;
}

// Navbar identity is separate from the clinic name used in settings and patient pages.
export function NavbarBrand({ branding }: { branding: ClinicBranding | null }) {
    return <span data-navbar-brand className="inline-flex min-w-0 max-w-full items-center gap-2 sm:gap-3">
        <Image src="/logo.jpg" alt="Frigo Flow" width={2800} height={1020} unoptimized loading="eager" className="h-auto w-24 min-w-0 object-contain sm:w-36" />
        {branding?.logo_url && <NavbarClinicLogo key={`${branding.id}:${branding.logo_url}`} src={branding.logo_url} />}
    </span>;
}

export function BrandMark({ branding, className = '' }: { branding: ClinicBranding | null; className?: string }) {
    if (!branding) return <Image src="/logo.jpg" alt="Frigo Flow" width={192} height={64} unoptimized className={`max-h-16 w-auto max-w-48 object-contain ${className}`} />;
    return <span className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
        {branding.logo_url ? <Image src={branding.logo_url} alt={`${branding.name} logo`} width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain" /> :
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">{branding.name.slice(0, 2).toUpperCase()}</span>}
        <span className="truncate text-base font-bold text-[var(--brand-ink)]">{branding.name}</span>
    </span>;
}

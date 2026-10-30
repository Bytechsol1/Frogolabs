import type { CSSProperties } from 'react';

export interface ClinicBranding {
    id: string;
    name: string;
    primary_color: string;
    secondary_color: string;
    information: string;
    services: string[];
    logo_url: string | null;
}

function luminance(hex: string) {
    const channels = hex.slice(1).match(/.{2}/g)?.map(c => parseInt(c, 16) / 255) || [0, 0, 0];
    const linear = channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrast(a: string, b: string) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function textOn(color: string) {
    if (contrast(color, '#ffffff') >= 4.5) return '#ffffff';
    if (contrast(color, '#111827') >= 4.5) return '#111827';
    return '#000000';
}

export function brandStyle(brand: ClinicBranding | null): CSSProperties {
    if (!brand) return {};
    const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : '#0F766E';
    const secondary = /^#[\da-f]{6}$/i.test(brand.secondary_color) ? brand.secondary_color : '#14B8A6';
    return {
        '--brand-primary': primary,
        '--brand-secondary': secondary,
        '--brand-on-primary': textOn(primary),
        '--brand-on-secondary': textOn(secondary),
        '--brand-ink': contrast(primary, '#ffffff') >= 4.5 ? primary : '#17302a',
        '--brand-accent-ink': contrast(secondary, '#ffffff') >= 4.5 ? secondary : '#245047',
    } as CSSProperties;
}

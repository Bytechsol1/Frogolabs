'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { BrandMark, BrandSurface } from '@/components/ClinicBrand';
import { contrast, textOn, type ClinicBranding } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ClinicOption = { id: string; name: string };

export default function BrandingSettings() {
    const { user, logout } = useAuth();
    const { refresh } = useBranding();
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [clinicId, setClinicId] = useState('');
    const [brand, setBrand] = useState<ClinicBranding | null>(null);
    const [services, setServices] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [removeLogo, setRemoveLogo] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const isAdmin = user?.role === 'ADMIN';
    const canManage = isAdmin || (user?.role === 'CLINIC_USER' && user?.is_clinic_admin === true && clinicId === user?.clinic_id);
    const token = user?.token as string | undefined;

    const openPortal = (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        logout(event.currentTarget.href);
    };

    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();
        const load = async () => {
            if (!isAdmin) { setClinicId(user?.clinic_id || ''); return; }
            try {
                const response = await fetch('/api/v1/clinics', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
                if (!response.ok) throw new Error('Clinics could not be loaded.');
                const rows: ClinicOption[] = await response.json();
                setClinics(rows);
                const selected = new URLSearchParams(window.location.search).get('clinic');
                setClinicId(rows.find(row => row.id === selected)?.id || rows[0]?.id || '');
            } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load clinics.'); }
        };
        void load();
        return () => controller.abort();
    }, [isAdmin, token, user?.clinic_id]);

    useEffect(() => {
        if (!clinicId || !token) return;
        const controller = new AbortController();
        const load = async () => {
            setBrand(null); setFile(null); setPreview(null); setRemoveLogo(false); setMessage(''); setError('');
            try {
                const response = await fetch(`/api/v1/branding/${encodeURIComponent(clinicId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('Clinic branding could not be loaded.');
                const saved: ClinicBranding = await response.json();
                setBrand(saved); setServices(saved.services.join('\n'));
            } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load branding.'); }
        };
        void load();
        return () => controller.abort();
    }, [clinicId, token]);

    useEffect(() => {
        return () => { if (preview) URL.revokeObjectURL(preview); };
    }, [preview]);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!brand || !canManage || saving) return;
        setSaving(true); setError(''); setMessage('');
        let settingsSaved = false;
        try {
            const options = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
            const response = await fetch(`/api/v1/branding/${encodeURIComponent(clinicId)}`, { ...options, method: 'PUT', body: JSON.stringify({
                name: brand.name, primary_color: brand.primary_color, secondary_color: brand.secondary_color,
                information: brand.information, services: services.split('\n').map(value => value.trim()).filter(Boolean),
            }) });
            if (!response.ok) throw new Error((await response.json()).message || 'Branding could not be saved.');
            let saved: ClinicBranding = await response.json();
            settingsSaved = true;
            if (file || removeLogo) {
                const body = new FormData();
                if (file) body.append('file', file);
                const logoResponse = await fetch(`/api/v1/branding/${encodeURIComponent(clinicId)}/logo`, {
                    method: file ? 'POST' : 'DELETE', headers: { Authorization: `Bearer ${token}` }, ...(file ? { body } : {}),
                });
                if (!logoResponse.ok) throw new Error((await logoResponse.json()).message || 'The logo could not be saved.');
                saved = await logoResponse.json();
            }
            setBrand(saved); setFile(null); setPreview(null); setRemoveLogo(false);
            if (fileInput.current) fileInput.current.value = '';
            await refresh();
            setMessage('Clinic branding saved.');
        } catch (err) {
            setError(`${settingsSaved ? 'The text and colors were saved. ' : ''}${err instanceof Error ? err.message : 'Unable to save branding.'}`);
        } finally { setSaving(false); }
    };

    const previewBrand = brand ? { ...brand, services: services.split('\n').filter(Boolean), logo_url: removeLogo ? null : preview || brand.logo_url } : null;
    return <div className="space-y-6 pb-8">
        <div><h1 className="text-3xl font-bold">Clinic branding</h1><p className="mt-2 text-sm text-slate-600">Customize the experience your staff and patients see.</p></div>
        {isAdmin && <div className="flex flex-wrap items-center gap-3"><Label htmlFor="branding-clinic">Clinic</Label><select id="branding-clinic" disabled={saving} value={clinicId} onChange={event => setClinicId(event.target.value)} className="rounded-xl border bg-white p-3 text-sm"><option value="" disabled>Select a clinic</option>{clinics.map(clinic => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select><Link href="/dashboard/settings/users" className="text-sm underline">Manage clinic administrators</Link></div>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>}
        {brand && <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <form onSubmit={save} className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
                {!canManage && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Branding access has not been granted to your account. Ask a Frigo administrator to open Settings → Branding permissions and enable “Branding administrator” for your user. You can view your clinic settings here.</p>}
                <fieldset disabled={!canManage || saving} className="min-w-0 space-y-5 disabled:opacity-70">
                    <div className="space-y-2"><Label htmlFor="brand-name">Clinic name</Label><Input id="brand-name" required maxLength={120} value={brand.name} onChange={event => setBrand({ ...brand, name: event.target.value })} /></div>
                    <div className="space-y-2"><Label htmlFor="brand-logo">Clinic logo</Label><Input id="brand-logo" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                        const next = event.target.files?.[0];
                        if (!next) return;
                        if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a PNG, JPEG or WebP image up to 2 MB.'); event.target.value = ''; return; }
                        setError(''); setFile(next); setPreview(URL.createObjectURL(next)); setRemoveLogo(false);
                    }} /><p className="text-xs text-slate-500">PNG, JPEG or WebP. Maximum 2 MB.</p><Button type="button" variant="outline" onClick={() => { setFile(null); setPreview(null); setRemoveLogo(true); if (fileInput.current) fileInput.current.value = ''; }}>Remove logo</Button></div>
                    {(['primary_color', 'secondary_color'] as const).map((field, index) => <div key={field} className="space-y-2"><Label htmlFor={field}>{index ? 'Secondary color' : 'Primary color'}</Label><div className="flex gap-3"><input aria-label={`${index ? 'Secondary' : 'Primary'} color picker`} type="color" value={/^#[\da-f]{6}$/i.test(brand[field]) ? brand[field] : '#0f766e'} onChange={event => setBrand({ ...brand, [field]: event.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border" /><Input id={field} pattern="#[a-fA-F0-9]{6}" required maxLength={7} value={brand[field]} onChange={event => setBrand({ ...brand, [field]: event.target.value })} /></div>{/^#[\da-f]{6}$/i.test(brand[field]) && contrast(brand[field], '#ffffff') < 4.5 && <p className="text-xs text-amber-800">White text has low contrast with this color. The theme uses {textOn(brand[field]) === '#ffffff' ? 'white' : 'dark'} text and a darker heading color for readability.</p>}</div>)}
                    <div className="space-y-2"><Label htmlFor="brand-info">Clinic information</Label><p className="text-xs text-slate-500">This information and the services below are public on your clinic portal.</p><textarea id="brand-info" maxLength={3000} rows={4} value={brand.information} onChange={event => setBrand({ ...brand, information: event.target.value })} className="w-full rounded-xl border p-3 text-sm" /></div>
                    <div className="space-y-2"><Label htmlFor="brand-services">Services, one per line</Label><textarea id="brand-services" rows={5} value={services} onChange={event => setServices(event.target.value)} className="w-full rounded-xl border p-3 text-sm" /><p className="text-xs text-slate-500">Up to 30 services. These descriptions do not create or change lab test products.</p></div>
                    <Button type="submit" className="w-full">{saving ? 'Saving…' : 'Save branding'}</Button>
                </fieldset>
            </form>
            <div className="min-w-0 space-y-4 break-words"><h2 className="font-semibold">Live preview</h2><BrandSurface branding={previewBrand} className="overflow-hidden rounded-2xl border p-4 sm:p-6">
                <BrandMark branding={previewBrand} className="max-w-full" /><div className="my-6 rounded-xl bg-primary p-4 font-semibold text-primary-foreground">Your clinic portal</div>
                <div className="rounded-xl border bg-white p-5"><h3 className="mb-3 text-xl font-bold">Welcome to {brand.name}</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{brand.information || 'Your clinic information will appear here.'}</p><ul className="mt-4 list-inside list-disc space-y-1 text-sm">{previewBrand?.services.map((service, i) => <li key={i}>{service}</li>)}</ul><Button className="mt-5">View my results</Button></div>
            </BrandSurface><div className="rounded-xl border bg-white p-4 text-sm"><p className="mb-2 font-semibold">Clinic portal links</p><Link prefetch={false} onClick={openPortal} className="block break-all underline" href={`/patient/results?clinic=${encodeURIComponent(clinicId)}`}>Patient results portal</Link></div></div>
        </div>}
        {!brand && !error && <p role="status" className="text-sm text-slate-500">{clinicId ? 'Loading clinic settings…' : 'Choose a clinic to customize.'}</p>}
    </div>;
}

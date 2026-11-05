'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Palette, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { contrast, textOn, type ClinicBranding } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ClinicOption = { id: string; name: string };

export function ClinicBrandingSettings() {
    const { user } = useAuth();
    const { refresh } = useBranding();
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [clinicId, setClinicId] = useState('');
    const [brand, setBrand] = useState<ClinicBranding | null>(null);
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
                setBrand(saved);
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
                information: brand.information, services: brand.services,
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

    const previewLogo = removeLogo ? null : preview || brand?.logo_url;
    return <div className="space-y-6 pb-8">
        <div><h1 className="text-3xl font-bold">Clinic branding</h1><p className="mt-2 text-sm text-slate-600">Customize the experience your staff and patients see.</p></div>
        {isAdmin && <div className="flex flex-wrap items-center gap-3"><Label htmlFor="branding-clinic">Clinic</Label><select id="branding-clinic" disabled={saving} value={clinicId} onChange={event => setClinicId(event.target.value)} className="rounded-xl border bg-white p-3 text-sm"><option value="" disabled>Select a clinic</option>{clinics.map(clinic => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select><Link href="/dashboard/settings/users" className="text-sm underline">Manage clinic administrators</Link></div>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>}
        {brand && <div className="max-w-3xl min-w-0 space-y-6">
            <form onSubmit={save} className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
                <h2 className="flex items-center gap-3 border-b pb-4 text-lg font-bold"><Palette className="h-7 w-7 text-primary" />Brand identity</h2>
                {!canManage && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Branding access has not been granted to your account. Ask a Frigo administrator to open Settings → Branding permissions and enable “Branding administrator” for your user. You can view your clinic settings here.</p>}
                <fieldset disabled={!canManage || saving} className="min-w-0 space-y-5 disabled:opacity-70">
                    <div className="space-y-2"><Label htmlFor="brand-name">Clinic name</Label><Input id="brand-name" required maxLength={120} value={brand.name} onChange={event => setBrand({ ...brand, name: event.target.value })} /></div>
                    <div className="space-y-3"><Label htmlFor="brand-logo">Clinic logo</Label><div className="relative rounded-xl border border-dashed border-primary/50 bg-primary/5 text-center focus-within:ring-2 focus-within:ring-primary">
                        <Input id="brand-logo" ref={fileInput} type="file" className="peer sr-only" accept="image/png,image/jpeg,image/webp" onChange={event => {
                        const next = event.target.files?.[0];
                        if (!next) return;
                        if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a PNG, JPEG or WebP image up to 2 MB.'); event.target.value = ''; return; }
                        setError(''); setFile(next); setPreview(URL.createObjectURL(next)); setRemoveLogo(false);
                    }} /><label htmlFor="brand-logo" className="flex cursor-pointer flex-col items-center gap-2 p-5 peer-disabled:cursor-not-allowed">
                        {previewLogo ? <Image src={previewLogo} alt="Selected clinic logo" width={120} height={56} unoptimized className="h-14 w-30 object-contain" /> : <Upload aria-hidden="true" className="h-8 w-8 text-primary" />}
                        <span className="font-semibold text-primary">{previewLogo ? 'Replace clinic logo' : 'Upload clinic logo'}</span>
                        <span className="text-xs text-slate-500">PNG, JPEG or WebP. Maximum 2 MB.</span>
                    </label></div><Button type="button" variant="outline" disabled={!previewLogo} onClick={() => { setFile(null); setPreview(null); setRemoveLogo(true); if (fileInput.current) fileInput.current.value = ''; }}>Remove logo</Button></div>
                    <div className="space-y-4 border-t pt-5"><h2 className="font-bold">Brand colors</h2><div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        {(['primary_color', 'secondary_color'] as const).map((field, index) => <div key={field} className="min-w-0 space-y-2"><Label htmlFor={field}>{index ? 'Secondary color' : 'Primary color'}</Label><div className="flex min-w-0 gap-3"><input aria-label={`${index ? 'Secondary' : 'Primary'} color picker`} type="color" value={/^#[\da-f]{6}$/i.test(brand[field]) ? brand[field] : '#0f766e'} onChange={event => setBrand({ ...brand, [field]: event.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border" /><Input id={field} className="min-w-0" pattern="#[a-fA-F0-9]{6}" required maxLength={7} value={brand[field]} onChange={event => setBrand({ ...brand, [field]: event.target.value })} /></div>{/^#[\da-f]{6}$/i.test(brand[field]) && contrast(brand[field], '#ffffff') < 4.5 && <p className="text-xs text-amber-800">White text has low contrast. The theme uses {textOn(brand[field]) === '#ffffff' ? 'white' : 'dark'} text for readability.</p>}</div>)}
                    </div><p className="text-xs text-amber-800">Choose colors with enough contrast for readability.</p></div>
                    <div className="flex justify-end border-t pt-5"><Button type="submit" className="w-full sm:w-auto sm:min-w-44">{saving ? 'Saving…' : 'Save branding'}</Button></div>
                </fieldset>
            </form>
        </div>}
        {!brand && !error && <p role="status" className="text-sm text-slate-500">{clinicId ? 'Loading clinic settings…' : 'Choose a clinic to customize.'}</p>}
    </div>;
}

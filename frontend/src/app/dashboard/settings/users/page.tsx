'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

interface StaffUser { id: string; name: string; email: string; role: string; clinic_id: string | null; is_clinic_admin: boolean; clinic: { name: string } | null }

export default function UserManagementPage() {
    const { user, isLoading } = useAuth();
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const isAdmin = user?.role === 'ADMIN';
    const token = user?.token;
    useEffect(() => {
        if (!isAdmin || !token) return;
        const controller = new AbortController();
        fetch('/api/v1/users', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
            .then(async response => { if (!response.ok) throw new Error('Users could not be loaded.'); setUsers(await response.json()); })
            .catch(err => { if (!controller.signal.aborted) setError(err.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [isAdmin, token]);
    const update = async (staff: StaffUser) => {
        setBusy(staff.id); setError(''); setMessage('');
        try {
            const response = await fetch(`/api/v1/users/${encodeURIComponent(staff.id)}/clinic-admin`, {
                method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ is_clinic_admin: !staff.is_clinic_admin }),
            });
            if (!response.ok) throw new Error((await response.json()).message || 'Permission could not be saved.');
            const saved = await response.json();
            setUsers(current => current.map(row => row.id === staff.id ? { ...row, is_clinic_admin: saved.is_clinic_admin } : row));
            setMessage(saved.is_clinic_admin ? `Branding access granted to ${staff.name}. They can open Settings → Clinic branding after signing in or returning to their dashboard tab.` : `Branding access removed from ${staff.name}.`);
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save permission.'); }
        finally { setBusy(null); }
    };
    if (isLoading) return <p role="status">Loading account permissions…</p>;
    if (!isAdmin) return <p role="alert">Platform administrator access is required.</p>;
    return <div className="space-y-5"><h1 className="text-2xl font-bold">Clinic administrators</h1><p className="text-sm text-slate-600">Grant branding management only to staff who already belong to the intended clinic.</p><Link href="/dashboard/settings?tab=branding" className="text-sm underline">Manage clinic branding</Link>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">{message}</p>}
        {loading && <p role="status">Loading clinic staff…</p>}
        <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Staff</th><th className="p-4">Clinic</th><th className="p-4">Branding administrator</th></tr></thead><tbody>{users.map(staff => <tr key={staff.id} className="border-t"><td className="p-4">{staff.name}<br /><span className="text-xs text-slate-500">{staff.email}</span></td><td className="p-4">{staff.clinic?.name || 'Platform administration'}</td><td className="p-4">{staff.role === 'CLINIC_USER' && staff.clinic_id ? <label className="inline-flex items-center gap-3"><input type="checkbox" aria-label={`Branding administrator for ${staff.name}`} checked={staff.is_clinic_admin} disabled={busy !== null} onChange={() => void update(staff)} />{busy === staff.id ? 'Saving…' : staff.is_clinic_admin ? 'Allowed' : 'Not allowed'}</label> : 'Platform administrator'}</td></tr>)}</tbody></table></div>
    </div>;
}

'use client';

import { EmailInput } from '@/components/ui/email-input';
import { normalizeEmail } from '@/lib/email-validation';
import { profileFieldErrors } from '@frigo-flow/validation';
import { useFormValidation } from '@/lib/use-form-validation';
import { FieldError } from '@/components/ui/field-error';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Shield, Pencil, Check, X, Loader2, Bell, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { prepareEmailVerification } from '@/lib/email-verification';
import { useReportBadgePreference } from '@/lib/use-report-badge-preference';

export default function ProfilePage() {
    const { user, login, logout } = useAuth();
    const [showReportBadge, setShowReportBadge] = useReportBadgePreference(user?.id);
    const [preferenceFeedback, setPreferenceFeedback] = useState<{ message: string; error: boolean } | null>(null);
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const validation = useFormValidation({ name, email }, profileFieldErrors, 'profile-');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSave = async () => {
        if (saving) return;
        setError('');
        if (!validation.check()) return;
        setSaving(true);
        try {
            const res = await axios.patch(
                '/api/v1/auth/me',
                { name: name.trim(), email: normalizeEmail(email) },
                { headers: { Authorization: `Bearer ${user?.token}` } }
            );
            if (res.data.requires_verification) {
                prepareEmailVerification(res.data.email, true, res.data.resend_after || 60);
                router.push('/verify-email');
                return;
            }
            await login(res.data.access_token);
            setSuccess('Profile updated successfully.');
            setEditing(false);
        } catch (err: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : '';
            setError(message || 'Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setName(user?.name || '');
        setEmail(user?.email || '');
        setError('');
        setEditing(false);
    };

    const roleLabel = user?.role === 'ADMIN' ? 'Frigo Admin' : 'Clinic Staff';
    const initials = (user?.name || 'User').trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();
    const startEditing = () => {
        validation.reset();
        setName(user?.name || '');
        setEmail(user?.email || '');
        setEditing(true);
        setSuccess('');
        setError('');
    };
    const inputClass = 'h-12 rounded-xl border-[#e4dec3] bg-white px-4 text-sm text-[#080e1e] focus-visible:border-[#8c7657] focus-visible:ring-2 focus-visible:ring-[#cbb28d]/40 focus-visible:ring-inset';

    return (
        <div className="space-y-7 pb-8 text-[#080e1e]">
            <header>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Account Settings</h1>
                <p className="mt-2 text-sm text-slate-600">Manage your personal profile, notification preferences and browser session.</p>
            </header>

            <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
                <aside aria-label="Profile summary" className="flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-[#e4dec3] bg-white shadow-[0_4px_25px_rgba(8,14,30,0.03)]">
                    <div className="relative h-36 shrink-0 overflow-hidden bg-[#080e1e] px-7 pt-7">
                        <svg aria-hidden="true" viewBox="0 0 400 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full fill-none">
                            <path d="M150 180C175 50 350 150 430 -20" stroke="#cbb28d" strokeWidth="28" opacity="0.13" />
                            <path d="M130 180C155 50 330 150 410 -20" stroke="#cbb28d" strokeWidth="1" opacity="0.5" />
                            <path d="M200 185C225 90 360 190 450 30" stroke="#cbb28d" strokeWidth="1" opacity="0.25" />
                        </svg>
                        <div className="relative flex items-center justify-between gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#dfc59e]">My Profile</span>
                            <span className="text-[10px] font-medium tracking-[0.14em] text-white/70">FRIGO <span className="text-[#dfc59e]">FLOW</span></span>
                        </div>
                    </div>
                    <div className="relative -mt-12 mx-auto flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[6px] border-white bg-[#f2ede2] shadow-sm">
                        <span className="flex h-full w-full items-center justify-center rounded-full border border-[#cbb28d]/60 text-3xl font-semibold text-[#8c7657]">{initials}</span>
                    </div>
                    <div className="px-6 pb-7 pt-5 text-center sm:px-7">
                        <h2 className="break-words text-2xl font-bold tracking-tight text-[#080e1e]">{user?.name || 'Your profile'}</h2>
                        <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#f2ede2] px-3 py-1.5 text-xs font-semibold text-[#8c7657]">
                            <Shield className="h-3.5 w-3.5" aria-hidden="true" /> {roleLabel}
                        </span>
                        <div className="mt-7 border-t border-[#e6e0ce] pt-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c7657]">Email Address</p>
                            <p className="mt-2 break-all text-sm leading-relaxed text-slate-600">{user?.email}</p>
                        </div>
                    </div>
                    <div className="mt-auto flex items-center gap-3 border-t border-[#e6e0ce] bg-[#faf9f6] px-6 py-5 sm:px-7">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e4dec3] bg-white text-[#8c7657]">
                            {user?.email_verified ? <Check className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#080e1e]">{user?.email_verified ? 'Email verified' : 'Email not verified'}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{user?.email_verified ? 'Your contact address is confirmed.' : 'Confirm your account email address.'}</p>
                        </div>
                    </div>
                </aside>

                <section aria-labelledby="personal-details" className="min-w-0 overflow-hidden rounded-[28px] border border-[#e4dec3] bg-white shadow-[0_4px_25px_rgba(8,14,30,0.03)]">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6e0ce] p-6 sm:px-8">
                        <div>
                            <h2 id="personal-details" className="text-lg font-bold">Personal Details</h2>
                        </div>
                        {!editing && <Button onClick={startEditing} className="h-10 gap-2 rounded-full bg-[#080e1e] px-5 text-xs font-bold text-white hover:bg-[#080e1e]">
                            <Pencil className="h-3.5 w-3.5 text-[#cbb28d]" /> Edit Profile
                        </Button>}
                    </div>

                    <div className="p-6 sm:p-8">
                        {success && <p role="status" className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />{success}</p>}
                        {editing ? <form noValidate onSubmit={e => { e.preventDefault(); void handleSave(); }} className="space-y-6">
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-2.5">
                                    <Label htmlFor="profile-name" className="text-xs font-semibold text-slate-600">Full Name</Label>
                                    <Input id="profile-name" {...validation.propsFor('name')} autoComplete="name" required maxLength={120} disabled={saving} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" className={inputClass} />
                                    <FieldError id="profile-name" message={validation.errorFor('name')} />
                                </div>
                                <div className="space-y-2.5">
                                    <Label htmlFor="profile-email" className="text-xs font-semibold text-slate-600">Email Address</Label>
                                    <EmailInput error={validation.errorFor('email')} id="profile-email" autoComplete="email"  required disabled={saving} value={email} onChange={e => setEmail(e.target.value)} placeholder="your@gmail.com" className={inputClass} aria-describedby="email-note" />
                                </div>
                            </div>
                            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                            <div className="flex flex-wrap items-center gap-3">
                                <Button type="submit" disabled={saving} className="h-10 gap-2 rounded-full bg-[#080e1e] px-5 text-xs font-bold text-white hover:bg-[#080e1e]">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-[#cbb28d]" />}{saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                <Button type="button" variant="outline" onClick={handleCancel} disabled={saving} className="h-10 gap-2 rounded-full border-[#e4dec3] px-5 text-xs hover:bg-white"><X className="h-4 w-4" /> Cancel</Button>
                            </div>
                        </form> : <dl className="grid gap-5 sm:grid-cols-2">
                            <div className="min-w-0 rounded-2xl border border-[#ebe5d8] bg-[#faf9f6] p-5">
                                <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8c7657]"><User className="h-3.5 w-3.5" aria-hidden="true" /> Full Name</dt>
                                <dd className="mt-3 break-words text-base font-semibold">{user?.name || 'Not provided'}</dd>
                            </div>
                            <div className="min-w-0 rounded-2xl border border-[#ebe5d8] bg-[#faf9f6] p-5">
                                <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8c7657]"><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email Address</dt>
                                <dd className="mt-3 break-all text-sm font-semibold leading-6">{user?.email || 'Not provided'}</dd>
                            </div>
                        </dl>}

                        <div className="mt-8 border-t border-[#e6e0ce] pt-6">
                            <h3 className="text-sm font-bold">Account Access</h3>
                            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                                <div><dt className="text-xs text-slate-500">Assigned role</dt><dd className="mt-2 flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-[#b79b70]" aria-hidden="true" />{roleLabel}</dd></div>
                                <div><dt className="text-xs text-slate-500">Email status</dt><dd className={`mt-2 inline-flex items-center gap-2 text-sm font-semibold ${user?.email_verified ? 'text-emerald-800' : 'text-amber-800'}`}><span className={`h-1.5 w-1.5 rounded-full ${user?.email_verified ? 'bg-emerald-600' : 'bg-amber-600'}`} />{user?.email_verified ? 'Verified' : 'Not verified'}</dd></div>
                            </dl>
                        </div>
                    </div>
                    <div id="email-note" className="flex items-start gap-3 border-t border-[#e6e0ce] bg-[#faf9f6] px-6 py-4 sm:px-8">
                        <p className="text-xs leading-relaxed text-slate-500">Changing your email? We’ll send a verification code to your new address to confirm it.</p>
                    </div>
                </section>
            </div>

            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                <section aria-labelledby="notification-preferences" className="min-w-0 rounded-[28px] border border-[#e4dec3] bg-white p-6 sm:p-8">
                    <h2 id="notification-preferences" className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5" aria-hidden="true" /> Report notifications</h2>
                    <label htmlFor="show-report-badge" className="mt-5 flex cursor-pointer items-start gap-3">
                        <input id="show-report-badge" type="checkbox" checked={showReportBadge} onChange={event => {
                            const saved = setShowReportBadge(event.target.checked);
                            setPreferenceFeedback({ message: saved ? 'Notification preference saved on this browser.' : 'Your browser could not save this preference. Please try again.', error: !saved });
                        }} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                        <span><span className="block text-sm font-semibold">Show unread report badge</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">Show the unread report count on the notification bell. Your reports remain available when the badge is hidden.</span></span>
                    </label>
                    <p className="mt-4 text-xs text-slate-500">Saved separately for your account on this browser.</p>
                    {preferenceFeedback && <p role={preferenceFeedback.error ? 'alert' : 'status'} className={`mt-4 rounded-xl p-3 text-sm ${preferenceFeedback.error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{preferenceFeedback.message}</p>}
                </section>
                <section aria-labelledby="browser-session" className="min-w-0 rounded-[28px] border border-[#e4dec3] bg-white p-6 sm:p-8">
                    <h2 id="browser-session" className="flex items-center gap-2 text-lg font-bold"><Shield className="h-5 w-5" aria-hidden="true" /> Browser session</h2>
                    <p className="mt-5 text-sm font-semibold">Signed in as {user?.name || 'your account'}</p>
                    {user?.clinic_name && <p className="mt-2 text-sm text-slate-600">Clinic: {user.clinic_name}</p>}
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">Sign out of the staff dashboard on this browser when you have finished using it.</p>
                    <Button type="button" variant="outline" className="mt-5 gap-2 rounded-full" onClick={() => logout('/login')}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out this browser</Button>
                </section>
            </div>
        </div>
    );
}

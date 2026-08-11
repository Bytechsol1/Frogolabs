'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Users, Pencil, Shield, User, Lock, Building2,
    Eye, EyeOff, Save, Check, X, Mail, Search, RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const API = '/api/v1';

const getRoleBadge = (role: string) => {
    if (role === 'ADMIN') return 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-bold';
    return 'bg-emerald-950/20 text-emerald-900 border border-emerald-900/30';
};

const getRoleLabel = (role: string) => {
    if (role === 'ADMIN') return 'Frigo Admin';
    return 'Clinic Staff';
};

export default function SettingsPage() {
    const { user, login } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    // User Management
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [userSearch, setUserSearch] = useState('');

    // Profile editing
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [saving, setSaving] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    // Password change
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [savingPw, setSavingPw] = useState(false);

    const authHeader = { Authorization: `Bearer ${user?.token}` };

    useEffect(() => {
        if (!isAdmin) { setLoadingUsers(false); return; }
        axios.get(`${API}/users`, { headers: authHeader })
            .then(res => setAllUsers(res.data))
            .catch(() => { })
            .finally(() => setLoadingUsers(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const filteredUsers = allUsers.filter(u => {
        if (!userSearch) return true;
        const q = userSearch.toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.clinic?.name || '').toLowerCase().includes(q);
    });

    const totalUsers = allUsers.length;
    const adminUsers = allUsers.filter(u => u.role === 'ADMIN').length;
    const clinicStaff = allUsers.filter(u => u.role === 'CLINIC_USER').length;

    const handleSaveProfile = async () => {
        if (!name.trim() || !email.trim()) { setProfileError('Name and email are required.'); return; }
        setSaving(true); setProfileError('');
        try {
            const res = await axios.patch(`${API}/auth/me`, { name: name.trim(), email: email.trim() }, { headers: authHeader });
            await login(res.data.access_token);
            setProfileSuccess('Profile updated successfully.');
            setEditing(false);
        } catch (err: any) {
            setProfileError(err?.response?.data?.message || 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
        if (newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return; }
        setSavingPw(true); setPwError(''); setPwSuccess('');
        try {
            await axios.patch(`${API}/auth/me/password`, { currentPassword: currentPw, newPassword: newPw }, { headers: authHeader });
            setPwSuccess('Password updated successfully.');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
        } catch (err: any) {
            setPwError(err?.response?.data?.message || 'Failed to update password.');
        } finally {
            setSavingPw(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden pb-8">
            {/* Header */}
            <div>
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                    Platform Settings
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                    {isAdmin ? '' : 'Manage physician profile details and security credentials.'}
                </p>
            </div>

            <Tabs defaultValue={isAdmin ? 'users' : 'profile'} className="w-full">
                <TabsList className="bg-white/10 p-1 rounded-full border border-white/20 inline-flex shadow-xs">
                    {isAdmin && (
                        <TabsTrigger value="users" className="gap-2 text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            <Users className="w-3.5 h-3.5" /> User Management
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="profile" className="gap-2 text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                        <User className="w-3.5 h-3.5" /> My Profile
                    </TabsTrigger>
                </TabsList>

                {/* User Management Tab */}
                {isAdmin && (
                    <TabsContent value="users" className="mt-6 space-y-6">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <SummaryCard title="Total Platform Users" value={totalUsers} icon={Users} />
                            <SummaryCard title="Frigo Admins" value={adminUsers} icon={Shield} />
                            <SummaryCard title="Clinic Staff Users" value={clinicStaff} icon={Building2} />
                        </div>

                        <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                            <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                        <Users className="w-4 h-4 text-[#cbb28d]" /> Authorized Portal Users
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search user name or email..."
                                                className="pl-9 h-9 text-xs w-56 bg-white border-[#ded8c4] rounded-full focus:border-[#080e1e]"
                                                value={userSearch}
                                                onChange={e => setUserSearch(e.target.value)}
                                            />
                                        </div>
                                        {userSearch && (
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 rounded-full" onClick={() => setUserSearch('')}>
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                        <TableRow>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Name</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Email Address</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Role</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Assigned Clinic</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Joined Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loadingUsers ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-slate-500 italic text-xs">Loading users…</TableCell>
                                            </TableRow>
                                        ) : filteredUsers.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-slate-500 italic text-xs">No users found matching query.</TableCell>
                                            </TableRow>
                                        ) : filteredUsers.map(u => (
                                            <TableRow key={u.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                                <TableCell className="font-bold text-xs text-[#080e1e]">{u.name}</TableCell>
                                                <TableCell className="text-xs text-slate-600 font-medium flex items-center gap-1.5 pt-3">
                                                    <Mail className="w-3 h-3 text-[#cbb28d]" /> {u.email}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={`${getRoleBadge(u.role)} text-[10px] px-2.5 py-0.5 rounded-full`}>
                                                        {getRoleLabel(u.role)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-700 font-medium">
                                                    {u.clinic ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <Building2 className="w-3.5 h-3.5 text-[#cbb28d]" /> {u.clinic.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500 flex items-center gap-1.5">
                                                            <Shield className="w-3.5 h-3.5 text-[#cbb28d]" /> Frigo HQ (All Clinics)
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-500 font-mono">
                                                    {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Profile Tab */}
                <TabsContent value="profile" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
                        {/* Profile Details */}
                        <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                            <CardHeader className="bg-white/60 border-b border-[#e6e0ce] flex flex-row items-center justify-between py-4">
                                <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                    <User className="w-4 h-4 text-[#cbb28d]" /> Profile Details
                                </CardTitle>
                                {!editing && (
                                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs font-bold text-[#080e1e] hover:bg-[#080e1e] hover:text-white rounded-full"
                                        onClick={() => { setEditing(true); setProfileSuccess(''); setProfileError(''); setName(user?.name || ''); setEmail(user?.email || ''); }}>
                                        <Pencil className="w-3.5 h-3.5 text-[#cbb28d]" /> Edit
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent className="p-6 space-y-5">
                                <div className="flex items-center gap-4 p-4 bg-white border border-[#ded8c4] rounded-2xl">
                                    <div className="w-12 h-12 rounded-full bg-[#080e1e] text-[#cbb28d] flex items-center justify-center text-lg font-extrabold border border-[#cbb28d]/30">
                                        {(user?.name)?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-[#080e1e]">{user?.name}</p>
                                        <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
                                        <Badge className={`${getRoleBadge(user?.role)} text-[10px] px-2.5 py-0.5 rounded-full mt-1`}>
                                            {getRoleLabel(user?.role)}
                                        </Badge>
                                    </div>
                                </div>

                                {editing ? (
                                    <div className="space-y-4">
                                        <FormField label="Full Name">
                                            <Input className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                                        </FormField>
                                        <FormField label="Email Address">
                                            <Input className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                                        </FormField>
                                        {profileError && <p className="text-xs font-bold text-rose-700">{profileError}</p>}
                                        <div className="flex gap-2 pt-1">
                                            <Button onClick={handleSaveProfile} disabled={saving} className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full flex-1 gap-2">
                                                <Check className="w-4 h-4 text-[#cbb28d]" /> {saving ? 'Saving…' : 'Save Changes'}
                                            </Button>
                                            <Button variant="outline" onClick={() => { setEditing(false); setProfileError(''); }} disabled={saving} className="border-[#ded8c4] text-xs font-bold rounded-full gap-2">
                                                <X className="w-4 h-4" /> Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-0 divide-y divide-[#e6e0ce] text-xs">
                                        {profileSuccess && <p className="text-xs text-emerald-700 font-bold pb-2">{profileSuccess}</p>}
                                        <InfoRow label="Full Name" value={user?.name} />
                                        <InfoRow label="Email Address" value={user?.email} />
                                        <InfoRow label="Role Designation" value={getRoleLabel(user?.role)} />
                                        {user?.clinic_id ? null : <InfoRow label="Organization" value="Frigo Flow HQ" />}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Password Management */}
                        <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden self-start">
                            <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                                <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-[#cbb28d]" /> Security & Password
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    <FormField label="Current Password">
                                        <div className="relative">
                                            <Input
                                                type={showCurrent ? 'text' : 'password'}
                                                placeholder="••••••••"
                                                className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl pr-10"
                                                value={currentPw}
                                                onChange={e => setCurrentPw(e.target.value)}
                                                required
                                            />
                                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setShowCurrent(v => !v)}>
                                                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </FormField>
                                    <FormField label="New Password">
                                        <div className="relative">
                                            <Input
                                                type={showNew ? 'text' : 'password'}
                                                placeholder="Min. 6 characters"
                                                className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl pr-10"
                                                value={newPw}
                                                onChange={e => setNewPw(e.target.value)}
                                                required
                                            />
                                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setShowNew(v => !v)}>
                                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </FormField>
                                    <FormField label="Confirm New Password">
                                        <Input type="password" placeholder="Re-enter new password" className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
                                    </FormField>
                                    {pwError && <p className="text-xs text-rose-700 font-bold">{pwError}</p>}
                                    {pwSuccess && <p className="text-xs text-emerald-700 font-bold">{pwSuccess}</p>}
                                    <Button type="submit" className="w-full bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full h-10 gap-2" disabled={savingPw}>
                                        <Save className="w-4 h-4 text-[#cbb28d]" /> {savingPw ? 'Updating…' : 'Update Password'}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon }: any) {
    return (
        <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden p-4 space-y-2 text-left">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                    <div className="p-3 rounded-2xl bg-[#080e1e] text-[#cbb28d] shadow-md">
                        <Icon className="w-5 h-5" />
                    </div>
                    <span className="uppercase text-xs font-bold tracking-wider text-[#080e1e] whitespace-nowrap">{title}</span>
                </div>
            </div>
            <div>
                <p className="text-3xl font-extrabold text-slate-900">{value}</p>
            </div>
        </Card>
    );
}

function FormField({ label, children }: any) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase text-[#8c7657] tracking-wider">{label}</label>
            {children}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex justify-between items-center py-2.5">
            <span className="text-xs text-slate-500 font-medium">{label}</span>
            <span className="text-xs font-bold text-[#080e1e]">{value || '—'}</span>
        </div>
    );
}

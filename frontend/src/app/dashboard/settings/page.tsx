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

const API = 'http://localhost:3000/api/v1';

const getRoleBadge = (role: string) => {
    if (role === 'ADMIN') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
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
            .catch(() => {})
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
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-primary">Settings</h1>
                <p className="text-muted-foreground mt-1 text-sm font-medium">
                    {isAdmin ? 'Manage platform users and your account profile.' : 'Manage your account profile and password.'}
                </p>
            </div>

            <Tabs defaultValue={isAdmin ? 'users' : 'profile'} className="w-full">
                <TabsList className="bg-muted/50 p-1 h-auto">
                    {isAdmin && (
                        <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Users className="w-4 h-4" /> User Management
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <User className="w-4 h-4" /> My Profile
                    </TabsTrigger>
                </TabsList>

                {/* ─── User Management Tab (Admin only) ─── */}
                {isAdmin && (
                    <TabsContent value="users" className="mt-6 space-y-6">
                        {/* Stats */}
                        <div className="grid gap-4 sm:grid-cols-3">
                            <StatCard title="Total Users" value={totalUsers} color="text-primary" />
                            <StatCard title="Frigo Admins" value={adminUsers} color="text-indigo-500" />
                            <StatCard title="Clinic Staff" value={clinicStaff} color="text-emerald-500" />
                        </div>

                        {/* User Table */}
                        <Card className="border-none shadow-sm overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Users className="w-4 h-4 text-primary" /> All Users
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                            <Input
                                                placeholder="Search users…"
                                                className="pl-9 h-8 text-sm w-48"
                                                value={userSearch}
                                                onChange={e => setUserSearch(e.target.value)}
                                            />
                                        </div>
                                        {userSearch && (
                                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setUserSearch('')}>
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-muted/30 border-b">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Name</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Email</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Role</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Assigned Clinic</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Joined</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loadingUsers ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground animate-pulse">Loading users…</TableCell>
                                            </TableRow>
                                        ) : filteredUsers.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No users found.</TableCell>
                                            </TableRow>
                                        ) : filteredUsers.map(u => (
                                            <TableRow key={u.id} className="hover:bg-muted/20 transition-colors">
                                                <TableCell className="font-bold text-primary">{u.name}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Mail className="w-3 h-3" /> {u.email}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`${getRoleBadge(u.role)} text-[10px] font-bold border`}>
                                                        {getRoleLabel(u.role)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {u.clinic ? (
                                                        <span className="flex items-center gap-1">
                                                            <Building2 className="w-3 h-3 text-muted-foreground" /> {u.clinic.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground flex items-center gap-1">
                                                            <Shield className="w-3 h-3" /> Frigo Labs (All Clinics)
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
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

                {/* ─── Profile Tab ─── */}
                <TabsContent value="profile" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2 max-w-4xl">

                        {/* Profile Info */}
                        <Card className="border-none shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <User className="w-4 h-4 text-primary" /> Profile Information
                                </CardTitle>
                                {!editing && (
                                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                                        onClick={() => { setEditing(true); setProfileSuccess(''); setProfileError(''); setName(user?.name || ''); setEmail(user?.email || ''); }}>
                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {/* Avatar */}
                                <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl">
                                    <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-xl font-black text-primary border-2 border-primary/20">
                                        {(user?.name)?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-lg">{user?.name}</p>
                                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                                        <Badge variant="outline" className={`${getRoleBadge(user?.role)} text-[10px] font-bold border mt-1`}>
                                            {getRoleLabel(user?.role)}
                                        </Badge>
                                    </div>
                                </div>

                                {editing ? (
                                    <div className="space-y-4">
                                        <FormField label="Full Name">
                                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                                        </FormField>
                                        <FormField label="Email Address">
                                            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                                        </FormField>
                                        {profileError && <p className="text-sm text-destructive">{profileError}</p>}
                                        <div className="flex gap-2 pt-1">
                                            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 flex-1">
                                                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                                            </Button>
                                            <Button variant="outline" onClick={() => { setEditing(false); setProfileError(''); }} disabled={saving} className="gap-2">
                                                <X className="w-4 h-4" /> Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-0 divide-y text-sm">
                                        {profileSuccess && <p className="text-sm text-emerald-600 font-medium pb-3">{profileSuccess}</p>}
                                        <InfoRow label="Full Name" value={user?.name} />
                                        <InfoRow label="Email" value={user?.email} />
                                        <InfoRow label="Role" value={getRoleLabel(user?.role)} />
                                        {user?.clinic_id ? null : <InfoRow label="Organization" value="Frigo Labs" />}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Change Password */}
                        <Card className="border-none shadow-sm self-start">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-primary" /> Change Password
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    <FormField label="Current Password">
                                        <div className="relative">
                                            <Input
                                                type={showCurrent ? 'text' : 'password'}
                                                placeholder="••••••••"
                                                value={currentPw}
                                                onChange={e => setCurrentPw(e.target.value)}
                                                required
                                            />
                                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(v => !v)}>
                                                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </FormField>
                                    <FormField label="New Password">
                                        <div className="relative">
                                            <Input
                                                type={showNew ? 'text' : 'password'}
                                                placeholder="Min. 6 characters"
                                                value={newPw}
                                                onChange={e => setNewPw(e.target.value)}
                                                required
                                            />
                                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(v => !v)}>
                                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </FormField>
                                    <FormField label="Confirm New Password">
                                        <Input type="password" placeholder="Re-enter new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
                                    </FormField>
                                    {pwError && <p className="text-sm text-destructive font-medium">{pwError}</p>}
                                    {pwSuccess && <p className="text-sm text-emerald-600 font-medium">{pwSuccess}</p>}
                                    <Button type="submit" className="w-full gap-2" disabled={savingPw}>
                                        <Save className="w-4 h-4" /> {savingPw ? 'Updating…' : 'Update Password'}
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

function StatCard({ title, value, color }: any) {
    return (
        <Card className="border-none shadow-sm">
            <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</p>
                <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
            </CardContent>
        </Card>
    );
}

function FormField({ label, children }: any) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{label}</Label>
            {children}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex justify-between items-center py-2.5">
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
            <span className="text-sm font-bold">{value || '—'}</span>
        </div>
    );
}

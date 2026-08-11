'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ArrowLeft, Building2, Mail, Phone, Users, Activity,
    Search, RotateCcw, User, Calendar, FlaskConical,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const STATUS_BADGE: Record<string, string> = {
    PATIENT_CREATED: 'bg-slate-100 text-slate-600',
    TEST_PACKAGE_SELECTED: 'bg-blue-50 text-blue-700 border-blue-200',
    TASSO_INSTRUCTIONS_SENT: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    KIT_SHIPPED: 'bg-violet-50 text-violet-700 border-violet-200',
    SAMPLE_COLLECTED: 'bg-amber-50 text-amber-700 border-amber-200',
    LAB_PROCESSING: 'bg-orange-50 text-orange-700 border-orange-200',
    RESULTS_READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    COMPLETED: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_LABEL: Record<string, string> = {
    PATIENT_CREATED: 'Patient Created',
    TEST_PACKAGE_SELECTED: 'Test Package Selected',
    TASSO_INSTRUCTIONS_SENT: 'Tasso Instructions Sent',
    KIT_SHIPPED: 'Kit Shipped',
    SAMPLE_COLLECTED: 'Sample Collected',
    LAB_PROCESSING: 'Lab Processing',
    RESULTS_READY: 'Results Ready',
    COMPLETED: 'Completed',
};

export default function ClinicDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();

    const [clinic, setClinic] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        if (!user?.token || !id) return;
        axios.get(`/api/v1/clinics/${id}`, {
            headers: { Authorization: `Bearer ${user.token}` },
        })
            .then(res => setClinic(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user?.token, id]);

    const patients: any[] = clinic?.patients || [];

    const filtered = patients.filter(p => {
        const name = `${p.first_name} ${p.last_name}`.toLowerCase();
        const matchesSearch = !searchQuery || name.includes(searchQuery.toLowerCase()) ||
            (p.email || '').toLowerCase().includes(searchQuery.toLowerCase());
        const wfStatus = p.workflows?.[0]?.status || '';
        const matchesStatus = statusFilter === 'All' || wfStatus === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const formatDate = (d: string) =>
        d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">
                Loading clinic…
            </div>
        );
    }

    if (!clinic) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Building2 className="w-12 h-12 text-muted-foreground opacity-30" />
                <p className="font-bold text-lg">Clinic not found.</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Back + Header */}
            <div>
                <Button variant="ghost" className="gap-2 text-slate-500 hover:text-[#080e1e] hover:bg-slate-200 mb-4 -ml-2 transition-all rounded-full px-4" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" /> All Clinics
                </Button>

                <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white rounded-3xl border border-[#e4dec3]/70 shadow-sm">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-[#080e1e] flex items-center justify-center shrink-0 shadow-md">
                            <Building2 className="w-8 h-8 text-[#cbb28d]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-[#080e1e]">{clinic.name}</h1>
                            <p className="text-slate-500 text-sm mt-1">
                                Primary contact: <span className="font-bold text-slate-900">{clinic.contact_name || '—'}</span>
                            </p>
                            <div className="flex flex-wrap gap-3 mt-2">
                                {clinic.email && (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                                        <Mail className="w-3.5 h-3.5" /> {clinic.email}
                                    </span>
                                )}
                                {clinic.phone && (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                                        <Phone className="w-3.5 h-3.5" /> {clinic.phone}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <Badge className={`${clinic.status === 'Active' || !clinic.status ? 'bg-emerald-500' : 'bg-slate-400'} text-white text-xs font-bold uppercase tracking-widest px-3 py-1 self-start md:self-center`}>
                        {clinic.status || 'Active'}
                    </Badge>
                </Card>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard title="Total Patients" value={clinic._count?.patients ?? 0} icon={Users} color="text-primary" />
                <StatCard title="Active Workflows" value={(clinic._count?.workflows ?? 0)} icon={Activity} color="text-emerald-500" />
                <StatCard title="Results Ready" value={patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length} icon={FlaskConical} color="text-amber-500" />
            </div>

            {/* Patient Table */}
            <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <CardTitle className="text-sm font-extrabold flex items-center gap-2 text-[#080e1e]">
                            <Users className="w-4 h-4 text-[#cbb28d]" /> Patients ({filtered.length})
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or email…"
                                    className="pl-9 h-8 text-sm w-56"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="bg-background border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-2 ring-primary/20"
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                            >
                                <option value="All">All Statuses</option>
                                {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground"
                                onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                                <RotateCcw className="w-3 h-3" /> Reset
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30 border-b">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Patient Name</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Contact</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Date of Birth</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Workflow Status</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Enrolled</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <User className="w-8 h-8 opacity-30" />
                                            <p className="font-medium text-sm">No patients found.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filtered.map((p: any) => {
                                const wf = p.workflows?.[0];
                                return (
                                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                                        <TableCell
                                            className="font-extrabold text-[#080e1e] cursor-pointer hover:underline hover:text-[#cbb28d] transition-colors"
                                            onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                        >
                                            {p.first_name} {p.last_name}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                {p.email && (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Mail className="w-3 h-3" /> {p.email}
                                                    </span>
                                                )}
                                                {p.phone && (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Phone className="w-3 h-3" /> {p.phone}
                                                    </span>
                                                )}
                                                {!p.email && !p.phone && <span className="text-xs text-muted-foreground">—</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {p.dob ? (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(p.dob)}
                                                </span>
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">{wf?.test_type || '—'}</TableCell>
                                        <TableCell>
                                            {wf ? (
                                                <Badge variant="outline" className={`${STATUS_BADGE[wf.status] || 'bg-[#080e1e] text-slate-600'} text-[10px] font-bold border`}>
                                                    {STATUS_LABEL[wf.status] || wf.status}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">No workflow</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs h-7"
                                                onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                            >
                                                View
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({ title, value, icon: Icon }: any) {
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

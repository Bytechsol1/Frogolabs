'use client';

import { useEffect, useState } from 'react';
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Users,
    Activity,
    CheckCircle,
    FlaskConical,
    Clock,
    ChevronRight,
    Building2,
    Plus,
    MoreVertical,
    PhoneCall,
    AlertCircle,
    TrendingUp,
    CalendarDays
} from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function DashboardPage() {
    const { user } = useAuth();
    return user?.role === 'ADMIN' ? <AdminDashboard /> : <ClinicDashboard />;
}

const STATUS_LABELS: Record<string, string> = {
    PATIENT_CREATED: 'Patient Created',
    TEST_PACKAGE_SELECTED: 'Test Package Selected',
    TASSO_INSTRUCTIONS_SENT: 'Instructions Sent',
    KIT_SHIPPED: 'Kit Shipped',
    SAMPLE_COLLECTED: 'Sample Collected',
    LAB_PROCESSING: 'Lab Processing',
    RESULTS_READY: 'Results Ready',
    COMPLETED: 'Completed',
};

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
    PATIENT_CREATED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900' },
    TEST_PACKAGE_SELECTED: { bg: 'bg-indigo-900/10 border border-indigo-800/20', text: 'text-indigo-900' },
    TASSO_INSTRUCTIONS_SENT: { bg: 'bg-sky-900/10 border border-sky-800/20', text: 'text-sky-900' },
    KIT_SHIPPED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900' },
    SAMPLE_COLLECTED: { bg: 'bg-rose-900/10 border border-rose-800/20', text: 'text-rose-900' },
    LAB_PROCESSING: { bg: 'bg-purple-900/10 border border-purple-800/20', text: 'text-purple-900' },
    RESULTS_READY: { bg: 'bg-[#080e1e] border border-[#cbb28d]/30', text: 'text-[#cbb28d]' },
    COMPLETED: { bg: 'bg-slate-900/10 border border-slate-700/20', text: 'text-slate-800' },
};

const DAYS_BAR = [
    { day: 'SAT', date: '6' },
    { day: 'SUN', date: '7' },
    { day: 'MON', date: '8' },
    { day: 'TUE', date: '9' },
    { day: 'WED', date: '10' },
    { day: 'THU', date: '11' },
    { day: 'FRI', date: '12', active: true },
    { day: 'SAT', date: '13' },
    { day: 'SUN', date: '14' },
    { day: 'MON', date: '15' },
    { day: 'TUE', date: '16' },
];

// ─────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────
function AdminDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const [patients, setPatients] = useState<any[]>([]);
    const [clinics, setClinics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.token) return;
        const headers = { Authorization: `Bearer ${user.token}` };
        Promise.all([
            axios.get('/api/v1/patients', { headers }),
            axios.get('/api/v1/clinics', { headers }),
        ])
            .then(([pRes, cRes]) => {
                setPatients(pRes.data);
                setClinics(cRes.data);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user?.token]);

    const totalClinics = clinics.length;
    const totalPatients = patients.length;
    const activeWorkflows = patients.filter(p => p.workflows?.[0]?.status && p.workflows[0].status !== 'COMPLETED').length;
    const resultsReady = patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length;
    const completedWorkflows = patients.filter(p => p.workflows?.[0]?.status === 'COMPLETED').length;

    const recentPatients = patients.slice(0, 5);
    const attentionPatients = patients.filter(p => ['RESULTS_READY', 'SAMPLE_COLLECTED', 'KIT_SHIPPED'].includes(p.workflows?.[0]?.status)).slice(0, 3);
    const telemetryPatients = patients.filter(p => p.validic_user_id).slice(0, 3);

    if (loading) return <MediqSkeleton />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-8">
            {/* Header */}
            <div>
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#080e1e]">
                    Hello, {user?.name || 'Admin'}
                </h1>
            </div>

            {/* Stat Cards (5 KPI Cards restored) */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
                <MediqStatCard title="Total Clinics" value={String(totalClinics)} icon={Building2} />
                <MediqStatCard title="Total Patients" value={String(totalPatients)} icon={Users} />
                <MediqStatCard title="Active Workflows" value={String(activeWorkflows)} icon={Activity} />
                <MediqStatCard title="Results Ready" value={String(resultsReady)} icon={FlaskConical} />
                <MediqStatCard title="Completed" value={String(completedWorkflows)} icon={CheckCircle} />
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-12">
                {/* Left Workflow List */}
                <div className="lg:col-span-8 space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h2 className="text-lg font-bold text-[#080e1e] flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-[#cbb28d]" /> Active Patient Workflows
                            </h2>
                            <div className="flex items-center gap-2">
                                <Button size="sm" className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-1.5 px-4 h-9 shadow-sm" onClick={() => router.push('/dashboard/patients')}>
                                    <Plus className="w-4 h-4 text-[#cbb28d]" /> View Patients
                                </Button>
                            </div>
                        </div>

                        {/* Workflow Rows */}
                        <div className="space-y-3">
                            {recentPatients.length === 0 ? (
                                <p className="text-center py-8 text-slate-500 text-xs italic">No active workflows available.</p>
                            ) : recentPatients.map((p) => {
                                const st = p.workflows?.[0]?.status || 'PATIENT_CREATED';
                                const badgeInfo = STATUS_BADGES[st] || { bg: 'bg-[#080e1e]', text: 'text-[#cbb28d]' };
                                const isGreen = ['RESULTS_READY', 'COMPLETED'].includes(st);

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                        className="relative p-4 rounded-2xl bg-white/60 border border-[#e6e0ce] hover:border-[#080e1e] transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer group"
                                    >
                                        <div className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${isGreen ? 'bg-[#cbb28d]' : 'bg-[#080e1e]'
                                            }`} />

                                        <div className="pl-3 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-sm flex items-center justify-center shrink-0 border border-[#cbb28d]/30">
                                                {p.first_name[0]}{p.last_name[0]}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-[#080e1e] group-hover:text-[#8c7657] transition-colors">
                                                    {p.first_name} {p.last_name}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {p.clinic?.name || 'Clinic'} • {p.workflows?.[0]?.test_type || 'General Diagnostic'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeInfo.bg} ${badgeInfo.text}`}>
                                                {STATUS_LABELS[st] || st}
                                            </span>
                                            <button className="w-8 h-8 rounded-full bg-white border border-[#ded8c4] flex items-center justify-center text-[#080e1e] hover:bg-[#080e1e] hover:text-white transition-colors">
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>

                {/* Right Side Cards */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-extrabold text-[#080e1e] flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-700" /> Needs Attention
                            </h2>
                            <button className="text-xs font-bold text-[#8c7657] hover:underline" onClick={() => router.push('/dashboard/workflows')}>
                                View All
                            </button>
                        </div>

                        <div className="space-y-3">
                            {attentionPatients.length === 0 ? (
                                <p className="text-center py-4 text-slate-500 text-xs italic">All clear.</p>
                            ) : attentionPatients.map(p => {
                                const st = p.workflows[0].status;
                                let type = 'info';
                                if (st === 'RESULTS_READY') type = 'urgent';
                                else if (st === 'SAMPLE_COLLECTED') type = 'warning';

                                return (
                                    <AttentionItem key={p.id} title={STATUS_LABELS[st] || st} patient={`${p.first_name} ${p.last_name}`} time={new Date(p.workflows[0].created_at).toLocaleDateString()} type={type} onClick={() => router.push(`/dashboard/patients/${p.id}`)} />
                                );
                            })}
                        </div>
                    </Card>

                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-extrabold text-[#080e1e] flex items-center gap-2">
                                <Users className="w-4 h-4 text-[#cbb28d]" /> Active Patient Telemetry
                            </h2>
                            <button className="text-xs font-bold text-[#8c7657] hover:underline" onClick={() => router.push('/dashboard/patients')}>
                                View All
                            </button>
                        </div>

                        <div className="space-y-3">
                            {telemetryPatients.length === 0 ? (
                                <p className="text-center py-4 text-slate-500 text-xs italic">No active telemetry.</p>
                            ) : telemetryPatients.map(p => (
                                <div key={p.id} onClick={() => router.push(`/dashboard/patients/${p.id}`)} className="flex items-center justify-between p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] hover:border-[#080e1e] cursor-pointer transition-all duration-200">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-[#080e1e] text-[#cbb28d] text-xs font-bold flex items-center justify-center border border-[#cbb28d]/30">
                                            {p.first_name[0]}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-[#080e1e]">{p.first_name} {p.last_name}</p>
                                            <p className="text-[10px] text-[#8c7657] font-bold">Vitals Sync Active</p>
                                        </div>
                                    </div>
                                    <span className="w-2 h-2 rounded-full bg-[#cbb28d] animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// CLINIC DASHBOARD
// ─────────────────────────────────────────────────────────────────
function ClinicDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.token) return;
        axios.get('/api/v1/patients', {
            headers: { Authorization: `Bearer ${user.token}` },
        })
            .then(res => setPatients(res.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user?.token]);

    const total = patients.length;
    const active = patients.filter(p => p.workflows?.[0]?.status && p.workflows[0].status !== 'COMPLETED').length;
    const resultsReady = patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length;
    const completed = patients.filter(p => p.workflows?.[0]?.status === 'COMPLETED').length;

    const attentionPatients = patients.filter(p => ['RESULTS_READY', 'SAMPLE_COLLECTED', 'KIT_SHIPPED'].includes(p.workflows?.[0]?.status)).slice(0, 3);

    if (loading) return <MediqSkeleton />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#080e1e]">
                        Hello, Dr. {user?.name?.split(' ')[0] || user?.name}
                    </h1>
                </div>
                <Button className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-2 px-5 h-10 shadow-sm self-start" onClick={() => router.push('/dashboard/patients/add')}>
                    <Plus className="w-4 h-4 text-[#cbb28d]" /> Add New Patient
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MediqStatCard title="Active Patients" value={String(total)} icon={Users} />
                <MediqStatCard title="Active Workflows" value={String(active)} icon={Activity} />
                <MediqStatCard title="Results Ready" value={String(resultsReady)} icon={FlaskConical} />
                <MediqStatCard title="Completed Sessions" value={String(completed)} icon={CheckCircle} />
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8 space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-[#080e1e] flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-[#cbb28d]" /> Patient Diagnostics Pipeline
                            </h2>
                        </div>


                        <div className="space-y-3">
                            {patients.length === 0 ? (
                                <p className="text-center py-8 text-slate-500 text-xs italic">No patient records found.</p>
                            ) : patients.slice(0, 5).map(p => {
                                const st = p.workflows?.[0]?.status || 'PATIENT_CREATED';
                                const badgeInfo = STATUS_BADGES[st] || { bg: 'bg-[#080e1e]', text: 'text-[#cbb28d]' };

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                        className="relative p-4 rounded-2xl bg-white/60 border border-[#e6e0ce] hover:border-[#080e1e] transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer group"
                                    >
                                        <div className="absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full bg-[#080e1e]" />

                                        <div className="pl-3 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-sm flex items-center justify-center shrink-0 border border-[#cbb28d]/30">
                                                {p.first_name[0]}{p.last_name[0]}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-[#080e1e] group-hover:text-[#8c7657] transition-colors">
                                                    {p.first_name} {p.last_name}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {p.workflows?.[0]?.test_type || 'General Diagnostic'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeInfo.bg} ${badgeInfo.text}`}>
                                                {STATUS_LABELS[st] || st}
                                            </span>
                                            <button className="w-8 h-8 rounded-full bg-white border border-[#ded8c4] flex items-center justify-center text-[#080e1e] hover:bg-[#080e1e] hover:text-white transition-colors">
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-extrabold text-[#080e1e] flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-700" /> Needs Attention
                            </h2>
                        </div>
                        <div className="space-y-3">
                            {attentionPatients.length === 0 ? (
                                <p className="text-center py-4 text-slate-500 text-xs italic">All clear.</p>
                            ) : attentionPatients.map(p => {
                                const st = p.workflows[0].status;
                                let type = 'info';
                                if (st === 'RESULTS_READY') type = 'urgent';
                                else if (st === 'SAMPLE_COLLECTED') type = 'warning';

                                return (
                                    <AttentionItem key={p.id} title={STATUS_LABELS[st] || st} patient={`${p.first_name} ${p.last_name}`} time={new Date(p.workflows[0].created_at).toLocaleDateString()} type={type} onClick={() => router.push(`/dashboard/patients/${p.id}`)} />
                                );
                            })}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function MediqStatCard({ title, value, badge, icon: Icon, subText }: any) {
    return (
        <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-5 space-y-3 transition-transform hover:-translate-y-0.5 text-left">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <div className="p-3 rounded-2xl bg-[#080e1e] text-[#cbb28d] shadow-md">
                        <Icon className="w-6 h-6" />
                    </div>
                    <span className="uppercase text-xs font-mono font-black tracking-widest text-[#080e1e] whitespace-nowrap">{title}</span>
                </div>
            </div>

            <div className="flex items-baseline justify-between pt-1">
                <span className="text-3xl font-extrabold text-[#080e1e] tracking-tight">{value}</span>
                {badge && (
                    <span className="text-xs font-bold text-[#080e1e] bg-[#e4dec3]/50 px-2.5 py-0.5 rounded-full border border-[#cbb28d]/30">
                        {badge}
                    </span>
                )}
            </div>

            {subText && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-[#e6e0ce]">
                    <span>{subText}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#8c7657]" />
                </div>
            )}
        </Card>
    );
}

function AttentionItem({ title, patient, time, type, onClick }: any) {
    return (
        <div onClick={onClick} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 border border-[#e6e0ce] hover:border-[#080e1e] cursor-pointer transition-all duration-200">
            <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${type === 'urgent' ? 'bg-rose-900/15 text-rose-800' : 'bg-[#080e1e] text-[#cbb28d]'
                    }`}>
                    !
                </div>
                <div>
                    <p className="text-xs font-bold text-[#080e1e]">{title}</p>
                    <p className="text-[10px] text-slate-500">{patient} • {time}</p>
                </div>
            </div>
            <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
        </div>
    );
}

function MediqSkeleton() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Skeleton className="h-10 w-64 bg-[#e4dec3]/50 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-3xl bg-white shadow-xs" />
                ))}
            </div>
        </div>
    );
}

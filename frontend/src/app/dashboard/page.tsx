'use client';

import { useEffect, useState } from 'react';
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    Users,
    CheckCircle,
    Clock,
    FlaskConical,
    ChevronRight,
    Building2,
    Plus,
    CalendarDays
} from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Link from 'next/link';

export default function DashboardPage() {
    const { user } = useAuth();
    return user?.role === 'ADMIN' ? <AdminDashboard /> : <ClinicDashboard />;
}

function useTimeGreeting() {
    const [greeting, setGreeting] = useState('');
    useEffect(() => {
        const updateGreeting = () => {
            const hour = new Date().getHours();
            setGreeting(hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening');
        };
        updateGreeting();
        const timer = window.setInterval(updateGreeting, 60000);
        window.addEventListener('focus', updateGreeting);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', updateGreeting);
        };
    }, []);
    return greeting;
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



// ─────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────
function AdminDashboard() {
    const greeting = useTimeGreeting();
    const { user } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user?.token) return;
        const controller = new AbortController();
        const refresh = async () => {
            try {
                const { data } = await axios.get('/api/v1/dashboard/admin/stats', {
                    headers: { Authorization: `Bearer ${user.token}` }, signal: controller.signal,
                });
                setStats(data); setError('');
            } catch {
                if (!controller.signal.aborted) setError('Dashboard data could not be refreshed. Please try again.');
            } finally { if (!controller.signal.aborted) setLoading(false); }
        };
        void refresh();
        const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
        const timer = window.setInterval(onFocus, 30000);
        window.addEventListener('focus', onFocus);
        return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, [user?.token]);

    const totalClinics = stats?.kpi.totalClinics;
    const resultsReady = stats?.kpi.resultsReady;
    const completedWorkflows = stats?.kpi.completedWorkflows;
    const activeClinics: { id: string; name: string; contact_name: string | null; email: string | null; status: string | null }[] = stats?.tables.activeClinics || [];

    if (loading) return <MediqSkeleton />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#080e1e]">
                    {greeting && `${greeting}!`}
                </h1>
            </div>

            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            {/* Live-data summary links */}
            <div className="grid gap-4 sm:grid-cols-3">
                <MediqStatCard title="Total Clinics" value={totalClinics == null ? "--" : String(totalClinics)} icon={Building2} href="/dashboard/clinics" />
                <MediqStatCard title="Results Ready" value={resultsReady == null ? "--" : String(resultsReady)} icon={FlaskConical} href="/dashboard/lab-results?tab=available" />
                <MediqStatCard title="Completed" value={completedWorkflows == null ? "--" : String(completedWorkflows)} icon={CheckCircle} href="/dashboard/workflows?tab=completed" />
            </div>

            {/* Main Grid */}
            <div className="space-y-6">
                {/* Left Workflow List */}
                <div className="space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h2 className="text-lg font-bold text-[#080e1e] flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-[#cbb28d]" /> Active Clinics
                            </h2>
                            <div className="flex items-center gap-2">
                                <Button size="sm" className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-1.5 px-4 h-9 shadow-sm" onClick={() => router.push('/dashboard/clinics')}>
                                    <Building2 className="w-4 h-4 text-[#cbb28d]" /> View Clinics
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {activeClinics.length === 0 ? (
                                <p className="text-center py-8 text-slate-500 text-xs italic">No active clinics available.</p>
                            ) : activeClinics.map(clinic => (
                                <Link key={clinic.id} href={`/dashboard/clinics/${clinic.id}`}
                                    className="relative p-4 rounded-2xl bg-white/60 border border-[#e6e0ce] hover:border-[#080e1e] focus-visible:outline-2 focus-visible:outline-[#cbb28d] transition-all duration-200 flex items-center justify-between gap-4 group">
                                    <span aria-hidden="true" className="absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full bg-[#cbb28d]" />
                                    <div className="pl-3 flex min-w-0 items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#080e1e] text-[#cbb28d] flex items-center justify-center shrink-0 border border-[#cbb28d]/30">
                                            <Building2 aria-hidden="true" className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-[#080e1e] group-hover:text-[#8c7657] break-words">{clinic.name}</p>
                                            {(clinic.contact_name || clinic.email) && <p className="text-xs text-slate-500 break-all">{clinic.contact_name || clinic.email}</p>}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30">Active</span>
                                        <span aria-hidden="true" className="w-8 h-8 rounded-full bg-white border border-[#ded8c4] flex items-center justify-center text-[#080e1e] group-hover:bg-[#080e1e] group-hover:text-white transition-colors">
                                            <ChevronRight className="w-4 h-4" />
                                        </span>
                                    </div>
                                </Link>
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
    const greeting = useTimeGreeting();
    const { user } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.token) return;
        const controller = new AbortController();
        const refresh = async () => {
            try {
                const { data } = await axios.get('/api/v1/dashboard/clinic/stats', {
                    headers: { Authorization: `Bearer ${user.token}` }, signal: controller.signal,
                });
                setStats(data);
                setError('');
            } catch {
                if (!controller.signal.aborted) setError('Dashboard data could not be refreshed. Please try again.');
            } finally { if (!controller.signal.aborted) setLoading(false); }
        };
        void refresh();
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        const timer = window.setInterval(onVisible, 30000);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            controller.abort(); window.clearInterval(timer);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [user?.token]);

    const patients: any[] = stats?.tables.recentPatients || [];
    const count = (key: string) => stats?.kpi[key] == null ? '--' : String(stats.kpi[key]);

    if (loading) return <MediqSkeleton />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#080e1e]">
                        {greeting && `${greeting}!`}
                    </h1>
                </div>
                <Button className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-2 px-5 h-10 shadow-sm self-start" onClick={() => router.push('/dashboard/patients/add')}>
                    <Plus className="w-4 h-4 text-[#cbb28d]" /> Add New Patient
                </Button>
            </div>

            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-3">
                <MediqStatCard title="Total Patients" value={count("totalPatients")} icon={Users} href="/dashboard/patients" />
                <MediqStatCard title="Results Ready" value={count("resultsReady")} icon={FlaskConical} href="/dashboard/lab-results?tab=available" />
                <MediqStatCard title="Awaiting Test Orders" value={count("awaitingTestOrders")} icon={Clock} href="/dashboard/lab-results?tab=pending" />
            </div>

            <div className="space-y-6">
                <div className="space-y-6">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-[#080e1e] flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-[#cbb28d]" /> Patient Diagnostics
                            </h2>
                        </div>


                        <div className="space-y-3">
                            {patients.length === 0 ? (
                                <p className="text-center py-8 text-slate-500 text-xs italic">No patients with results ready yet.</p>
                            ) : patients.map(p => {
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
                                                    {p.workflows?.[0]?.test_type || 'No lab order yet'}
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

            </div>
        </div>
    );
}

function MediqStatCard({ title, value, badge, icon: Icon, subText, caption, href }: any) {
    const card = (
        <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-5 sm:p-6 h-full gap-6 transition-transform hover:-translate-y-0.5 text-left">
            <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3 text-xs font-bold text-slate-500">
                    <div className="p-3 shrink-0 rounded-2xl bg-[#080e1e] text-[#cbb28d] shadow-md">
                        <Icon className="w-6 h-6" />
                    </div>
                    <span className="uppercase text-xs font-mono font-black tracking-widest text-[#080e1e] min-w-0 break-words">{title}</span>
                </div>
            </div>

            <div className="flex items-baseline justify-between pt-1">
                <div>
                    <span className="text-3xl font-extrabold text-[#080e1e] tracking-tight">{value}</span>
                    {caption && <p className="mt-2 text-xs text-slate-500">{caption}</p>}
                </div>
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
    return href ? <Link href={href} className="block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8c7657]">{card}</Link> : card;
}

function MediqSkeleton() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Skeleton className="h-10 w-64 bg-[#e4dec3]/50 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-3xl bg-white shadow-xs" />
                ))}
            </div>
        </div>
    );
}

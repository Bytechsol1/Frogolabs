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

const STATUS_COLORS: Record<string, string> = {
    PATIENT_CREATED: 'bg-blue-100 text-blue-700',
    TEST_PACKAGE_SELECTED: 'bg-indigo-100 text-indigo-700',
    TASSO_INSTRUCTIONS_SENT: 'bg-cyan-100 text-cyan-700',
    KIT_SHIPPED: 'bg-amber-100 text-amber-700',
    SAMPLE_COLLECTED: 'bg-orange-100 text-orange-700',
    LAB_PROCESSING: 'bg-purple-100 text-purple-700',
    RESULTS_READY: 'bg-emerald-100 text-emerald-700',
    COMPLETED: 'bg-slate-100 text-slate-700',
};

const STAGE_ORDER = [
    'PATIENT_CREATED', 'TEST_PACKAGE_SELECTED', 'TASSO_INSTRUCTIONS_SENT',
    'KIT_SHIPPED', 'SAMPLE_COLLECTED', 'LAB_PROCESSING', 'RESULTS_READY', 'COMPLETED',
];

function daysSince(dateStr: string) {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

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
            axios.get('http://localhost:3000/api/v1/patients', { headers }),
            axios.get('http://localhost:3000/api/v1/clinics', { headers }),
        ])
            .then(([pRes, cRes]) => {
                setPatients(pRes.data);
                setClinics(cRes.data);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user?.token]);

    const totalClinics = clinics.length;
    const totalPatients = patients.length;
    const activeWorkflows = patients.filter(p => p.workflows?.[0]?.status && p.workflows[0].status !== 'COMPLETED').length;
    const resultsReady = patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length;
    const completed = patients.filter(p => p.workflows?.[0]?.status === 'COMPLETED').length;

    const stageCounts = patients.reduce<Record<string, number>>((acc, p) => {
        const s = p.workflows?.[0]?.status;
        if (s) acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const recentPatients = patients.slice(0, 6);

    if (loading) return <DashboardSkeleton cols={5} />;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-primary">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Overview of all clinics, patients, and diagnostic workflows.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard title="Total Clinics" value={String(totalClinics)} icon={Building2} color="text-blue-500" />
                <StatCard title="Total Patients" value={String(totalPatients)} icon={Users} color="text-indigo-500" />
                <StatCard title="Active Workflows" value={String(activeWorkflows)} icon={Activity} color="text-amber-500" />
                <StatCard title="Results Ready" value={String(resultsReady)} icon={FlaskConical} color="text-rose-500" />
                <StatCard title="Completed" value={String(completed)} icon={CheckCircle} color="text-emerald-500" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Workflow breakdown */}
                <Card className="lg:col-span-1 shadow-sm border-none bg-slate-50/50 dark:bg-slate-900/50">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Activity className="w-5 h-4 text-primary" />
                            Workflow Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {STAGE_ORDER.map(s => (
                            <WorkflowStage key={s} name={STATUS_LABELS[s]} count={stageCounts[s] || 0} color={STATUS_COLORS[s]} />
                        ))}
                    </CardContent>
                </Card>

                {/* Recent patients */}
                <Card className="lg:col-span-2 shadow-sm border-none">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            Recent Patients
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => router.push('/dashboard/patients')}>
                            View All
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead className="font-bold">Patient Name</TableHead>
                                    <TableHead className="font-bold">Clinic</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="font-bold">Date Added</TableHead>
                                    <TableHead className="text-right w-[60px]" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentPatients.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic text-sm">No patients yet.</TableCell>
                                    </TableRow>
                                ) : recentPatients.map(p => (
                                    <TableRow
                                        key={p.id}
                                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                    >
                                        <TableCell className="font-semibold">{p.first_name} {p.last_name}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{p.clinic?.name || '—'}</TableCell>
                                        <TableCell>
                                            <Badge className={`${STATUS_COLORS[p.workflows?.[0]?.status] || 'bg-slate-100 text-slate-700'} text-[10px] font-bold border-none`}>
                                                {STATUS_LABELS[p.workflows?.[0]?.status] || 'N/A'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground italic">
                                            {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary hover:text-white rounded-full">
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

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
        axios.get('http://localhost:3000/api/v1/patients', {
            headers: { Authorization: `Bearer ${user.token}` },
        })
            .then(res => setPatients(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user?.token]);

    const total = patients.length;
    const active = patients.filter(p => p.workflows?.[0]?.status && p.workflows[0].status !== 'COMPLETED').length;
    const resultsReady = patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length;
    const completed = patients.filter(p => p.workflows?.[0]?.status === 'COMPLETED').length;
    const recentPatients = patients.slice(0, 5);
    const awaitingList = patients.filter(p => ['LAB_PROCESSING', 'RESULTS_READY'].includes(p.workflows?.[0]?.status)).slice(0, 5);

    const stageCounts = patients.reduce<Record<string, number>>((acc, p) => {
        const s = p.workflows?.[0]?.status;
        if (s) acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    if (loading) return <DashboardSkeleton cols={4} />;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-primary">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Welcome back, <span className="font-semibold text-foreground">{user?.name}</span>. Here's your clinic's activity.
                    </p>
                </div>
                <Button className="gap-2 shadow-md bg-primary hover:bg-primary/90" onClick={() => router.push('/dashboard/patients/add')}>
                    <Plus className="w-4 h-4" /> Add Patient
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="My Patients" value={String(total)} icon={Users} color="text-indigo-500" />
                <StatCard title="Active Workflows" value={String(active)} icon={Activity} color="text-amber-500" />
                <StatCard title="Results Ready" value={String(resultsReady)} icon={FlaskConical} color="text-rose-500" />
                <StatCard title="Completed" value={String(completed)} icon={CheckCircle} color="text-emerald-500" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-1 shadow-sm border-none bg-slate-50/50 dark:bg-slate-900/50">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Activity className="w-5 h-4 text-primary" /> Workflow Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {STAGE_ORDER.map(s => (
                            <WorkflowStage key={s} name={STATUS_LABELS[s]} count={stageCounts[s] || 0} color={STATUS_COLORS[s]} />
                        ))}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-none">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" /> My Recent Patients
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => router.push('/dashboard/patients')}>
                            View All
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {recentPatients.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">No patients yet. Add your first patient.</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="font-bold">Patient Name</TableHead>
                                        <TableHead className="font-bold">Test Package</TableHead>
                                        <TableHead className="font-bold">Status</TableHead>
                                        <TableHead className="font-bold">Date Added</TableHead>
                                        <TableHead className="text-right w-[60px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentPatients.map(p => (
                                        <TableRow key={p.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/patients/${p.id}`)}>
                                            <TableCell className="font-semibold">{p.first_name} {p.last_name}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{p.workflows?.[0]?.test_type || '—'}</TableCell>
                                            <TableCell>
                                                <Badge className={`${STATUS_COLORS[p.workflows?.[0]?.status] || 'bg-slate-100 text-slate-700'} text-[10px] font-bold border-none`}>
                                                    {STATUS_LABELS[p.workflows?.[0]?.status] || 'N/A'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground italic">
                                                {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary hover:text-white rounded-full">
                                                    <ChevronRight className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-1 shadow-md border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/10">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-amber-700 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Awaiting Lab Results
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {awaitingList.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No patients awaiting results.</p>
                        ) : (
                            <ul className="space-y-3">
                                {awaitingList.map(p => (
                                    <li key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:opacity-80" onClick={() => router.push(`/dashboard/patients/${p.id}`)}>
                                        <div>
                                            <p className="text-sm font-semibold">{p.first_name} {p.last_name}</p>
                                            <p className="text-xs text-muted-foreground">{p.workflows?.[0]?.test_type}</p>
                                        </div>
                                        <Badge className={`text-[10px] font-black ${p.workflows?.[0]?.status === 'RESULTS_READY' ? 'bg-emerald-500' : 'bg-amber-500'} text-white`}>
                                            {p.workflows?.[0]?.status === 'RESULTS_READY' ? 'Ready' : `${daysSince(p.created_at)}d`}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-1 shadow-sm border-none">
                    <CardHeader>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-primary" /> Quick Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => router.push('/dashboard/patients/add')}>
                            <Plus className="w-4 h-4 text-primary" /> Add New Patient
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => router.push('/dashboard/workflows')}>
                            <Activity className="w-4 h-4 text-primary" /> View All Workflows
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => router.push('/dashboard/lab-results')}>
                            <FlaskConical className="w-4 h-4 text-primary" /> Check Lab Results
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => router.push('/dashboard/patients')}>
                            <Users className="w-4 h-4 text-primary" /> View All Patients
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color }: any) {
    return (
        <Card className="border-none shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black">{value}</div>
            </CardContent>
        </Card>
    );
}

function DashboardSkeleton({ cols }: { cols: number }) {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${cols}`}>
                {Array.from({ length: cols }).map((_, i) => (
                    <Card key={i} className="border-none shadow-sm">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-8 w-12" />
                            </div>
                            <Skeleton className="h-8 w-8 rounded-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardContent className="p-5 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full rounded-lg" />
                        ))}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2 border-none shadow-sm">
                    <CardContent className="p-0">
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-4 flex-1" />
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-6 w-20 rounded-full" />
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function WorkflowStage({ name, count, color }: any) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-background transition-colors">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{name}</span>
            <Badge className={`font-bold border-none ${color}`}>{count}</Badge>
        </div>
    );
}

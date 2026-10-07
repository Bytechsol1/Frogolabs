'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Suspense, useCallback, useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Search,
    RotateCcw,
    ChevronRight,
    Eye,
    Timer,
    CheckCircle2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const EXECUTIVE_STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
    PATIENT_CREATED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Patient Created' },
    TEST_PACKAGE_SELECTED: { bg: 'bg-indigo-900/10 border border-indigo-800/20', text: 'text-indigo-900', label: 'Package Selected' },
    TASSO_INSTRUCTIONS_SENT: { bg: 'bg-sky-900/10 border border-sky-800/20', text: 'text-sky-900', label: 'Instructions Sent' },
    KIT_SHIPPED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Kit Shipped' },
    SAMPLE_COLLECTED: { bg: 'bg-rose-900/10 border border-rose-800/20', text: 'text-rose-900', label: 'Sample Collected' },
    LAB_PROCESSING: { bg: 'bg-purple-900/10 border border-purple-800/20', text: 'text-purple-900', label: 'Lab Processing' },
    RESULTS_READY: { bg: 'bg-[#080e1e] border border-[#cbb28d]/30', text: 'text-[#cbb28d]', label: 'Results Ready' },
    COMPLETED: { bg: 'bg-slate-900/10 border border-slate-700/20', text: 'text-slate-800', label: 'Completed' },
};

export default function DiagnosticWorkflowsPage() {
    return <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading...</div>}><WorkflowsContent /></Suspense>;
}

function WorkflowsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const clinicId = user?.role === 'ADMIN' ? searchParams.get('clinic_id') : null;
    const sessionsHref = (tab: string) => `/dashboard/workflows?tab=${tab}${clinicId ? `&clinic_id=${encodeURIComponent(clinicId)}` : ''}`;
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchWorkflows = useCallback(async (background = false) => {
        if (!user?.token) return;
        if (!background) setLoading(true);
        try {
            const config = { headers: { Authorization: `Bearer ${user.token}` } };
            const res = await axios.get('/api/v1/workflows', config);
            setWorkflows(res.data);
            setLoadError(false);
        } catch (err) {
            setLoadError(true);
            console.error('Failed to fetch sessions', err);
        } finally {
            setLoading(false);
        }
    }, [user?.token]);

    useEffect(() => {
        fetchWorkflows();
        const refresh = () => { if (document.visibilityState === 'visible') void fetchWorkflows(true); };
        const timer = window.setInterval(refresh, 30000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, [fetchWorkflows]);

    const scopedWorkflows = useMemo(() => workflows.filter(w => !clinicId || w.clinic_id === clinicId), [workflows, clinicId]);

    const filteredWorkflows = useMemo(() => {
        return scopedWorkflows.filter(w => {
            const patientName = `${w.patient?.first_name || ''} ${w.patient?.last_name || ''}`.toLowerCase();
            const clinicName = (w.clinic?.name || '').toLowerCase();
            const pkg = (w.test_type || '').toLowerCase();
            const matchesSearch =
                patientName.includes(searchQuery.toLowerCase()) ||
                clinicName.includes(searchQuery.toLowerCase()) ||
                pkg.includes(searchQuery.toLowerCase());
            return matchesSearch;
        });
    }, [scopedWorkflows, searchQuery]);

    const active = useMemo(() => filteredWorkflows.filter(w => w.status !== 'COMPLETED'), [filteredWorkflows]);
    const completed = useMemo(() => filteredWorkflows.filter(w => w.status === 'COMPLETED'), [filteredWorkflows]);

    const totalActive = scopedWorkflows.filter(w => w.status !== 'COMPLETED').length;
    const totalCompleted = scopedWorkflows.filter(w => w.status === 'COMPLETED').length;

    const selectedTab = searchParams.get('tab');
    const activeTab = selectedTab === 'active' || selectedTab === 'completed' ? selectedTab : 'total';
    const tabCounts = { total: scopedWorkflows.length, active: totalActive, completed: totalCompleted };

    const isAdmin = user?.role === 'ADMIN';

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden pb-8">
            {/* Header */}
            <div>
                {clinicId && <Link href={`/dashboard/clinics/${encodeURIComponent(clinicId)}`} className="inline-block mb-3 text-sm text-slate-600 hover:underline">Back to clinic</Link>}
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                    {clinicId ? `${scopedWorkflows[0]?.clinic?.name || 'Clinic'} Sessions` : 'Diagnostic Sessions'}
                </h1>
                <p className="text-xs text-slate-500 mt-1">

                </p>
            </div>

            {loadError && <p role="alert" className="text-sm text-rose-700">Could not refresh session data. Retrying automatically.</p>}
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(value) => router.replace(sessionsHref(value), { scroll: false })} className="w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <TabsList className="bg-white/10 p-1.5 rounded-full border border-white/20 inline-flex shadow-xs max-w-full">
                        {(['total', 'active', 'completed'] as const).map(tab => (
                            <TabsTrigger key={tab} value={tab} className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold rounded-full px-3 sm:px-6 py-2.5 data-active:bg-white">
                                {tab === 'total' ? 'Total' : tab === 'active' ? 'Active' : 'Completed'}
                                <span className="rounded-full bg-[#f2ede0] px-1.5 py-0.5 text-[11px] tabular-nums text-[#080e1e]">{loading ? '?' : tabCounts[tab]}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div className="flex items-center gap-2 flex-1 sm:max-w-md">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search patient, clinic, or package..."
                                className="pl-10 h-10 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-full text-xs font-medium focus:border-[#080e1e]"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {searchQuery && (
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 rounded-full" onClick={() => setSearchQuery('')}>
                                <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Total and active sessions share the same table and actions. */}
                {(['total', 'active'] as const).map(tab => {
                    const sessions = tab === 'total' ? filteredWorkflows : active;
                    return <TabsContent key={tab} value={tab} className="mt-0">
                    <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                            <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                <Timer className="w-4 h-4 text-[#cbb28d]" /> {tab === 'total' ? 'All Sessions' : 'Active Session Queue'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-12 text-center text-slate-500 text-xs italic">Loading sessions...</div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                        <TableRow>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Patient Name</TableHead>
                                            {isAdmin && <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Clinic</TableHead>}
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Test Package</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Current Status</TableHead>
                                            <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Last Updated</TableHead>
                                            <TableHead className="text-right font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] pr-6">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessions.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 6 : 5} className="h-24 text-center text-slate-500 italic text-xs">
                                                    {tab === 'total' ? 'No sessions found.' : 'No active sessions found.'}
                                                </TableCell>
                                            </TableRow>
                                        ) : sessions.map(w => {
                                            const badgeInfo = EXECUTIVE_STATUS_BADGES[w.status] || { bg: 'bg-[#080e1e]', text: 'text-[#cbb28d]', label: w.status };
                                            return (
                                                <TableRow key={w.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                                    <TableCell className="font-bold text-xs text-[#080e1e]">
                                                        {w.patient ? `${w.patient.first_name} ${w.patient.last_name}` : '—'}
                                                    </TableCell>
                                                    {isAdmin && (
                                                        <TableCell className="text-xs text-slate-700 font-medium">
                                                            {w.clinic?.name || '—'}
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-xs text-slate-700 font-medium">{w.test_type || 'Not specified'}</TableCell>
                                                    <TableCell>
                                                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${badgeInfo.bg} ${badgeInfo.text}`}>
                                                            {badgeInfo.label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-500 font-mono">
                                                        {new Date(w.updated_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6 space-x-1">
                                                        <Link
                                                            href={`/dashboard/patients/${w.patient_id}?tab=history`}
                                                            aria-label={`View status history for ${w.patient?.first_name || ''} ${w.patient?.last_name || ''}`.trim()}
                                                            className="inline-flex h-9 min-w-[104px] items-center justify-between gap-2 rounded-full border border-[#d8c6a7] bg-[#faf7f0] py-1 pl-1 pr-3 align-middle text-xs font-bold text-[#080e1e] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c7657]"
                                                        >
                                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#080e1e]">
                                                                <Eye className="h-3.5 w-3.5 text-[#dfc59e]" aria-hidden="true" />
                                                            </span>
                                                            <span>View</span>
                                                            <ChevronRight className="h-3 w-3 text-[#8c7657]" aria-hidden="true" />
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>;
                })}

                {/* Completed Tab */}
                <TabsContent value="completed" className="mt-0">
                    <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                            <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#cbb28d]" /> Completed Sessions Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                    <TableRow>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Patient Name</TableHead>
                                        {isAdmin && <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Clinic</TableHead>}
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Test Package</TableHead>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Completed Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {completed.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center text-slate-500 italic text-xs">
                                                No completed sessions found.
                                            </TableCell>
                                        </TableRow>
                                    ) : completed.map(w => (
                                        <TableRow key={w.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                            <TableCell className="font-bold text-xs text-[#080e1e]">
                                                {w.patient ? `${w.patient.first_name} ${w.patient.last_name}` : '—'}
                                            </TableCell>
                                            {isAdmin && <TableCell className="text-xs text-slate-700 font-medium">{w.clinic?.name || '—'}</TableCell>}
                                            <TableCell className="text-xs text-slate-700 font-medium">{w.test_type || 'Not specified'}</TableCell>
                                            <TableCell>
                                                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-200 text-slate-800">Completed</span>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500 font-mono">{new Date(w.updated_at).toLocaleDateString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

        </div>
    );
}


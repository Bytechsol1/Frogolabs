'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
    FlaskConical, Eye, Send, FileText,
    Clock, Search, RotateCcw, Building2, Calendar,
    BarChart3, AlertCircle, KeyRound, Check, Mail, Loader2, Link2
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from '@/context/AuthContext';
import { getPatientDisplayId } from '@/lib/utils';
import { LabReportPreview } from '@/components/patients/LabReportPreview';
import axios from 'axios';

const API = '/api/v1';
const PATIENT_PORTAL_PATH = '/patient/results';
const ORDER_TIME_ZONE = 'America/Chicago';

function patientAge(patient: { dob?: string | null; age?: number | null }) {
    if (patient.dob) {
        const birthDate = new Date(`${patient.dob.slice(0, 10)}T00:00:00`);
        const today = new Date();
        if (Number.isFinite(birthDate.getTime()) && birthDate <= today) {
            const birthdayPending = today.getMonth() < birthDate.getMonth() ||
                (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
            return `${today.getFullYear() - birthDate.getFullYear() - Number(birthdayPending)} years`;
        }
    }
    return patient.age != null && patient.age >= 0 ? `${patient.age} years` : 'Not available';
}

function orderTimestamp(value?: string | null): Date | null {
    return value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
}

function OrderTime({ orderedAt }: { orderedAt?: string | null }) {
    const ordered = orderTimestamp(orderedAt);
    return (
        <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
            <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#cbb28d]" /> Time
            </span>
            <time dateTime={ordered?.toISOString()} title="Lab test ordered at (Texas Central Time)" className="block font-bold text-xs text-[#080e1e] font-mono tabular-nums">
                {ordered?.toLocaleTimeString('en-US', { timeZone: ORDER_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' }) ?? 'Not available'}
            </time>
        </div>
    );
}

type PendingPatient = {
    id: string;
    first_name: string;
    last_name: string;
    created_at: string;
    clinic: { name: string };
    test_name: string | null;
    awaiting_order: boolean;
};

const STATUS_BADGES: Record<string, string> = {
    'Pending': 'bg-amber-950/20 text-amber-900 border border-amber-900/30',
    'Available': 'bg-sky-950/20 text-sky-900 border border-sky-900/30',
    'Reviewed': 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30',
    'Sent to Clinic': 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-bold',
};

export default function LabResultsPage() {
    return <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading...</div>}><LabResultsContent /></Suspense>;
}

function LabResultsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const selectedTab = searchParams.get('tab');
    const activeTab = selectedTab === 'pending' ? 'pending' : 'all';
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const clinicId = isAdmin ? searchParams.get('clinic_id') : null;
    const overviewUrl = `${API}/lab-results/overview${clinicId ? `?clinic_id=${encodeURIComponent(clinicId)}` : ''}`;
    const resultsHref = (tab: string) => `/dashboard/lab-results?tab=${tab}${clinicId ? `&clinic_id=${encodeURIComponent(clinicId)}` : ''}`;
    const isClinicUser = user?.role === 'CLINIC_USER';
    // Generate Access is available to both roles. ADMIN's
    // own gating stays untouched — this only adds clinic-user visibility.
    const canManageResults = isAdmin || isClinicUser;

    const [results, setResults] = useState<any[]>([]);
    const [pendingPatients, setPendingPatients] = useState<PendingPatient[]>([]);
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const requestVersion = useRef(0);

    // Detail Drawer State
    const [selectedResult, setSelectedResult] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Patient Access Modal State
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [accessResult, setAccessResult] = useState<any>(null);
    const [accessData, setAccessData] = useState<any>(null);
    const [accessLoading, setAccessLoading] = useState(false);
    const [accessError, setAccessError] = useState('');
    const [regenLoading, setRegenLoading] = useState(false);
    const [copiedField, setCopiedField] = useState<'resultId' | 'accessCode' | 'portalLink' | null>(null);

    useEffect(() => {
        if (!copiedField) return;
        const timer = window.setTimeout(() => setCopiedField(null), 2000);
        return () => window.clearTimeout(timer);
    }, [copiedField]);
    const [sendPatientLoading, setSendPatientLoading] = useState(false);
    const [sendPatientMessage, setSendPatientMessage] = useState('');
    const [sendPatientError, setSendPatientError] = useState('');

    const authHeader = useMemo(() => ({ Authorization: `Bearer ${user?.token}` }), [user?.token]);

    // Resolves to the current origin (localhost in dev, the real domain in production/Vercel)
    const [portalLink, setPortalLink] = useState(PATIENT_PORTAL_PATH);
    useEffect(() => {
        setPortalLink(`${window.location.origin}${PATIENT_PORTAL_PATH}`);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user?.token) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const version = ++requestVersion.current;
        try {
            const { data } = await axios.get(overviewUrl, { headers: authHeader });
            if (version !== requestVersion.current) return;
            setResults(data.results);
            setPendingPatients(data.pendingPatients);
            setLoadError('');
        } catch (err) {
            if (version !== requestVersion.current) return;
            setLoadError('Could not refresh lab results. Please try again.');
            console.error("Failed to load lab results", err);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, [user?.token, authHeader, overviewUrl]);

    useEffect(() => {
        setResults([]);
        setPendingPatients([]);
        setSelectedResult(null);
        setIsDrawerOpen(false);
        void fetchData();
        return () => { requestVersion.current++; };
    }, [fetchData]);

    useEffect(() => {
        if (!user?.token) return;
        const controller = new AbortController();
        const refreshResults = async () => {
            if (document.visibilityState !== 'visible') return;
            const version = requestVersion.current;
            try {
                const { data } = await axios.get(overviewUrl, { headers: authHeader, signal: controller.signal });
                if (controller.signal.aborted || version !== requestVersion.current) return;
                setResults(data.results);
                setPendingPatients(data.pendingPatients);
                setLoadError('');
                setSelectedResult((current: any) => current ? data.results.find((result: any) => result.id === current.id) || current : null);
            } catch { if (!controller.signal.aborted) setLoadError('Could not refresh lab results. Displaying the last update.'); }
        };
        const timer = window.setInterval(refreshResults, 30000);
        window.addEventListener('focus', refreshResults);
        document.addEventListener('visibilitychange', refreshResults);
        return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refreshResults); document.removeEventListener('visibilitychange', refreshResults); };
    }, [user?.token, authHeader, overviewUrl]);

    const openAccessModal = async (r: any) => {
        setAccessResult(r);
        setAccessData(null);
        setAccessError('');
        setCopiedField(null);
        setSendPatientMessage('');
        setSendPatientError('');
        setIsAccessModalOpen(true);
        setAccessLoading(true);
        try {
            const res = await axios.post(`${API}/lab-results/${r.id}/access`, {}, { headers: authHeader });
            setAccessData(res.data);
        } catch (err: any) {
            setAccessError(err?.response?.data?.message || 'Failed to generate access.');
        } finally {
            setAccessLoading(false);
        }
    };

    const handleRegenerateAccess = async () => {
        if (!accessResult) return;
        setRegenLoading(true);
        setAccessError('');
        setCopiedField(null);
        setSendPatientMessage('');
        setSendPatientError('');
        try {
            const res = await axios.post(`${API}/lab-results/${accessResult.id}/access/regenerate`, {}, { headers: authHeader });
            setAccessData(res.data);
        } catch (err: any) {
            setAccessError(err?.response?.data?.message || 'Failed to regenerate access.');
        } finally {
            setRegenLoading(false);
        }
    };

    const handleCopyField = async (field: 'resultId' | 'accessCode' | 'portalLink') => {
        const value = field === 'portalLink' ? portalLink : accessData?.[field];
        if (!value) return;
        setAccessError('');
        try {
            await navigator.clipboard.writeText(String(value));
            setCopiedField(field);
        } catch {
            setCopiedField(null);
            setAccessError('Could not copy to clipboard. Please select the value and copy manually.');
        }
    };

    const handleSendToPatient = async () => {
        if (!accessResult || !accessData?.accessCode) return;
        setSendPatientLoading(true);
        setSendPatientMessage('');
        setSendPatientError('');
        try {
            const res = await axios.post(
                `${API}/lab-results/${accessResult.id}/access/send`,
                { access_code: accessData.accessCode },
                { headers: authHeader }
            );
            setSendPatientMessage(
                res.data.emailConfigured
                    ? `Sent to ${res.data.patientEmail}.`
                    : `Logged to server console for ${res.data.patientEmail} (email delivery is not configured in this environment).`
            );
        } catch (err: any) {
            setSendPatientError(err?.response?.data?.message || 'Failed to send access details to patient.');
        } finally {
            setSendPatientLoading(false);
            await fetchData();
        }
    };

    const closeAccessModal = () => {
        setIsAccessModalOpen(false);
        setAccessResult(null);
        setAccessData(null);
        setAccessError('');
        setCopiedField(null);
        setSendPatientMessage('');
        setSendPatientError('');
        fetchData();
    };

    const filtered = useMemo(() => {
        if (!searchQuery) return results;
        const q = searchQuery.toLowerCase();
        return results.filter(r =>
            r.patient?.first_name?.toLowerCase().includes(q) ||
            r.patient?.last_name?.toLowerCase().includes(q) ||
            r.test_name?.toLowerCase().includes(q) ||
            r.status?.toLowerCase().includes(q) ||
            r.clinic?.name?.toLowerCase().includes(q)
        );
    }, [results, searchQuery]);

    const pending = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return pendingPatients.filter(patient => [
            `${patient.first_name} ${patient.last_name}`, patient.clinic.name,
            patient.id, getPatientDisplayId(patient.id), patient.test_name || '',
        ].some(value => value.toLowerCase().includes(q)));
    }, [pendingPatients, searchQuery]);

    return (
        <div className="min-w-0 space-y-8 animate-in fade-in duration-500 max-w-full pb-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    {clinicId && <Link href={`/dashboard/clinics/${encodeURIComponent(clinicId)}`} className="inline-block mb-3 text-sm text-slate-600 hover:underline">Back to clinic</Link>}
                    <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                        {clinicId ? 'Clinic Lab Results' : 'Lab Results Center'}
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">

                    </p>
                </div>
            </div>

            {/* Off-White & Cream Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <SummaryCard title="Total Reports" value={results.length} icon={FlaskConical} href={resultsHref('all')} onClick={() => setSearchQuery('')} />
                <SummaryCard title="Awaiting Test Orders" value={pendingPatients.length} icon={Clock} href={resultsHref('pending')} onClick={() => setSearchQuery('')} />
            </div>

            {loadError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{loadError}</p>}
            {/* Tabs & Table */}
            <Tabs value={activeTab} onValueChange={(value) => router.replace(resultsHref(value), { scroll: false })} className="w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <TabsList className="bg-white/10 p-1 rounded-full border border-white/20 flex-wrap shadow-xs">
                        <TabsTrigger value="all" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-4 py-1.5 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                            All Results
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-4 py-1.5 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                            Awaiting Test Orders {pendingPatients.length > 0 && <Badge className="ml-1 px-1.5 py-0 text-[10px] bg-amber-950/20 text-amber-900 border-none">{pendingPatients.length}</Badge>}
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 flex-1 md:max-w-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search patient, clinic, ID..."
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

                <TabsContent value="all" className="mt-0">
                    <ResultTable data={filtered} loading={loading} canManage={canManageResults} openAccessModal={openAccessModal} setSelectedResult={setSelectedResult} setIsDrawerOpen={setIsDrawerOpen} />
                </TabsContent>
                <TabsContent value="pending" className="mt-0">
                    <PendingPatientsTable patients={pending} loading={loading} />
                </TabsContent>
            </Tabs>

            {/* Patient Access Modal */}
            <Dialog open={isAccessModalOpen} onOpenChange={(v) => { if (!v) closeAccessModal(); else setIsAccessModalOpen(true); }}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#080e1e] font-bold text-lg">
                            <KeyRound className="w-5 h-5 text-[#8c7657]" /> Patient Access
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            Secure Result ID &amp; Access Code for {accessResult ? `${accessResult.patient?.first_name} ${accessResult.patient?.last_name}` : 'this patient'}.
                        </DialogDescription>
                    </DialogHeader>

                    {accessLoading ? (
                        <div className="py-10 flex flex-col items-center gap-3 text-slate-500 text-xs font-bold">
                            <Loader2 className="w-6 h-6 animate-spin text-[#8c7657]" /> Generating secure access...
                        </div>
                    ) : accessError && !accessData ? (
                        <div className="py-2">
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {accessError}
                            </div>
                        </div>
                    ) : accessData ? (
                        <div className="space-y-4 py-1">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce]">
                                    <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block mb-1">Patient</span>
                                    <p className="text-xs font-bold text-[#080e1e] truncate">{accessResult?.patient?.first_name} {accessResult?.patient?.last_name}</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce]">
                                    <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block mb-1">Test Package</span>
                                    <p className="text-xs font-bold text-[#080e1e] truncate">{accessResult?.test_name || 'General'}</p>
                                </div>
                            </div>

                            <div className="relative p-4 pr-16 rounded-2xl bg-[#080e1e] border border-[#cbb28d]/20">
                                <span className="text-[9px] font-mono uppercase font-bold text-[#cbb28d] block mb-1.5">Result ID</span>
                                <p className="text-lg font-black tracking-[0.15em] text-white font-mono break-all select-text">{accessData.resultId}</p>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Copy Result ID"
                                    title={copiedField === 'resultId' ? 'Copied!' : 'Copy Result ID'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full text-[#cbb28d] hover:bg-white/10 hover:text-white"
                                    onClick={() => handleCopyField('resultId')}
                                >
                                    {copiedField === 'resultId' ? <Check className="size-4 text-emerald-400" /> : <Link2 className="size-4" />}
                                </Button>
                            </div>

                            {accessData.accessCode ? (
                                <div className="relative p-4 pr-16 rounded-2xl bg-[#080e1e] border border-[#cbb28d]/20">
                                    <span className="text-[9px] font-mono uppercase font-bold text-[#cbb28d] block mb-1.5">Access Code</span>
                                    <p className="text-2xl font-black tracking-[0.3em] text-white font-mono break-all select-text">{accessData.accessCode}</p>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Copy Access Code"
                                        title={copiedField === 'accessCode' ? 'Copied!' : 'Copy Access Code'}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full text-[#cbb28d] hover:bg-white/10 hover:text-white"
                                        onClick={() => handleCopyField('accessCode')}
                                    >
                                        {copiedField === 'accessCode' ? <Check className="size-4 text-emerald-400" /> : <Link2 className="size-4" />}
                                    </Button>
                                </div>
                            ) : (
                                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium space-y-2.5">
                                    <p>Access was already generated for this result. For security, the access code is shown only once and can&apos;t be retrieved again.</p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={regenLoading}
                                        className="rounded-full text-xs font-bold border-amber-300 bg-white gap-1.5"
                                        onClick={handleRegenerateAccess}
                                    >
                                        {regenLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                        {regenLoading ? 'Regenerating...' : 'Regenerate Access Code'}
                                    </Button>
                                </div>
                            )}

                            <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block mb-0.5">Patient Portal</span>
                                    <p className="text-xs font-bold text-[#080e1e] truncate">{portalLink}</p>
                                </div>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Copy Patient Portal link"
                                    title={copiedField === 'portalLink' ? 'Copied!' : 'Copy Patient Portal link'}
                                    className="size-9 shrink-0 rounded-full text-[#080e1e] hover:bg-white"
                                    onClick={() => handleCopyField('portalLink')}
                                >
                                    {copiedField === 'portalLink' ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />}
                                </Button>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold">
                                <Calendar className="w-3.5 h-3.5 text-[#8c7657]" /> Expires {new Date(accessData.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>

                            {accessData.accessCode && (
                                <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> This code will not be shown again — copy or send it now.
                                </p>
                            )}

                            {accessData.accessCode && !accessData.emailConfigured && (
                                <p className="text-[11px] text-amber-700 font-bold flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    <Mail className="w-3.5 h-3.5 shrink-0" /> Email delivery isn&apos;t configured in this environment — copy the Result ID and Access Code using the buttons above.
                                </p>
                            )}

                            <p role="status" className="sr-only">{copiedField ? `${copiedField === 'resultId' ? 'Result ID' : copiedField === 'accessCode' ? 'Access Code' : 'Patient Portal link'} copied.` : ''}</p>
                            {accessError && <p className="text-[11px] font-bold text-rose-600">{accessError}</p>}
                            {sendPatientMessage && <p className="text-[11px] font-bold text-emerald-700">{sendPatientMessage}</p>}
                            {sendPatientError && <p className="text-[11px] font-bold text-rose-600">{sendPatientError}</p>}
                        </div>
                    ) : null}

                    <DialogFooter className="gap-2 pt-2 flex-wrap">
                        <Button type="button" variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={closeAccessModal}>Close</Button>
                        {accessData?.accessCode && (
                                <Button
                                    type="button"
                                    disabled={sendPatientLoading}
                                    className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-1.5"
                                    onClick={handleSendToPatient}
                                >
                                    {sendPatientLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#cbb28d]" />}
                                    {sendPatientLoading ? 'Sending...' : 'Send to Patient'}
                                </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detail Drawer */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetContent className="gap-0 bg-white border-[#e4dec3] data-[side=right]:w-full data-[side=right]:sm:max-w-4xl overflow-y-auto">
                    <SheetHeader className="shrink-0 p-4 pr-12 sm:p-6 sm:pr-12 border-b border-[#e6e0ce]">
                        <SheetTitle className="text-[#080e1e] font-bold text-lg flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[#8c7657]" /> Lab Report
                        </SheetTitle>
                        <SheetDescription className="text-xs text-slate-500">
                            Review the patient&apos;s results and report directly here.
                        </SheetDescription>
                    </SheetHeader>

                    {selectedResult && (
                        <div className="min-w-0 shrink-0 space-y-5 p-4 sm:p-6 text-xs">
                            {/* Hero Patient Card */}
                            <div className="p-5 rounded-3xl bg-white border border-[#e4dec3]/70 shadow-[0_4px_20px_rgba(8,14,30,0.04)] space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="w-11 h-11 shrink-0 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-base flex items-center justify-center border-2 border-[#faf8f3] shadow-xs">
                                            {selectedResult.patient?.first_name?.[0]}{selectedResult.patient?.last_name?.[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="break-words font-extrabold text-[#080e1e] text-base">
                                                {selectedResult.patient?.first_name} {selectedResult.patient?.last_name}
                                            </h3>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono font-bold text-[#8c7657]">
                                                <span>Patient {selectedResult.patient?.id ? getPatientDisplayId(selectedResult.patient.id) : 'ID —'}</span>
                                                <span>Gender: <span className="capitalize">{selectedResult.patient?.gender || 'Not available'}</span></span>
                                                <span>Age: {patientAge(selectedResult.patient ?? {})}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${STATUS_BADGES[selectedResult.status] || 'bg-slate-200 text-slate-800'}`}>
                                        {selectedResult.status}
                                    </span>
                                </div>

                                {/* Metadata Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#e6e0ce]">
                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <Building2 className="w-3 h-3 text-[#cbb28d]" /> Clinic
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] truncate">
                                            {selectedResult.clinic?.name || 'Clinic not assigned'}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <FlaskConical className="w-3 h-3 text-[#cbb28d]" /> Test
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] truncate">
                                            {selectedResult.test_name || 'General Panel'}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-[#cbb28d]" /> Collection Date
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] font-mono">
                                            {orderTimestamp(selectedResult.ordered_at)?.toLocaleDateString('en-US', { timeZone: ORDER_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' }) ?? 'Not available'}
                                        </p>
                                    </div>

                                    <OrderTime orderedAt={selectedResult.ordered_at} />

                                </div>
                            </div>

                            {/* Internal Clinical Note */}
                            <div className="p-4 rounded-2xl bg-white border border-[#e4dec3]/70 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#080e1e]">
                                    <FileText className="w-4 h-4 text-[#8c7657]" />
                                    <span>Physician & Diagnostic Notes</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    {selectedResult.notes || 'Lab test results compiled and ready for physician review & transmission.'}
                                </p>
                            </div>

                            {/* Terra structured biomarker report */}
                            {selectedResult.source === 'TERRA' && selectedResult.structured_report && (
                                <div className="rounded-2xl border border-[#e4dec3]/70 overflow-hidden">
                                    {selectedResult.structured_report.isSandbox && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Terra sandbox demo: simulated results, not clinical results.</p>}
                                    {selectedResult.structured_report.isPartial && (
                                        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Partial results — some biomarkers may still be processing.
                                        </div>
                                    )}
                                    <table className="w-full text-left text-[11px]">
                                        <thead>
                                            <tr className="bg-[#f2ede0]/80 text-[9px] font-mono uppercase tracking-wider text-[#8c7657] font-bold">
                                                <th className="px-3 py-2">Biomarker</th>
                                                <th className="px-3 py-2">Result</th>
                                                <th className="px-3 py-2">Range</th>
                                                <th className="px-3 py-2">Flag</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e6e0ce]">
                                            {selectedResult.structured_report.biomarkers?.map((b: any, i: number) => {
                                                const abnormal = b.interpretation?.code && !['n', 'normal', 'not_escalated'].includes(String(b.interpretation.code).toLowerCase());
                                                return (
                                                    <tr key={i} className={abnormal ? 'bg-rose-50/60' : undefined}>
                                                        <td className="px-3 py-2 font-bold text-[#080e1e]">{b.name}</td>
                                                        <td className="px-3 py-2 font-mono font-bold text-[#080e1e]">{b.value ?? '—'} {b.unit || ''}</td>
                                                        <td className="px-3 py-2 font-mono text-slate-500">
                                                            {b.referenceRange ? `${b.referenceRange.low ?? ''}–${b.referenceRange.high ?? ''}` : '—'}
                                                        </td>
                                                        <td className={`px-3 py-2 font-bold ${abnormal ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                            {b.interpretation?.display || '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="space-y-2 pt-2">
                                {!(selectedResult.source === 'TERRA' && selectedResult.structured_report) && (
                                    <LabReportPreview report={selectedResult} />
                                )}

                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function PendingPatientsTable({ patients, loading }: { patients: PendingPatient[]; loading: boolean }) {
    return (
        <TableCard title="Awaiting Test Orders" icon={<Clock className="w-4 h-4 text-[#cbb28d]" />}>
            <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                <TableRow>
                    {['Patient', 'Clinic', 'Test Package', 'Status', 'Added Date', 'Actions'].map(title => (
                        <TableHead key={title} className={`font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] ${title === 'Actions' ? 'text-right' : ''}`}>{title}</TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">Loading patients awaiting test orders...</TableCell></TableRow>
                    : patients.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-xs text-slate-500">No patients awaiting test orders in this view.</TableCell></TableRow>
                    : patients.map(patient => (
                        <TableRow key={patient.id} data-pending-patient={patient.id} className="border-b border-[#e6e0ce]">
                            <TableCell className="text-xs text-[#080e1e]"><span className="font-bold">{patient.first_name} {patient.last_name}</span><span className="mt-1 block text-[10px] font-mono text-slate-500">{getPatientDisplayId(patient.id)}</span></TableCell>
                            <TableCell className="text-xs text-slate-700">{patient.clinic.name}</TableCell>
                            <TableCell className="text-xs text-slate-700">Not ordered yet</TableCell>
                            <TableCell><span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900">Awaiting Test Order</span></TableCell>
                            <TableCell className="text-xs font-mono text-slate-500">{new Date(patient.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</TableCell>
                            <TableCell className="text-right"><Link href={`/dashboard/patients/${patient.id}`} aria-label={`View ${patient.first_name} ${patient.last_name}`} className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border border-[#ded8c4] bg-white px-3 text-xs font-bold text-[#080e1e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c7657]"><Eye className="h-3.5 w-3.5 text-[#8c7657]" aria-hidden="true" />View Patient</Link></TableCell>
                        </TableRow>
                    ))}
            </TableBody>
        </TableCard>
    );
}

function ResultTable({ data, loading, canManage, openAccessModal, setSelectedResult, setIsDrawerOpen }: any) {
    const patientName = (r: any) => r?.patient ? `${r.patient.first_name} ${r.patient.last_name}` : '—';
    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return (
        <TableCard title="Lab Results Directory" icon={<BarChart3 className="w-4 h-4 text-[#cbb28d]" />}>
            <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                <TableRow>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Patient</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Test Package</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Uploaded Date</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-right pr-6">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-28 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20 rounded-full bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-28 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell className="text-right pr-6"><Skeleton className="h-7 w-20 ml-auto bg-[#e4dec3]/50" /></TableCell>
                            </TableRow>
                        ))}
                    </>
                ) : data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-500 text-xs italic">No lab results found in this view.</TableCell></TableRow>
                ) : data.map((r: any) => (
                    <TableRow key={r.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                        <TableCell className="font-bold text-xs text-[#080e1e]">{patientName(r)}</TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">{r.test_name || 'General'}</TableCell>
                        <TableCell>
                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${STATUS_BADGES[r.status] || 'bg-slate-200 text-slate-800'}`}>
                                {r.status}
                            </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{formatDate(r.uploaded_at)}</TableCell>
                        <TableCell className="text-right pr-6 space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#080e1e] hover:bg-white rounded-full" onClick={() => { setSelectedResult(r); setIsDrawerOpen(true); }}>
                                <Eye className="w-4 h-4 text-[#cbb28d]" />
                            </Button>
                            {canManage && (
                                <Button variant="outline" size="sm" className="h-8 text-xs font-bold gap-1 rounded-full bg-white border-[#ded8c4]" onClick={() => openAccessModal(r)}>
                                    <KeyRound className="w-3 h-3 text-[#8c7657]" /> Generate Access
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
    );
}

function SummaryCard({ title, value, caption, icon: Icon, href, onClick }: any) {
    return (
        <Link href={href} onClick={onClick} className="block min-w-0 h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8c7657]">
        <Card className="border border-[#e4dec3] ring-0 bg-white shadow-sm rounded-3xl overflow-hidden p-5 sm:p-6 gap-6 text-left h-full">
            <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3 text-xs font-bold text-slate-500">
                    <div className="p-3 shrink-0 rounded-2xl bg-[#080e1e] text-[#cbb28d] shadow-md">
                        <Icon className="w-5 h-5" />
                    </div>
                    <span className="uppercase text-xs font-bold tracking-wider text-[#080e1e] min-w-0 break-words">{title}</span>
                </div>
            </div>
            <div>
                <p className="text-3xl font-extrabold text-slate-900">{value}</p>
                {caption && <p className="mt-2 text-xs text-slate-500">{caption}</p>}
            </div>
        </Card>
        </Link>
    );
}

function TableCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="border border-[#e4dec3] ring-0 bg-white shadow-sm rounded-3xl overflow-hidden min-w-0">
            <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">{icon} {title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>{children}</Table>
            </CardContent>
        </Card>
    );
}

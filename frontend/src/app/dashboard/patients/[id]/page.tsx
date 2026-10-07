'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import {
    ChevronLeft,
    Calendar,
    Mail,
    Phone,
    FileText,
    History as HistoryIcon,
    CheckCircle2,
    Circle,
    Eye,
    FileUp,
    Activity,
    FlaskConical,
    PhoneCall,
    CalendarPlus
} from "lucide-react";
import { cn, getPatientDisplayId } from "@/lib/utils";
import { VitalsDashboard } from "@/components/vitals/VitalsDashboard";
import { OrderLabTestModal } from "@/components/patients/OrderLabTestModal";
import { TerraOrdersSection, TerraReportEmptyState } from "@/components/patients/TerraOrdersSection";
import { SandboxReportStatus } from "@/components/patients/SandboxReportStatus";
import { LabReportPreview, type LabReport } from "@/components/patients/LabReportPreview";

const WORKFLOW_STATUSES = [
    { key: 'PATIENT_CREATED', label: 'Patient Created' },
    { key: 'TEST_PACKAGE_SELECTED', label: 'Test Package Selected' },
    { key: 'TASSO_INSTRUCTIONS_SENT', label: 'Instructions Sent' },
    { key: 'KIT_SHIPPED', label: 'Kit Shipped' },
    { key: 'SAMPLE_COLLECTED', label: 'Sample Collected' },
    { key: 'LAB_PROCESSING', label: 'Lab Processing' },
    { key: 'RESULTS_READY', label: 'Results Ready' },
    { key: 'COMPLETED', label: 'Completed' },
];

export default function PatientDetailsPage() {
    return <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading patient...</div>}><PatientDetailsContent /></Suspense>;
}

function PatientDetailsContent() {
    const searchParams = useSearchParams();
    const requestedReportId = searchParams.get('report');
    const [selectedTab, setSelectedTab] = useState(() => {
        const tab = searchParams.get('tab');
        return tab && ['vitals', 'history', 'results', 'notes'].includes(tab) ? tab : 'vitals';
    });
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const { id } = useParams();
    const { user } = useAuth();
    const router = useRouter();
    const [patient, setPatient] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshFailed, setRefreshFailed] = useState(false);
    const [orderSuccessMessage, setOrderSuccessMessage] = useState('');
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    useEffect(() => {
        const tab = searchParams.get('tab');
        setSelectedTab(tab && ['vitals', 'history', 'results', 'notes'].includes(tab) ? tab : 'vitals');
        setSelectedReportId(tab === 'results' ? searchParams.get('report') : null);
    }, [searchParams]);

    const fetchPatient = useCallback(async () => {
        if (!user?.token || !id) return;
        try {
            const res = await axios.get(`/api/v1/patients/${id}`, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            setPatient(res.data);
            setLastRefreshed(new Date());
            setRefreshFailed(false);
        } catch (err) {
            setRefreshFailed(true);
            console.error("Failed to load patient details", err);
        } finally {
            setLoading(false);
        }
    }, [id, user?.token]);

    useEffect(() => {
        fetchPatient();
        const refresh = () => { if (document.visibilityState === 'visible') void fetchPatient(); };
        const timer = window.setInterval(refresh, 30000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [fetchPatient, requestedReportId]);

    const activeWorkflow = useMemo(() => {
        return patient?.workflows?.[0];
    }, [patient]);

    const historyStages = useMemo(() => {
        const history: { id: string; status: string; created_at: string; notes?: string | null; user?: { name: string } | null }[] = activeWorkflow?.history || [];
        const order = patient?.terraOrders?.find((item: { workflow_id?: string }) => item.workflow_id === activeWorkflow?.id);
        return WORKFLOW_STATUSES.flatMap(stage => {
            const events = history.filter(event => event.status === stage.key)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            if (events.length) return events.map(event => ({
                id: event.id, key: stage.key, label: stage.label, pending: false, notApplicable: false,
                simulated: event.notes?.startsWith('Sandbox demo:') === true,
                updatedBy: event.notes?.startsWith('Sandbox demo:') ? 'Sandbox demo' : event.user?.name || (stage.key === 'PATIENT_CREATED' ? 'Frigo Flow' : 'Terra'),
                date: event.created_at,
            }));
            // Registration is a real patient event even if an older session never
            // wrote a separate PATIENT_CREATED entry. Never invent stage times.
            const registered = stage.key === 'PATIENT_CREATED' && !!patient?.created_at;
            const notApplicable = stage.key === 'KIT_SHIPPED' && order?.collection_type === 'GO_TO_LAB';
            return [{
                id: stage.key, key: stage.key, label: stage.label, pending: !registered, notApplicable,
                simulated: false,
                updatedBy: registered ? 'Frigo Flow' : null,
                date: registered ? patient.created_at as string : null,
            }];
        });
    }, [activeWorkflow, patient]);

    const reports = useMemo<LabReport[]>(() => {
        return [...(patient?.results || [])].sort((a, b) =>
            new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        );
    }, [patient]);
    const selectedReport = reports.find(report => report.id === selectedReportId);

    const age = useMemo(() => {
        if (typeof patient?.age === 'number') return patient.age;
        if (!patient?.dob) return null;
        const dob = new Date(patient.dob);
        const diff = Date.now() - dob.getTime();
        return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    }, [patient]);

    if (loading) return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
            <Skeleton className="h-10 w-48 rounded-full bg-[#e4dec3]/50" />
            <Skeleton className="h-64 w-full rounded-3xl bg-white shadow-xs" />
        </div>
    );
    if (!patient) return <div className="p-8 text-rose-700 font-bold">Diagnostic record not found.</div>;

    const mockPatientId = getPatientDisplayId(patient.id);

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500 pb-8">
            {/* Navigation Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#080e1e] hover:bg-slate-200 px-4 py-2 rounded-full transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">Patient Card</h1>
                </div>

                <div className="flex items-center gap-2">
                    {user?.role === 'CLINIC_USER' && (
                        <OrderLabTestModal
                            patient={patient}
                            onOrderCreated={() => {
                                setOrderSuccessMessage('Lab test order placed successfully with Terra Vantage.');
                                void fetchPatient();
                            }}
                        />
                    )}
                </div>
            </div>

            {orderSuccessMessage && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    <span>{orderSuccessMessage}</span>
                    <button onClick={() => setOrderSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 font-mono">✕</button>
                </div>
            )}

            {/* Patient Hero Card */}
            <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    
                    {/* Left Avatar & Quick Contact Buttons */}
                    <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 rounded-3xl bg-white/60 border border-[#e6e0ce] space-y-4">
                        <div className="w-24 h-24 rounded-full bg-[#080e1e] text-[#cbb28d] font-extrabold text-3xl flex items-center justify-center border-4 border-[#faf8f3] shadow-md">
                            {patient.first_name[0]}{patient.last_name[0]}
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-extrabold text-[#080e1e]">{patient.first_name} {patient.last_name}</h2>
                            <p className="text-xs font-bold text-[#8c7657] font-mono mt-0.5">{mockPatientId}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 w-full pt-1">
                            <a href={`tel:${patient.phone}`} className="w-full">
                                <Button size="sm" className="w-full bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-1.5 h-9">
                                    <PhoneCall className="w-3.5 h-3.5 text-[#cbb28d]" /> Call
                                </Button>
                            </a>
                            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                                <DialogTrigger render={<Button size="sm" variant="outline" className="w-full bg-white border-[#ded8c4] text-[#080e1e] font-bold text-xs rounded-full gap-1.5 h-9" />}>
                                    <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                                </DialogTrigger>
                                <DialogContent className="gap-6 rounded-3xl border border-[#e4dec3] bg-white p-6 text-[#080e1e] shadow-xl ring-0 sm:max-w-md sm:p-8">
                                    <DialogHeader>
                                        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#080e1e] text-[#cbb28d]">
                                            <CalendarPlus className="h-6 w-6" aria-hidden="true" />
                                        </span>
                                        <DialogTitle className="text-xl font-bold">Schedule Appointment</DialogTitle>
                                        <DialogDescription className="break-words text-sm text-slate-500">
                                            {patient.first_name} {patient.last_name}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="rounded-2xl border border-[#e6e0ce] bg-[#faf8f3] px-5 py-7 text-center">
                                        <p className="text-xl font-bold text-[#080e1e]">Coming Soon</p>
                                        <p className="mt-2 text-sm leading-relaxed text-slate-500">Appointment scheduling will be available here soon.</p>
                                    </div>
                                    <DialogClose render={<Button className="h-11 w-full rounded-full bg-[#080e1e] font-semibold text-white hover:bg-[#121c36]" />}>Close</DialogClose>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Right Key Patient Metrics Grid */}
                    <div className="min-w-0 lg:col-span-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-[#8c7657] font-mono block">{mockPatientId}</span>
                                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">{patient.first_name} {patient.last_name}</h1>
                            </div>
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30">
                                FrigoFlow Session: {WORKFLOW_STATUSES.find(s => s.key === activeWorkflow?.status)?.label || activeWorkflow?.status?.replace(/_/g, ' ') || 'Active Under Treatment'}
                            </span>
                        </div>

                        {/* Metric Columns */}
                        <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-x-6 gap-y-4 px-6 py-4 rounded-2xl bg-white/60 border border-[#e6e0ce] text-left">
                            <div className="min-w-0 space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gender</span>
                                <span className="block text-sm font-bold text-[#080e1e] break-words">{patient.gender || 'Not specified'}</span>
                            </div>
                            <div className="min-w-0 space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Age</span>
                                <span className="block text-sm font-bold text-[#080e1e] break-words">{age ?? 'Not specified'}</span>
                            </div>
                            <div className="min-w-0 space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Primary Diagnosis</span>
                                <span className="block text-sm font-bold text-[#080e1e] break-words">{activeWorkflow?.test_type || 'Not specified'}</span>
                            </div>
                            <div className="min-w-0 space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Last Visit</span>
                                <span className="block text-sm font-bold text-[#080e1e] tabular-nums">{new Date(patient.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </Card>

            {/* Main Tabs Container */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
                <TabsList className="bg-white/10 p-1 rounded-full border border-white/20 inline-flex shadow-xs">
                    <TabsTrigger value="vitals" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-5 py-2 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                        Vitals & Telemetry
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-5 py-2 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                        Status History
                    </TabsTrigger>
                    <TabsTrigger value="results" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-5 py-2 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                        Lab Reports
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs font-bold text-black hover:text-black dark:text-black dark:hover:text-black rounded-full px-5 py-2 data-active:bg-white data-active:text-black dark:data-active:text-black transition-none">
                        Physician Notes
                    </TabsTrigger>
                </TabsList>

                {/* Vitals Tab */}
                <TabsContent value="vitals" className="animate-in fade-in duration-300">
                    <VitalsDashboard
                        patientId={patient.id}
                        patientName={`${patient.first_name} ${patient.last_name}`}
                        marketplaceUrl={patient.validic_marketplace_url}
                        validicUserId={patient.validic_user_id}
                    />
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="animate-in fade-in duration-300">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] overflow-hidden">
                        <CardHeader className="border-b border-[#e6e0ce] bg-white/60">
                            <CardTitle className="text-base font-bold text-[#080e1e]">FrigoFlow Session History</CardTitle>
                            <p className="text-xs text-slate-500">All stages are shown below. Refreshes every 30 seconds; pending stages update when confirmed.</p>
                            {lastRefreshed && <p className="text-[11px] text-[#8c7657]">Last checked: {lastRefreshed.toLocaleTimeString()}</p>}
                            {refreshFailed && <p role="alert" className="text-xs text-rose-700">Could not refresh status. Retrying automatically.</p>}
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                    <TableRow>
                                        <TableHead className="pl-5 font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Updated By</TableHead>
                                        <TableHead className="pr-5 font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-right">Date & Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyStages.map(stage => (
                                        <TableRow key={stage.id} data-stage={stage.key} data-state={stage.notApplicable ? 'not-applicable' : stage.pending ? 'pending' : 'confirmed'} className="border-b border-[#e6e0ce]">
                                            <TableCell className="pl-5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${stage.pending ? 'border border-[#e6e0ce] bg-[#faf9f6] text-slate-500' : 'bg-[#080e1e] text-[#cbb28d]'}`}>
                                                        {stage.pending ? <Circle className="h-3 w-3 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />}
                                                        {stage.label}
                                                    </span>
                                                    {stage.pending && <span className="text-[11px] text-slate-500">{stage.notApplicable ? 'Not applicable' : 'Pending confirmation'}</span>}
                                                    {stage.simulated && <span className="text-[11px] text-amber-700">Simulated · no message sent</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs font-bold text-[#080e1e]">{stage.updatedBy || '—'}</TableCell>
                                            <TableCell className="pr-5 text-right text-xs text-slate-500 font-mono">
                                                {stage.date ? new Date(stage.date).toLocaleString() : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Lab Results Tab */}
                <TabsContent value="results" className="animate-in fade-in duration-300 space-y-6">
                    <SandboxReportStatus jobs={patient.sandboxReportJobs || []} onRefresh={fetchPatient} />
                    <TerraOrdersSection orders={patient.terraOrders || []} onRefresh={fetchPatient} />

                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-[#080e1e]">Diagnostic Reports</h3>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            {reports.map((res) => (
                                <button
                                    type="button"
                                    key={res.id}
                                    aria-pressed={selectedReport?.id === res.id}
                                    aria-expanded={selectedReport?.id === res.id}
                                    onClick={() => setSelectedReportId(current => current === res.id ? null : res.id)}
                                    className={cn("flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#8c7657]", selectedReport?.id === res.id ? "bg-[#faf8f3] border-[#8c7657]" : "bg-white/60 border-[#e6e0ce] hover:bg-[#faf8f3]")}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-[#080e1e] text-[#cbb28d]">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-[#080e1e]">{res.test_name || 'Diagnostic Lab Report'}</p>
                                            <p className="text-[10px] text-slate-500">{new Date(res.uploaded_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#8c7657]">
                                        <Eye className="w-4 h-4" /> {selectedReport?.id === res.id ? 'Hide' : 'View'}
                                    </span>
                                </button>
                            ))}
                            {!reports.length && (
                                <div className="md:col-span-2 p-12 text-center text-slate-500 text-xs italic">
                                    <TerraReportEmptyState orders={patient.terraOrders || []} />
                                </div>
                            )}
                        </div>
                        {selectedReport && (
                            <section aria-label="Selected lab report" className="space-y-4 border-t border-[#e6e0ce] pt-5">
                                <div>
                                    <h4 className="text-sm font-bold text-[#080e1e]">{selectedReport.test_name || 'Diagnostic Lab Report'}</h4>
                                    <p className="mt-1 text-xs text-slate-500">{new Date(selectedReport.result_date || selectedReport.uploaded_at).toLocaleDateString()}</p>
                                </div>
                                <LabReportPreview report={selectedReport} />
                                {selectedReport.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{selectedReport.notes}</p>}
                            </section>
                        )}
                    </Card>
                </TabsContent>

                {/* Physician Notes Tab */}
                <TabsContent value="notes" className="animate-in fade-in duration-300">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <h3 className="text-base font-bold text-[#080e1e]">Physician Notes</h3>
                        <textarea
                            className="w-full min-h-[160px] p-4 rounded-2xl bg-white border border-[#ded8c4] text-xs font-medium text-[#080e1e] focus:border-[#080e1e] outline-none"
                            placeholder="Type internal diagnostic notes here..."
                        />
                        <div className="flex justify-end">
                            <Button className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full px-6 h-10 shadow-xs">
                                Save Notes
                            </Button>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

        </div>
    );
}

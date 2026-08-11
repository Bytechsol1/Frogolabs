'use client';

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    ChevronLeft,
    Calendar,
    Mail,
    Phone,
    FileText,
    History as HistoryIcon,
    CheckCircle2,
    Circle,
    Download,
    FileUp,
    Activity,
    FlaskConical,
    ClipboardList,
    PhoneCall,
    CalendarPlus
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { VitalsDashboard } from "@/components/vitals/VitalsDashboard";
import { Input } from "@/components/ui/input";

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
    const { id } = useParams();
    const { user } = useAuth();
    const router = useRouter();
    const [patient, setPatient] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isUpdateOpen, setIsUpdateOpen] = useState(false);
    const [newStatus, setNewStatus] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchPatient = useCallback(async () => {
        if (!user?.token || !id) return;
        try {
            const res = await axios.get(`/api/v1/patients/${id}`, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            setPatient(res.data);
        } catch (err) {
            console.error("Failed to load patient details", err);
        } finally {
            setLoading(false);
        }
    }, [id, user?.token]);

    useEffect(() => {
        fetchPatient();
    }, [fetchPatient]);

    const activeWorkflow = useMemo(() => {
        return patient?.workflows?.[0];
    }, [patient]);

    if (loading) return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
            <Skeleton className="h-10 w-48 rounded-full bg-[#e4dec3]/50" />
            <Skeleton className="h-64 w-full rounded-3xl bg-white shadow-xs" />
        </div>
    );
    if (!patient) return <div className="p-8 text-rose-700 font-bold">Diagnostic record not found.</div>;

    const mockPatientId = `ID ${1000000 + (parseInt(patient.id.slice(-4), 16) || 4762391)}`;

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
                    {user?.role === 'ADMIN' && activeWorkflow && (
                        <Button
                            size="sm"
                            className="gap-2 bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full h-9 px-4 shadow-xs"
                            onClick={() => { setNewStatus(activeWorkflow.status); setStatusNote(''); setIsUpdateOpen(true); }}
                        >
                            <ClipboardList className="w-4 h-4 text-[#cbb28d]" /> Update Workflow
                        </Button>
                    )}
                </div>
            </div>

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
                            <Button size="sm" variant="outline" className="w-full bg-white border-[#ded8c4] text-[#080e1e] font-bold text-xs rounded-full gap-1.5 h-9" onClick={() => alert('Appointment schedule feature coming soon!')}>
                                <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                            </Button>
                        </div>
                    </div>

                    {/* Right Key Patient Metrics Grid */}
                    <div className="lg:col-span-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-[#8c7657] font-mono block">{mockPatientId}</span>
                                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">{patient.first_name} {patient.last_name}</h1>
                            </div>
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30">
                                {WORKFLOW_STATUSES.find(s => s.key === activeWorkflow?.status)?.label || activeWorkflow?.status?.replace(/_/g, ' ') || 'Active Under Treatment'}
                            </span>
                        </div>

                        {/* Metric Columns */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-white/60 border border-[#e6e0ce] text-center sm:text-left">
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gender</span>
                                <span className="text-sm font-bold text-[#080e1e]">Female</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Age</span>
                                <span className="text-sm font-bold text-[#080e1e]">34</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Primary Diagnosis</span>
                                <span className="text-sm font-bold text-[#080e1e]">{activeWorkflow?.test_type || 'Hypertension'}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Last Visit</span>
                                <span className="text-sm font-bold text-[#080e1e]">{new Date(patient.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>

                        {/* Status Note Pill */}
                        <div className="p-3 rounded-2xl bg-white border border-[#ded8c4] text-xs font-medium text-[#080e1e] flex items-center justify-between">
                            <span>Patient shows steady biometric progress with current treatment plan.</span>
                            <ChevronLeft className="w-4 h-4 rotate-180 text-[#8c7657]" />
                        </div>
                    </div>

                </div>
            </Card>

            {/* Main Tabs Container */}
            <Tabs defaultValue="vitals" className="space-y-6">
                <TabsList className="bg-white/10 p-1 rounded-full border border-white/20 inline-flex shadow-xs">
                    <TabsTrigger value="vitals" className="text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                        Vitals & Telemetry
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                        Status History
                    </TabsTrigger>
                    <TabsTrigger value="results" className="text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                        Lab Reports
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs font-bold text-slate-300 rounded-full px-5 py-2 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
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
                            <CardTitle className="text-base font-bold text-[#080e1e]">Status History Log</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                    <TableRow>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Updated By</TableHead>
                                        <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-right">Date & Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activeWorkflow?.history.map((h: any) => (
                                        <TableRow key={h.id} className="border-b border-[#e6e0ce] hover:bg-[#f3eee0]">
                                            <TableCell>
                                                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#080e1e] text-[#cbb28d]">
                                                    {h.status.replace(/_/g, ' ')}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs font-bold text-[#080e1e]">{h.user.name}</TableCell>
                                            <TableCell className="text-right text-xs text-slate-500 font-mono">
                                                {new Date(h.created_at).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!activeWorkflow?.history.length && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-slate-500 italic text-xs">No status history logged.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Lab Results Tab */}
                <TabsContent value="results" className="animate-in fade-in duration-300">
                    <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-[#080e1e]">Diagnostic Reports</h3>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            {activeWorkflow?.results.map((res: any) => (
                                <div key={res.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/60 border border-[#e6e0ce]">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-[#080e1e] text-[#cbb28d]">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-[#080e1e]">Diagnostic Lab Report</p>
                                            <p className="text-[10px] text-slate-500">{new Date(res.uploaded_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="text-[#080e1e] hover:bg-white rounded-full" onClick={() => window.open(res.file_url)}>
                                        <Download className="w-4 h-4 text-[#cbb28d]" />
                                    </Button>
                                </div>
                            ))}
                            {!activeWorkflow?.results.length && (
                                <div className="md:col-span-2 p-12 text-center text-slate-500 text-xs italic">
                                    No lab result files attached.
                                </div>
                            )}
                        </div>
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

            {/* Status Update Modal */}
            <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="text-[#080e1e] font-bold">Update Workflow Stage</DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            Advance workflow stage for {patient.first_name} {patient.last_name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-[#8c7657] uppercase">Target Status</label>
                            <select
                                className="w-full bg-white border border-[#ded8c4] rounded-xl px-3 py-2 text-xs font-bold text-[#080e1e] outline-none"
                                value={newStatus}
                                onChange={e => setNewStatus(e.target.value)}
                            >
                                {WORKFLOW_STATUSES.map(s => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={() => setIsUpdateOpen(false)}>Cancel</Button>
                        <Button
                            disabled={saving}
                            className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full"
                            onClick={async () => {
                                if (!activeWorkflow?.id || !newStatus) return;
                                setSaving(true);
                                try {
                                    await axios.patch(
                                        `/api/v1/workflows/${activeWorkflow.id}/status`,
                                        { status: newStatus, notes: statusNote || undefined, updated_by: user?.sub },
                                        { headers: { Authorization: `Bearer ${user?.token}` } }
                                    );
                                    setIsUpdateOpen(false);
                                    await fetchPatient();
                                } catch (err) {
                                    console.error('Failed to update status', err);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {saving ? 'Saving...' : 'Save Update'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

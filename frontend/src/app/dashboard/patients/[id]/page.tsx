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

const DIAGNOSTIC_STAGES = [
    { key: "PATIENT_CREATED", label: "Patient Created" },
    { key: "TEST_PACKAGE_SELECTED", label: "Test Package Selected" },
    { key: "TASSO_INSTRUCTIONS_SENT", label: "Instructions Sent" },
    { key: "KIT_SHIPPED", label: "Kit Shipped" },
    { key: "SAMPLE_COLLECTED", label: "Sample Collected" },
    { key: "LAB_PROCESSING", label: "Lab Processing" },
    { key: "RESULTS_READY", label: "Results Ready" },
    { key: "COMPLETED", label: "Completed" },
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

    const currentStageIndex = useMemo(() => {
        if (!activeWorkflow) return -1;
        return DIAGNOSTIC_STAGES.findIndex(s => s.key === activeWorkflow.status);
    }, [activeWorkflow]);

    if (loading) return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-px" />
                <Skeleton className="h-5 w-36" />
            </div>
            <div className="bg-white p-8 rounded-3xl border flex items-center gap-5">
                <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-64" />
                    <div className="flex gap-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-36 rounded-full" />
                </div>
            </div>
            <Skeleton className="h-48 w-full rounded-3xl" />
            <div className="space-y-4">
                <Skeleton className="h-12 w-[450px] rounded-xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        </div>
    );
    if (!patient) return <div className="p-8 text-destructive">Diagnostic record not found.</div>;

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Navigation Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div className="h-4 w-px bg-border mx-2" />
                <h2 className="text-xl font-bold text-primary">Patient Journey</h2>
            </div>

            {/* Patient Header Section */}
            <div className="bg-white p-8 rounded-3xl border border-border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary border border-primary/20">
                        {patient.first_name[0]}{patient.last_name[0]}
                    </div>
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tighter text-slate-900 border-b-4 border-primary/40 inline-block mb-2">
                            {patient.first_name} {patient.last_name}
                        </h1>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500 font-medium">
                            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {patient.dob ? new Date(patient.dob).toLocaleDateString() : 'N/A'} (DOB)</span>
                            <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {patient.email || 'No email provided'}</span>
                            <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {patient.phone || 'No phone provided'}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Current Status</div>
                    <Badge className="text-lg px-4 py-1.5 font-bold uppercase tracking-wide bg-primary/10 text-primary border-primary/30">
                        {WORKFLOW_STATUSES.find(s => s.key === activeWorkflow?.status)?.label || activeWorkflow?.status?.replace(/_/g, ' ') || 'NO ACTIVE WORKFLOW'}
                    </Badge>
                    {user?.role === 'ADMIN' && activeWorkflow && (
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={() => alert("Send to Tasso API integration coming soon!")}
                            >
                                <FlaskConical className="w-4 h-4" /> Send to Tasso
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-primary/30 text-primary hover:bg-primary hover:text-white"
                                onClick={() => { setNewStatus(activeWorkflow.status); setStatusNote(''); setIsUpdateOpen(true); }}
                            >
                                <ClipboardList className="w-4 h-4" /> Update Status
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Workflow Timeline Section */}
            <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden rounded-3xl">
                <CardHeader className="border-b border-slate-800 bg-slate-900/50">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Activity className="w-6 h-6 text-primary" /> Workflow Timeline
                    </CardTitle>
                </CardHeader>
                <CardContent className="py-12 px-6 overflow-x-auto">
                    <div className="relative flex justify-between min-w-[900px]">
                        {/* Connecting Line */}
                        <div className="absolute top-5 left-0 w-full h-1 bg-slate-800 z-0 rounded-full" />
                        <div
                            className="absolute top-5 left-0 h-1 bg-primary transition-all duration-1000 ease-out rounded-full z-0"
                            style={{ width: `${(currentStageIndex / (DIAGNOSTIC_STAGES.length - 1)) * 100}%` }}
                        />

                        {DIAGNOSTIC_STAGES.map((stage, idx) => {
                            const isCompleted = idx < currentStageIndex;
                            const isCurrent = idx === currentStageIndex;
                            const isPending = idx > currentStageIndex;

                            return (
                                <div key={stage.key} className="relative z-10 flex flex-col items-center gap-4 w-28 group">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center border-4 transition-all duration-500",
                                        isCompleted ? "bg-primary border-primary text-slate-900 shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]" :
                                            isCurrent ? "bg-slate-900 border-primary text-primary animate-pulse shadow-[0_0_20px_rgba(var(--primary-rgb),0.7)]" :
                                                "bg-slate-900 border-slate-800 text-slate-600"
                                    )}>
                                        {isCompleted ? <CheckCircle2 className="w-6 h-6" /> :
                                            isCurrent ? <Circle className="w-4 h-4 fill-primary" /> :
                                                <Circle className="w-3 h-3" />}
                                    </div>
                                    <div className="text-center">
                                        <p className={cn(
                                            "text-[11px] font-black uppercase tracking-tighter transition-colors duration-500 max-w-[80px]",
                                            isCompleted ? "text-primary" :
                                                isCurrent ? "text-white" :
                                                    "text-slate-600"
                                        )}>
                                            {stage.label}
                                        </p>
                                        {isCurrent && (
                                            <div className="mt-1 h-1 w-8 bg-primary mx-auto rounded-full" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Main Tabs Container */}
            <Tabs defaultValue="vitals" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4 lg:w-[620px] h-12 bg-white border border-border rounded-xl p-1">
                    <TabsTrigger value="vitals" className="rounded-lg font-bold text-xs uppercase tracking-wider"><Activity className="w-4 h-4 mr-2" /> Vitals & Devices</TabsTrigger>
                    <TabsTrigger value="history" className="rounded-lg font-bold text-xs uppercase tracking-wider"><HistoryIcon className="w-4 h-4 mr-2" /> Status History</TabsTrigger>
                    <TabsTrigger value="results" className="rounded-lg font-bold text-xs uppercase tracking-wider"><FlaskConical className="w-4 h-4 mr-2" /> Lab Results</TabsTrigger>
                    <TabsTrigger value="notes" className="rounded-lg font-bold text-xs uppercase tracking-wider"><FileText className="w-4 h-4 mr-2" /> Physician Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="vitals" className="animate-in fade-in-50 duration-500">
                    <VitalsDashboard
                        patientId={patient.id}
                        patientName={`${patient.first_name} ${patient.last_name}`}
                        marketplaceUrl={patient.validic_marketplace_url}
                        validicUserId={patient.validic_user_id}
                    />
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in-50 duration-500">
                    <Card className="border-none shadow-md overflow-hidden rounded-2xl">
                        <CardHeader className="bg-slate-50/50 border-b">
                            <CardTitle className="text-lg">Status & Milestone Tracking</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50/30">
                                    <TableRow>
                                        <TableHead className="font-bold text-[10px] uppercase">New Status</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase">Updated By</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase text-right">Date & Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activeWorkflow?.history.map((h: any) => (
                                        <TableRow key={h.id}>
                                            <TableCell>
                                                <Badge variant="outline" className="font-bold uppercase tracking-tighter border-primary/20 bg-primary/5 text-primary">
                                                    {h.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium">{h.user.name}</TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground">
                                                {new Date(h.created_at).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!activeWorkflow?.history.length && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground italic">No status history available.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="results" className="animate-in fade-in-50 duration-500">
                    <Card className="border-none shadow-md overflow-hidden rounded-2xl">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">Diagnostic Reports (PDF)</CardTitle>
                            {user?.role === 'ADMIN' && (
                                <Button size="sm" className="bg-secondary hover:bg-secondary/90"><FileUp className="w-4 h-4 mr-2" /> Upload New Result</Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                {activeWorkflow?.results.map((res: any) => (
                                    <div key={res.id} className="flex items-center justify-between p-4 border rounded-xl hover:border-primary/50 transition-colors bg-white hover:bg-slate-50 group">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-rose-50 text-rose-500 rounded-lg group-hover:bg-rose-100 transition-colors">
                                                <FileText className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-slate-800">Lab Result Report</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(res.uploaded_at).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-primary" onClick={() => window.open(res.file_url)}>
                                            <Download className="w-5 h-5" />
                                        </Button>
                                    </div>
                                ))}
                                {!activeWorkflow?.results.length && (
                                    <div className="md:col-span-2 flex flex-col items-center justify-center p-12 text-muted-foreground border-2 border-dashed rounded-3xl bg-slate-50/50">
                                        <FlaskConical className="w-12 h-12 mb-4 opacity-20" />
                                        <p className="font-medium">No lab results found for this workflow.</p>
                                        <p className="text-xs">Results will appear here once the lab process is complete.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="notes" className="animate-in fade-in-50 duration-500">
                    <Card className="border-none shadow-md overflow-hidden rounded-2xl">
                        <CardHeader className="bg-slate-50/50 border-b">
                            <CardTitle className="text-lg">Internal Physician Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-4">
                                <textarea
                                    className="w-full min-h-[200px] p-4 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 outline-hidden transition-all text-sm font-medium"
                                    placeholder="Add specialized diagnostic notes for this patient journey..."
                                />
                                <div className="flex justify-end">
                                    <Button className="bg-slate-900 font-bold">Save Physician Notes</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>

            {/* Admin: Update Status Dialog */}
            <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-primary" />
                            Update Workflow Status
                        </DialogTitle>
                        <DialogDescription>
                            Manually advance the workflow for <strong>{patient.first_name} {patient.last_name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Current Status</label>
                            <div className="px-3 py-2 bg-muted/40 rounded-md text-sm font-medium">
                                {WORKFLOW_STATUSES.find(s => s.key === activeWorkflow?.status)?.label || activeWorkflow?.status}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-muted-foreground">New Status <span className="text-destructive">*</span></label>
                            <select
                                className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                                value={newStatus}
                                onChange={e => setNewStatus(e.target.value)}
                            >
                                {WORKFLOW_STATUSES.map(s => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Note (optional)</label>
                            <Input
                                placeholder="Describe the update..."
                                value={statusNote}
                                onChange={e => setStatusNote(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsUpdateOpen(false)}>Cancel</Button>
                        <Button
                            disabled={saving}
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

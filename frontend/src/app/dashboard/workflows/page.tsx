'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Search,
    RotateCcw,
    Activity,
    Clock,
    CheckCircle2,
    ClipboardList,
    Building2,
    Calendar,
    Timer,
    AlertCircle,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

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

const STATUS_BADGE: Record<string, string> = {
    PATIENT_CREATED: 'bg-blue-100 text-blue-700 border-blue-200',
    TEST_PACKAGE_SELECTED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    TASSO_INSTRUCTIONS_SENT: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    KIT_SHIPPED: 'bg-amber-100 text-amber-700 border-amber-200',
    SAMPLE_COLLECTED: 'bg-orange-100 text-orange-700 border-orange-200',
    LAB_PROCESSING: 'bg-purple-100 text-purple-700 border-purple-200',
    RESULTS_READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function WorkflowsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWf, setSelectedWf] = useState<any>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [newStatus, setNewStatus] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [saving, setSaving] = useState(false);

    const isAdmin = user?.role === 'ADMIN';

    const fetchWorkflows = useCallback(async () => {
        if (!user?.token) return;
        try {
            const res = await axios.get('http://localhost:3000/api/v1/workflows', {
                headers: { Authorization: `Bearer ${user.token}` },
            });
            setWorkflows(res.data);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [user?.token]);

    useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

    const openUpdateModal = (wf: any) => {
        setSelectedWf(wf);
        setNewStatus(wf.status);
        setStatusNote('');
        setIsStatusModalOpen(true);
    };

    const handleUpdateStatus = async () => {
        if (!selectedWf || !newStatus) return;
        setSaving(true);
        try {
            await axios.patch(
                `http://localhost:3000/api/v1/workflows/${selectedWf.id}/status`,
                { status: newStatus, notes: statusNote || undefined, updated_by: user?.sub },
                { headers: { Authorization: `Bearer ${user?.token}` } }
            );
            setIsStatusModalOpen(false);
            await fetchWorkflows();
        } catch (err) {
            console.error('Failed to update status', err);
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return workflows;
        const q = searchQuery.toLowerCase();
        return workflows.filter(wf =>
            `${wf.patient?.first_name} ${wf.patient?.last_name}`.toLowerCase().includes(q) ||
            (wf.clinic?.name || '').toLowerCase().includes(q) ||
            (wf.test_type || '').toLowerCase().includes(q)
        );
    }, [workflows, searchQuery]);

    const active = filtered.filter(wf => wf.status !== 'COMPLETED');
    const completed = filtered.filter(wf => wf.status === 'COMPLETED');

    const totalActive = workflows.filter(wf => wf.status !== 'COMPLETED').length;
    const resultsReady = workflows.filter(wf => wf.status === 'RESULTS_READY').length;
    const totalCompleted = workflows.filter(wf => wf.status === 'COMPLETED').length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">Diagnostic Workflows</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">
                        {isAdmin ? 'Track and update patient workflows across all clinics.' : 'Track your patients from enrollment to lab results.'}
                    </p>
                </div>
                {!isAdmin && (
                    <Button className="gap-2 bg-primary shadow-lg hover:bg-primary/90" onClick={() => router.push('/dashboard/patients/add')}>
                        Add Patient
                    </Button>
                )}
            </div>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard title="Active Workflows" value={totalActive} icon={Activity} color="text-primary" />
                <SummaryCard title="Results Ready" value={resultsReady} icon={Clock} color="text-amber-500" />
                <SummaryCard title="Completed" value={totalCompleted} icon={CheckCircle2} color="text-emerald-500" />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="active" className="w-full">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
                    <TabsList className="bg-muted/50 p-1">
                        <TabsTrigger value="active" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            Active <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px] bg-primary/10 text-primary">{totalActive}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="completed" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            Completed <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">{totalCompleted}</Badge>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 flex-1 md:max-w-md">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by patient, clinic, or test type..."
                                className="pl-10 h-9"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSearchQuery('')}>
                            <RotateCcw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Active tab */}
                <TabsContent value="active" className="mt-0">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-3">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Timer className="w-4 h-4 text-primary" /> Active Workflow Queue
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-12 text-center text-muted-foreground animate-pulse">Loading workflows...</div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/30 border-b">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Patient Name</TableHead>
                                            {isAdmin && <TableHead className="font-bold text-xs uppercase tracking-wider">Clinic</TableHead>}
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Current Status</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-wider">Last Updated</TableHead>
                                            <TableHead className="text-right font-bold text-xs uppercase tracking-wider w-[120px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {active.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 6 : 5} className="h-24 text-center text-muted-foreground italic">
                                                    No active workflows.
                                                </TableCell>
                                            </TableRow>
                                        ) : active.map(wf => (
                                            <TableRow key={wf.id} className="hover:bg-muted/20 transition-colors">
                                                <TableCell
                                                    className="font-bold text-primary cursor-pointer hover:underline"
                                                    onClick={() => router.push(`/dashboard/patients/${wf.patient_id}`)}
                                                >
                                                    {wf.patient?.first_name} {wf.patient?.last_name}
                                                </TableCell>
                                                {isAdmin && (
                                                    <TableCell className="text-xs font-medium">
                                                        <div className="flex items-center gap-1.5">
                                                            <Building2 className="w-3 h-3 text-muted-foreground" />
                                                            {wf.clinic?.name || '—'}
                                                        </div>
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-xs">{wf.test_type}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`${STATUS_BADGE[wf.status] || 'bg-slate-50 text-slate-600'} text-[10px] font-bold border`}>
                                                        {WORKFLOW_STATUSES.find(s => s.key === wf.status)?.label || wf.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        {new Date(wf.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-xs gap-1 h-7"
                                                            onClick={() => router.push(`/dashboard/patients/${wf.patient_id}`)}
                                                        >
                                                            View
                                                        </Button>
                                                        {isAdmin && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-xs gap-1 h-7 border-primary/30 text-primary hover:bg-primary hover:text-white"
                                                                onClick={() => openUpdateModal(wf)}
                                                            >
                                                                <ClipboardList className="w-3 h-3" /> Update
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Completed tab */}
                <TabsContent value="completed" className="mt-0">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-3">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-emerald-500" /> Completed Workflows
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/30 border-b">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="font-bold">Patient Name</TableHead>
                                        {isAdmin && <TableHead className="font-bold">Clinic</TableHead>}
                                        <TableHead className="font-bold">Test Type</TableHead>
                                        <TableHead className="font-bold">Started</TableHead>
                                        <TableHead className="font-bold">Completed</TableHead>
                                        <TableHead className="text-right font-bold w-[80px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {completed.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={isAdmin ? 6 : 5} className="h-24 text-center text-muted-foreground italic">
                                                No completed workflows yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : completed.map(wf => (
                                        <TableRow key={wf.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell
                                                className="font-bold text-primary cursor-pointer hover:underline"
                                                onClick={() => router.push(`/dashboard/patients/${wf.patient_id}`)}
                                            >
                                                {wf.patient?.first_name} {wf.patient?.last_name}
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-xs font-medium">{wf.clinic?.name || '—'}</TableCell>
                                            )}
                                            <TableCell className="text-xs">{wf.test_type}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(wf.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(wf.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => router.push(`/dashboard/patients/${wf.patient_id}`)}>
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Update Status Modal — admin only */}
            <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-primary" />
                            Update Workflow Status
                        </DialogTitle>
                        <DialogDescription>
                            Manually advance the workflow for <strong>{selectedWf?.patient?.first_name} {selectedWf?.patient?.last_name}</strong> — {selectedWf?.test_type}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Current Status</label>
                            <div className="px-3 py-2 bg-muted/40 rounded-md text-sm font-medium">
                                {WORKFLOW_STATUSES.find(s => s.key === selectedWf?.status)?.label || selectedWf?.status}
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
                                placeholder="Describe the status update..."
                                value={statusNote}
                                onChange={e => setStatusNote(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateStatus} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Update'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, color }: any) {
    return (
        <Card className="border-none shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</p>
                    <p className="text-2xl font-black mt-1 tracking-tight">{value}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
            </CardContent>
        </Card>
    );
}

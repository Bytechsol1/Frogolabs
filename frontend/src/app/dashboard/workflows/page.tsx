'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Activity,
    Search,
    RotateCcw,
    ChevronRight,
    Eye,
    ClipboardList,
    Building2,
    FlaskConical,
    Timer,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
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
    const router = useRouter();
    const { user } = useAuth();
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // Status Update Modal
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
    const [newStatus, setNewStatus] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchWorkflows = async () => {
        if (!user?.token) return;
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/workflows', {
                headers: { Authorization: `Bearer ${user.token}` },
            });
            setWorkflows(res.data);
        } catch (err) {
            console.error('Failed to fetch workflows', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkflows();
    }, [user?.token]);

    const filteredWorkflows = useMemo(() => {
        return workflows.filter(w => {
            const patientName = `${w.patient?.first_name || ''} ${w.patient?.last_name || ''}`.toLowerCase();
            const clinicName = (w.patient?.clinic?.name || '').toLowerCase();
            const pkg = (w.test_package || '').toLowerCase();
            const matchesSearch =
                patientName.includes(searchQuery.toLowerCase()) ||
                clinicName.includes(searchQuery.toLowerCase()) ||
                pkg.includes(searchQuery.toLowerCase());
            const matchesStatus =
                statusFilter === 'All' || w.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [workflows, searchQuery, statusFilter]);

    const active = useMemo(() => filteredWorkflows.filter(w => w.status !== 'COMPLETED'), [filteredWorkflows]);
    const completed = useMemo(() => filteredWorkflows.filter(w => w.status === 'COMPLETED'), [filteredWorkflows]);

    const totalActive = workflows.filter(w => w.status !== 'COMPLETED').length;
    const totalResultsReady = workflows.filter(w => w.status === 'RESULTS_READY').length;
    const totalCompleted = workflows.filter(w => w.status === 'COMPLETED').length;

    const isAdmin = user?.role === 'ADMIN';

    const handleUpdateStatus = async () => {
        if (!selectedWorkflow || !newStatus) return;
        setSaving(true);
        try {
            await axios.patch(
                `/api/v1/workflows/${selectedWorkflow.id}/status`,
                { status: newStatus, notes: statusNote || undefined, updated_by: user?.sub },
                { headers: { Authorization: `Bearer ${user?.token}` } }
            );
            setIsStatusModalOpen(false);
            setSelectedWorkflow(null);
            setStatusNote('');
            await fetchWorkflows();
        } catch (err) {
            console.error('Failed to update workflow status', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden pb-8">
            {/* Header */}
            <div>
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                    Diagnostic Workflows
                </h1>
                <p className="text-xs text-slate-500 mt-1">

                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard title="Active Workflows" value={totalActive} icon={Activity} />
                <SummaryCard title="Results Ready" value={totalResultsReady} icon={FlaskConical} />
                <SummaryCard title="Completed Workflows" value={totalCompleted} icon={CheckCircle2} />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="active" className="w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <TabsList className="bg-white/10 p-1.5 rounded-full border border-white/20 inline-flex shadow-xs">
                        <TabsTrigger value="active" className="flex items-center gap-2 text-sm font-bold text-slate-300 rounded-full px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            Active <Badge className="px-2.5 py-0.5 text-xs bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-extrabold rounded-full">{totalActive}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="completed" className="flex items-center gap-2 text-sm font-bold text-slate-300 rounded-full px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            Completed <Badge className="px-2.5 py-0.5 text-xs bg-slate-200 text-slate-800 border-none font-extrabold rounded-full">{totalCompleted}</Badge>
                        </TabsTrigger>
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

                {/* Active Workflows Tab */}
                <TabsContent value="active" className="mt-0">
                    <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                            <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                <Timer className="w-4 h-4 text-[#cbb28d]" /> Active Workflow Queue
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-12 text-center text-slate-500 text-xs italic">Loading workflows...</div>
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
                                        {active.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 6 : 5} className="h-24 text-center text-slate-500 italic text-xs">
                                                    No active workflows found.
                                                </TableCell>
                                            </TableRow>
                                        ) : active.map(w => {
                                            const badgeInfo = EXECUTIVE_STATUS_BADGES[w.status] || { bg: 'bg-[#080e1e]', text: 'text-[#cbb28d]', label: w.status };
                                            return (
                                                <TableRow key={w.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                                    <TableCell className="font-bold text-xs text-[#080e1e]">
                                                        {w.patient ? `${w.patient.first_name} ${w.patient.last_name}` : '—'}
                                                    </TableCell>
                                                    {isAdmin && (
                                                        <TableCell className="text-xs text-slate-700 font-medium">
                                                            {w.patient?.clinic?.name || '—'}
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-xs text-slate-700 font-medium">{w.test_package || 'General'}</TableCell>
                                                    <TableCell>
                                                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${badgeInfo.bg} ${badgeInfo.text}`}>
                                                            {badgeInfo.label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-500 font-mono">
                                                        {new Date(w.updated_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6 space-x-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 text-xs font-bold text-[#080e1e] hover:bg-white rounded-full"
                                                            onClick={() => router.push(`/dashboard/patients/${w.patient_id}`)}
                                                        >
                                                            View
                                                        </Button>
                                                        {isAdmin && (
                                                            <Button
                                                                size="sm"
                                                                className="h-8 text-xs font-bold bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] rounded-full px-3 gap-1"
                                                                onClick={() => { setSelectedWorkflow(w); setNewStatus(w.status); setStatusNote(''); setIsStatusModalOpen(true); }}
                                                            >
                                                                <ClipboardList className="w-3.5 h-3.5 text-[#cbb28d]" /> Update
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Completed Tab */}
                <TabsContent value="completed" className="mt-0">
                    <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden">
                        <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                            <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#cbb28d]" /> Completed Workflows Log
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
                                                No completed workflows found.
                                            </TableCell>
                                        </TableRow>
                                    ) : completed.map(w => (
                                        <TableRow key={w.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                            <TableCell className="font-bold text-xs text-[#080e1e]">
                                                {w.patient ? `${w.patient.first_name} ${w.patient.last_name}` : '—'}
                                            </TableCell>
                                            {isAdmin && <TableCell className="text-xs text-slate-700 font-medium">{w.patient?.clinic?.name || '—'}</TableCell>}
                                            <TableCell className="text-xs text-slate-700 font-medium">{w.test_package || 'General'}</TableCell>
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

            {/* Status Update Modal */}
            <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="text-[#080e1e] font-bold flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-[#cbb28d]" /> Update Diagnostic Stage
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            Advance workflow stage for {selectedWorkflow?.patient?.first_name} {selectedWorkflow?.patient?.last_name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono font-bold text-[#8c7657] uppercase">Target Status</label>
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
                        <Button variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
                        <Button
                            disabled={saving}
                            className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full"
                            onClick={handleUpdateStatus}
                        >
                            {saving ? 'Saving...' : 'Save Update'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon }: any) {
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

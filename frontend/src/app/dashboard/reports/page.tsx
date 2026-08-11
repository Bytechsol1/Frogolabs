'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Download,
    FileText,
    Search,
    RotateCcw,
    Users,
    Activity,
    CheckCircle2,
    Clock,
    AlertTriangle,
    BarChart3,
    Building2,
    Eye,
    Filter,
    AlertCircle
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";

// ── Dummy Data ────────────────────────────────────────────────────
const CLINIC_PERFORMANCE = [
    { clinic: 'Austin Family Clinic', patients: 42, active: 8, completed: 29, pending: 4, delayed: 1, avg: '4.1 Days', rate: 89 },
    { clinic: 'Green Valley Clinic', patients: 31, active: 5, completed: 22, pending: 3, delayed: 2, avg: '4.7 Days', rate: 84 },
    { clinic: 'Westside Health Center', patients: 18, active: 3, completed: 13, pending: 2, delayed: 1, avg: '5.0 Days', rate: 81 },
    { clinic: 'NorthBridge Clinic', patients: 12, active: 1, completed: 10, pending: 1, delayed: 0, avg: '3.9 Days', rate: 91 },
];

const LAB_TURNAROUND = [
    { clinic: 'Austin Family Clinic', test: 'Blood Panel', avg: '3.8 Days', pending: 4, sent: 28, failed: 0 },
    { clinic: 'Green Valley Clinic', test: 'DNA Test', avg: '4.5 Days', pending: 3, sent: 19, failed: 1 },
    { clinic: 'Westside Health Center', test: 'Lab Screening', avg: '5.1 Days', pending: 2, sent: 11, failed: 0 },
];

const DELAYED_WORKFLOWS = [
    { id: 'WF-1011', patient: 'Robert King', clinic: 'Austin Family Clinic', stage: 'Awaiting Results', days: 6, reason: 'Lab result not received', priority: 'High', updated: 'Jun 10, 2026' },
    { id: 'WF-1012', patient: 'Lisa Green', clinic: 'Green Valley Clinic', stage: 'Sample Pending', days: 5, reason: 'Sample not collected', priority: 'Medium', updated: 'Jun 11, 2026' },
];

const WORKFLOW_BREAKDOWN = [
    { stage: 'Patient Enrolled', count: 12 },
    { stage: 'Test Ordered', count: 8 },
    { stage: 'Sample Pending', count: 5 },
    { stage: 'Sample Collected', count: 7 },
    { stage: 'Sent to Lab', count: 10 },
    { stage: 'Awaiting Results', count: 16 },
    { stage: 'Results Available', count: 9 },
    { stage: 'Completed', count: 184 },
];
const MAX_BAR = Math.max(...WORKFLOW_BREAKDOWN.map(s => s.count));

const getPriorityBadge = (p: string) => p === 'High' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white';

// ================================================================
export default function ReportsPage() {
    const [isExportOpen, setIsExportOpen] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">Reports</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">View clinic performance, patient workflow activity, lab result status, and operational delays.</p>
                </div>
                <div className="flex items-center gap-2">
                </div>
            </div>

            {/* Filters */}
            <Card className="border-none shadow-sm">
                <CardContent className="p-4 flex flex-wrap gap-3 items-center">
                    <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                    {[
                        { label: 'Date Range', opts: ['This Month', 'Today', 'This Week', 'Last Month', 'Custom'] },
                        { label: 'Clinic', opts: ['All Clinics', 'Austin Family Clinic', 'Green Valley Clinic'] },
                        { label: 'Workflow', opts: ['All', 'Active', 'Completed', 'Delayed'] },
                        { label: 'Lab Status', opts: ['All', 'Pending', 'Available', 'Sent to Clinic'] },
                    ].map(f => (
                        <select key={f.label} className="bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20" defaultValue={f.opts[0]}>
                            {f.opts.map(o => <option key={o}>{o}</option>)}
                        </select>
                    ))}
                    <Button size="sm" className="gap-2">Apply</Button>
                    <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground"><RotateCcw className="w-3 h-3" /> Reset</Button>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-6">
                <SCard title="Total Patients" value={248} icon={Users} color="text-primary" />
                <SCard title="Active Workflows" value={37} icon={Activity} color="text-indigo-500" />
                <SCard title="Completed Workflows" value={184} icon={CheckCircle2} color="text-emerald-500" />
                <SCard title="Pending Lab Results" value={16} icon={Clock} color="text-amber-500" />
                <SCard title="Delayed Workflows" value={5} icon={AlertTriangle} color="text-rose-500" />
                <SCard title="Avg Turnaround" value="4.2d" icon={BarChart3} color="text-blue-500" />
            </div>

            {/* Clinic Performance */}
            <SectionCard title="Clinic Performance" icon={<Building2 className="w-4 h-4 text-primary" />}>
                <Table>
                    <TableHeader className="bg-muted/30 border-b">
                        <TableRow className="hover:bg-transparent">
                            {['Clinic Name', 'Patients', 'Active', 'Completed', 'Pending', 'Delayed', 'Avg Time', 'Rate', ''].map(h => (
                                <TableHead key={h} className="font-bold text-xs uppercase tracking-wider">{h}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {CLINIC_PERFORMANCE.map(r => (
                            <TableRow key={r.clinic} className="hover:bg-muted/20">
                                <TableCell className="font-bold text-primary">{r.clinic}</TableCell>
                                <TableCell className="text-center font-bold">{r.patients}</TableCell>
                                <TableCell className="text-center">
                                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">{r.active}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">{r.completed}</Badge>
                                </TableCell>
                                <TableCell className="text-center text-amber-600 font-bold">{r.pending}</TableCell>
                                <TableCell className="text-center text-rose-600 font-bold">{r.delayed}</TableCell>
                                <TableCell className="text-xs font-medium">{r.avg}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${r.rate}%` }} />
                                        </div>
                                        <span className="text-xs font-black">{r.rate}%</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" className="text-xs gap-1"><Eye className="w-3 h-3" /> View</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </SectionCard>

            {/* Workflow Breakdown Chart */}
            <SectionCard title="Workflow Status Breakdown" icon={<Activity className="w-4 h-4 text-indigo-500" />}>
                <div className="p-4 space-y-3">
                    {WORKFLOW_BREAKDOWN.map(s => (
                        <div key={s.stage} className="flex items-center gap-3">
                            <span className="text-xs font-medium w-36 shrink-0 text-right text-muted-foreground">{s.stage}</span>
                            <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary/80 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                                    style={{ width: `${(s.count / MAX_BAR) * 100}%` }}
                                >
                                    <span className="text-[10px] text-white font-black">{s.count}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Lab Turnaround */}
            <SectionCard title="Lab Result Turnaround" icon={<Clock className="w-4 h-4 text-amber-500" />}>
                <Table>
                    <TableHeader className="bg-muted/30 border-b">
                        <TableRow className="hover:bg-transparent">
                            {['Clinic', 'Test Type', 'Avg Result Time', 'Pending', 'Sent', 'Failed Delivery'].map(h => (
                                <TableHead key={h} className="font-bold text-xs uppercase tracking-wider">{h}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {LAB_TURNAROUND.map(r => (
                            <TableRow key={r.clinic} className="hover:bg-muted/20">
                                <TableCell className="font-bold">{r.clinic}</TableCell>
                                <TableCell className="text-xs">{r.test}</TableCell>
                                <TableCell className="font-bold text-primary">{r.avg}</TableCell>
                                <TableCell className="text-amber-600 font-bold">{r.pending}</TableCell>
                                <TableCell className="text-emerald-600 font-bold">{r.sent}</TableCell>
                                <TableCell>
                                    <Badge className={r.failed > 0 ? 'bg-rose-500 text-white text-[10px]' : 'bg-muted text-muted-foreground text-[10px]'}>{r.failed}</Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </SectionCard>

            {/* Delayed Workflows */}
            <SectionCard title="Delayed Workflow Report" icon={<AlertCircle className="w-4 h-4 text-rose-500" />}>
                <Table>
                    <TableHeader className="bg-muted/30 border-b">
                        <TableRow className="hover:bg-transparent">
                            {['Workflow ID', 'Patient', 'Clinic', 'Stage', 'Days', 'Delay Reason', 'Priority', 'Actions'].map(h => (
                                <TableHead key={h} className="font-bold text-xs uppercase tracking-wider">{h}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {DELAYED_WORKFLOWS.map(r => (
                            <TableRow key={r.id} className="bg-rose-50/30 hover:bg-rose-50/50">
                                <TableCell className="font-mono text-xs text-muted-foreground font-bold">{r.id}</TableCell>
                                <TableCell className="font-bold text-rose-900">{r.patient}</TableCell>
                                <TableCell className="text-xs">{r.clinic}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">{r.stage}</Badge>
                                </TableCell>
                                <TableCell className="font-black text-rose-600">{r.days}d</TableCell>
                                <TableCell className="text-xs italic text-rose-600">{r.reason}</TableCell>
                                <TableCell>
                                    <Badge className={getPriorityBadge(r.priority) + ' text-[10px] font-black uppercase'}>{r.priority}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 text-xs">Follow Up</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </SectionCard>

            {/* Export Modal */}
            <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Export Report</DialogTitle>
                        <DialogDescription>Choose what to include in the exported PDF.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <FormRow label="Report Type">
                            <select className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none" defaultValue="Full Report">
                                {['Full Report', 'Clinic Performance Report', 'Lab Results Report', 'Delayed Workflow Report'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </FormRow>
                        <FormRow label="Date Range">
                            <select className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none" defaultValue="This Month">
                                {['Today', 'This Week', 'This Month', 'Last Month', 'Custom'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </FormRow>
                        <FormRow label="Clinic">
                            <select className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none" defaultValue="All Clinics">
                                {['All Clinics', 'Austin Family Clinic', 'Green Valley Clinic', 'NorthBridge Clinic'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </FormRow>
                        <div className="flex flex-col gap-2 pt-1">
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="w-4 h-4 rounded" /> Include Charts</label>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="w-4 h-4 rounded" /> Include Delayed Workflows</label>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
                        <Button onClick={() => setIsExportOpen(false)} className="gap-2"><FileText className="w-4 h-4" /> Export Report</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SCard({ title, value, icon: Icon, color }: any) {
    return (
        <Card className="border-none shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</p>
                    <p className="text-2xl font-black mt-1 tracking-tight">{value}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg"><Icon className={`w-5 h-5 ${color}`} /></div>
            </CardContent>
        </Card>
    );
}

function SectionCard({ title, icon, children }: any) {
    return (
        <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/10 border-b py-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">{icon} {title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">{children}</CardContent>
        </Card>
    );
}

function FormRow({ label, children }: any) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{label}</label>
            {children}
        </div>
    );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Plus,
    Search,
    RotateCcw,
    Users,
    Activity,
    FlaskConical,
    CheckCircle,
    UserPlus,
    MoreHorizontal,
    Eye,
    Mail,
    Phone,
    Calendar,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export default function AllPatientsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        if (!user?.token) return;
        axios.get('/api/v1/patients', {
            headers: { Authorization: `Bearer ${user.token}` },
        })
            .then(res => setPatients(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user?.token]);

    const filteredPatients = useMemo(() => {
        return patients.filter(p => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
            const matchesSearch =
                fullName.includes(searchQuery.toLowerCase()) ||
                (p.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.phone || '').includes(searchQuery) ||
                (p.clinic?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus =
                statusFilter === 'All' || p.workflows?.[0]?.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [patients, searchQuery, statusFilter]);

    const total = patients.length;
    const newPatients = patients.filter(p => p.workflows?.[0]?.status === 'PATIENT_CREATED').length;
    const active = patients.filter(p => {
        const s = p.workflows?.[0]?.status;
        return s && s !== 'COMPLETED';
    }).length;
    const resultsReady = patients.filter(p => p.workflows?.[0]?.status === 'RESULTS_READY').length;
    const completed = patients.filter(p => p.workflows?.[0]?.status === 'COMPLETED').length;

    const isAdmin = user?.role === 'ADMIN';

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">
                        {isAdmin ? 'All Patients' : 'My Patients'}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">
                        {isAdmin
                            ? 'Manage patient records across all clinics.'
                            : "Track your clinic's patients and their diagnostic workflows."}
                    </p>
                </div>
                {!isAdmin && (
                    <Button
                        className="gap-2 bg-primary shadow-lg hover:bg-primary/90"
                        onClick={() => router.push('/dashboard/patients/add')}
                    >
                        <Plus className="w-5 h-5" />
                        Add Patient
                    </Button>
                )}
            </div>

            {/* Search + Filters */}
            <Card className="border-none shadow-sm overflow-hidden">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, email, phone..."
                            className="pl-10"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-nowrap gap-2">
                        <select
                            className="bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20 min-w-[160px]"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="All">All Statuses</option>
                            {WORKFLOW_STATUSES.map(s => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                        </select>
                        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                            <RotateCcw className="w-4 h-4" />
                            Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
                <SummaryCard title="Total Patients" value={total} icon={Users} color="text-primary" />
                <SummaryCard title="New Patients" value={newPatients} icon={UserPlus} color="text-blue-500" />
                <SummaryCard title="Active Workflows" value={active} icon={Activity} color="text-amber-500" />
                <SummaryCard title="Results Ready" value={resultsReady} icon={FlaskConical} color="text-rose-500" />
                <SummaryCard title="Completed" value={completed} icon={CheckCircle} color="text-emerald-500" />
            </div>

            {/* Table */}
            <Card className="border-none shadow-sm overflow-hidden min-w-0">
                <CardHeader className="bg-muted/10 border-b">
                    <CardTitle className="text-lg">Patient Directory</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 py-2">
                                    <Skeleton className="h-4 w-36" />
                                    <Skeleton className="h-4 flex-1" />
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-5 w-24 rounded-full" />
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/50 border-b">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-bold">Patient Name</TableHead>
                                    {isAdmin && <TableHead className="font-bold">Clinic</TableHead>}
                                    <TableHead className="font-bold">Contact Info</TableHead>
                                    <TableHead className="font-bold">Test Package</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="font-bold">Added</TableHead>
                                    <TableHead className="text-right font-bold w-[60px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPatients.map(p => (
                                    <TableRow
                                        key={p.id}
                                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                    >
                                        <TableCell className="font-bold text-primary">
                                            {p.first_name} {p.last_name}
                                        </TableCell>
                                        {isAdmin && (
                                            <TableCell className="text-xs font-medium text-muted-foreground">
                                                {p.clinic?.name || '—'}
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {p.email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Mail className="w-3 h-3" /> {p.email}
                                                    </div>
                                                )}
                                                {p.phone && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Phone className="w-3 h-3" /> {p.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {p.workflows?.[0]?.test_type || '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`${STATUS_BADGE[p.workflows?.[0]?.status] || 'bg-slate-50 text-slate-600'} text-[10px] font-bold border`}>
                                                {WORKFLOW_STATUSES.find(s => s.key === p.workflows?.[0]?.status)?.label || p.workflows?.[0]?.status || 'N/A'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground italic">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    }
                                                />
                                                <DropdownMenuContent align="end" className="w-[160px]">
                                                    <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/patients/${p.id}`)}>
                                                        <Eye className="w-4 h-4" /> View Record
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {!loading && filteredPatients.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <Users className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-bold text-lg">No patients found.</p>
                                <p className="text-muted-foreground text-sm">
                                    {patients.length === 0 ? 'Add your first patient to begin tracking workflows.' : 'Try adjusting your search or filters.'}
                                </p>
                            </div>
                            {patients.length === 0 && (
                                <Button className="mt-2" onClick={() => router.push('/dashboard/patients/add')}>Add Patient</Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, color }: any) {
    return (
        <Card className="border-none shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{title}</p>
                    <p className="text-2xl font-black mt-1">{value}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
            </CardContent>
        </Card>
    );
}

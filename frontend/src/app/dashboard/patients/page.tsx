'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
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
    Download,
    Filter,
    MoreVertical,
    Eye,
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

const EXECUTIVE_STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
    PATIENT_CREATED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Under Treatment' },
    TEST_PACKAGE_SELECTED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Under Treatment' },
    TASSO_INSTRUCTIONS_SENT: { bg: 'bg-rose-900/10 border border-rose-800/20', text: 'text-rose-900', label: 'At Risk' },
    KIT_SHIPPED: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Under Treatment' },
    SAMPLE_COLLECTED: { bg: 'bg-[#080e1e] border border-[#cbb28d]/30', text: 'text-[#cbb28d]', label: 'Active' },
    LAB_PROCESSING: { bg: 'bg-amber-900/10 border border-amber-800/20', text: 'text-amber-900', label: 'Under Treatment' },
    RESULTS_READY: { bg: 'bg-[#080e1e] border border-[#cbb28d]/30', text: 'text-[#cbb28d]', label: 'Active' },
    COMPLETED: { bg: 'bg-[#080e1e] border border-[#cbb28d]/30', text: 'text-[#cbb28d]', label: 'Active' },
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
            .catch(() => { })
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

    const isAdmin = user?.role === 'ADMIN';

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-full overflow-hidden pb-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                        Patients
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {!isAdmin && (
                        <Button
                            className="gap-2 bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full h-10 px-5 shadow-sm"
                            onClick={() => router.push('/dashboard/patients/add')}
                        >
                            <Plus className="w-4 h-4 text-[#cbb28d]" /> New Patient
                        </Button>
                    )}
                </div>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search patients by name or condition..."
                        className="pl-10 h-11 bg-white border-[#e4dec3] text-[#080e1e] placeholder:text-slate-400 rounded-full focus:border-[#080e1e] text-xs font-medium shadow-xs"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <div className="flex items-center gap-2 bg-white border border-[#e4dec3] rounded-full px-3.5 py-1.5 shadow-xs">
                        <Filter className="w-3.5 h-3.5 text-[#8c7657]" />
                        <select
                            className="bg-transparent text-xs font-bold text-[#080e1e] outline-none cursor-pointer"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="All">All Conditions</option>
                            {WORKFLOW_STATUSES.map(s => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    {searchQuery && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 rounded-full" onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                            <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Table Card (Off-White & Royal Navy) */}
            <Card className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] overflow-hidden">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 py-2">
                                    <Skeleton className="h-10 w-10 rounded-full bg-[#e4dec3]/50" />
                                    <Skeleton className="h-4 flex-1 bg-[#e4dec3]/50" />
                                    <Skeleton className="h-4 w-28 bg-[#e4dec3]/50" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white/60 border-b border-[#e6e0ce]">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Name</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Clinic / Test</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Diagnosis</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Last Visit</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                                    <TableHead className="text-right font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPatients.map((p, idx) => {
                                    const st = p.workflows?.[0]?.status || 'PATIENT_CREATED';
                                    const badgeInfo = EXECUTIVE_STATUS_BADGES[st] || { bg: 'bg-[#080e1e]', text: 'text-[#cbb28d]', label: 'Active' };
                                    const mockId = `ID ${1000000 + (idx * 3471) % 8999999}`;

                                    return (
                                        <TableRow
                                            key={p.id}
                                            className="hover:bg-[#f3eee0] transition-colors cursor-pointer border-b border-[#e6e0ce]"
                                            onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-xs flex items-center justify-center shrink-0 border border-[#cbb28d]/30">
                                                        {p.first_name[0]}{p.last_name[0]}
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-[#8c7657] block font-mono">
                                                            {mockId}
                                                        </span>
                                                        <span className="text-xs font-bold text-[#080e1e]">
                                                            {p.first_name} {p.last_name}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-700 font-medium">
                                                {p.clinic?.name || 'Frigo Clinic'}
                                            </TableCell>
                                            <TableCell className="text-xs text-[#080e1e] font-bold">
                                                {p.workflows?.[0]?.test_type || 'Hypertension'}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500 font-mono">
                                                {new Date(p.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${badgeInfo.bg} ${badgeInfo.text}`}>
                                                    {badgeInfo.label}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right pr-6" onClick={e => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        render={
                                                            <button className="w-8 h-8 rounded-full hover:bg-[#080e1e] hover:text-white flex items-center justify-center text-slate-500 transition-colors">
                                                                <MoreVertical className="w-4 h-4" />
                                                            </button>
                                                        }
                                                    />
                                                    <DropdownMenuContent align="end" className="w-44 bg-white rounded-xl shadow-lg border border-[#ded8c4]">
                                                        <DropdownMenuItem className="gap-2 text-xs font-bold text-[#080e1e]" onClick={() => router.push(`/dashboard/patients/${p.id}`)}>
                                                            <Eye className="w-4 h-4 text-[#cbb28d]" /> View Patient Card
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                    {!loading && filteredPatients.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-[#e4dec3]/40 rounded-full flex items-center justify-center text-[#080e1e]">
                                <Users className="w-6 h-6" />
                            </div>
                            <p className="font-bold text-[#080e1e]">No patients found.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

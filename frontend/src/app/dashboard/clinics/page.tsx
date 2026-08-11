'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search,
    RotateCcw,
    Building2,
    Mail,
    Phone,
    Activity,
    MoreHorizontal,
    Eye,
    UserMinus,
    AlertCircle,
    Users,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function AllClinicsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [clinics, setClinics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
    const [selectedClinic, setSelectedClinic] = useState<any>(null);
    const [disabling, setDisabling] = useState(false);

    useEffect(() => {
        if (!user?.token) return;
        axios.get('/api/v1/clinics', {
            headers: { Authorization: `Bearer ${user.token}` },
        })
            .then(res => setClinics(res.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user?.token]);

    const filteredClinics = useMemo(() => {
        return clinics.filter(c => {
            const matchesSearch =
                !searchQuery ||
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (c.phone || '').includes(searchQuery) ||
                (c.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus = statusFilter === 'All' || (c.status || 'Active') === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [clinics, searchQuery, statusFilter]);

    const total = clinics.length;
    const active = clinics.filter(c => (c.status || 'Active') === 'Active').length;
    const pending = clinics.filter(c => c.status === 'Pending').length;
    const inactive = clinics.filter(c => c.status === 'Inactive').length;

    const statusColor = (s: string) => {
        if (!s || s === 'Active') return 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-bold';
        if (s === 'Pending') return 'bg-amber-950/20 text-amber-900 border border-amber-900/30';
        return 'bg-slate-200 text-slate-700';
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-8">
            {/* Header */}
            <div>
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                    Clinic Network Directory
                </h1>

            </div>

            {/* Search + Filters (Off-White & Cream) */}
            <Card className="border border-[#e4dec3]/70 bg-white shadow-xs rounded-3xl overflow-hidden">
                <CardContent className="p-4 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search clinic name, contact, email, or phone..."
                            className="pl-10 h-10 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-full focus:border-[#080e1e] text-xs font-medium"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <select
                            className="bg-white border border-[#ded8c4] rounded-full px-4 py-2 text-xs font-bold text-[#080e1e] outline-none focus:border-[#080e1e]"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="All">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                        {searchQuery && (
                            <Button variant="ghost" className="gap-2 text-xs font-bold text-slate-600 hover:text-[#080e1e] rounded-full" onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                                <RotateCcw className="w-3.5 h-3.5" /> Reset
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard title="Total Clinics" value={total} icon={Building2} />
                <SummaryCard title="Active Clinics" value={active} icon={Activity} />
                <SummaryCard title="Pending Clinics" value={pending} icon={RotateCcw} />
                <SummaryCard title="Inactive Clinics" value={inactive} icon={UserMinus} />
            </div>

            {/* Table */}
            <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden min-w-0">
                <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                    <CardTitle className="text-sm font-bold text-[#080e1e]">Registered Clinics</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 py-2">
                                    <Skeleton className="h-4 w-36 bg-[#e4dec3]/50" />
                                    <Skeleton className="h-4 w-24 bg-[#e4dec3]/50" />
                                    <Skeleton className="h-4 flex-1 bg-[#e4dec3]/50" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                                <TableRow>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Clinic Name</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Primary Contact</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Contact Details</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-center">Patients</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-center">Workflows</TableHead>
                                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                                    <TableHead className="text-right font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClinics.map(c => (
                                    <TableRow key={c.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                                        <TableCell
                                            className="font-bold text-xs text-[#080e1e] cursor-pointer hover:underline"
                                            onClick={() => router.push(`/dashboard/clinics/${c.id}`)}
                                        >
                                            {c.name}
                                        </TableCell>
                                        <TableCell className="font-medium text-xs text-slate-700">{c.contact_name || '—'}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                {c.email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                        <Mail className="w-3 h-3 text-[#cbb28d]" /> {c.email}
                                                    </div>
                                                )}
                                                {c.phone && (
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                        <Phone className="w-3 h-3 text-[#cbb28d]" /> {c.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-xs text-[#080e1e]">
                                            <div className="flex items-center justify-center gap-1">
                                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                                {c._count?.patients ?? 0}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="text-[10px] font-bold border-[#080e1e]/20 text-[#080e1e] px-2 py-0.5 rounded-full">
                                                {c._count?.workflows ?? 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`${statusColor(c.status)} text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full`}>
                                                {c.status || 'Active'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-[#080e1e] hover:text-white">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    }
                                                />
                                                <DropdownMenuContent align="end" className="w-[170px] bg-white border-[#ded8c4] rounded-xl shadow-lg">
                                                    <DropdownMenuItem className="gap-2 text-xs font-bold text-[#080e1e]" onClick={() => router.push(`/dashboard/clinics/${c.id}`)}>
                                                        <Eye className="w-4 h-4 text-[#cbb28d]" /> View Patients
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-[#e6e0ce]" />
                                                    <DropdownMenuItem
                                                        className="gap-2 text-xs font-bold text-rose-600 focus:text-rose-700"
                                                        onClick={() => { setSelectedClinic(c); setIsDisableModalOpen(true); }}
                                                    >
                                                        <UserMinus className="w-4 h-4" /> {c.status === 'Inactive' ? 'Re-enable Clinic' : 'Disable Clinic'}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {!loading && filteredClinics.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-[#e4dec3]/40 rounded-full flex items-center justify-center text-[#080e1e]">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <p className="font-bold text-[#080e1e]">No clinics found.</p>
                            <p className="text-slate-500 text-xs">Try adjusting your search criteria or status filter.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Disable Confirm Modal */}
            <Dialog open={isDisableModalOpen} onOpenChange={setIsDisableModalOpen}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-700 font-bold">
                            <AlertCircle className="w-5 h-5" /> Confirm Account Action
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-xs text-slate-600">
                            {selectedClinic?.status === 'Inactive'
                                ? <>Are you sure you want to re-enable <strong>{selectedClinic?.name}</strong>? Clinic staff will regain portal access.</>
                                : <>Are you sure you want to disable <strong>{selectedClinic?.name}</strong>? Associated clinic staff will lose access immediately.</>
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 pt-2">
                        <Button variant="outline" className="border-[#ded8c4] text-xs font-bold rounded-full" onClick={() => setIsDisableModalOpen(false)} disabled={disabling}>Cancel</Button>
                        <Button
                            className="bg-[#080e1e] hover:bg-rose-700 text-white font-bold text-xs rounded-full"
                            disabled={disabling}
                            onClick={async () => {
                                if (!selectedClinic) return;
                                setDisabling(true);
                                try {
                                    const newStatus = selectedClinic.status === 'Inactive' ? 'Active' : 'Inactive';
                                    await axios.put(
                                        `/api/v1/clinics/${selectedClinic.id}`,
                                        { status: newStatus },
                                        { headers: { Authorization: `Bearer ${user?.token}` } }
                                    );
                                    setClinics(prev => prev.map(c =>
                                        c.id === selectedClinic.id ? { ...c, status: newStatus } : c
                                    ));
                                    setIsDisableModalOpen(false);
                                } catch {
                                    // silently fail
                                } finally {
                                    setDisabling(false);
                                }
                            }}
                        >
                            {disabling ? 'Saving…' : selectedClinic?.status === 'Inactive' ? 'Re-enable Clinic' : 'Disable Clinic'}
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

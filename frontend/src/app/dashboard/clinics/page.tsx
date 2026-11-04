'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
    Trash2,
    AlertCircle,
    Users,
    type LucideIcon,
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

interface ClinicListItem {
    id: string;
    name: string;
    contact_name: string;
    email: string | null;
    phone: string | null;
    status: string | null;
    _count?: { patients: number; workflows: number };
}

export default function AllClinicsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [clinics, setClinics] = useState<ClinicListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
    const [selectedClinic, setSelectedClinic] = useState<ClinicListItem | null>(null);
    const [disabling, setDisabling] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [confirmationName, setConfirmationName] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const deletionInFlight = useRef(false);
    const deletedClinics = useRef(new Set<string>());

    useEffect(() => {
        if (!user?.token) return;
        const controller = new AbortController();
        let fetching = false;
        const refresh = async () => {
            if (fetching) return;
            fetching = true;
            try {
                const res = await axios.get<ClinicListItem[]>('/api/v1/clinics', {
                    headers: { Authorization: `Bearer ${user.token}` },
                    signal: controller.signal,
                });
                if (!controller.signal.aborted) setClinics(res.data.filter(clinic => !deletedClinics.current.has(clinic.id)));
            } catch {
                // Keep the last successful list during a temporary connection failure.
            } finally {
                fetching = false;
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        void refresh();
        const timer = window.setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            controller.abort();
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
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
    const inactive = clinics.filter(c => c.status === 'Inactive').length;

    const statusColor = (s: string | null) => {
        if (!s || s === 'Active') return 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-bold';
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

            {/* Clinic search */}
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
                    {searchQuery && (
                            <Button variant="ghost" className="gap-2 text-xs font-bold text-slate-600 hover:text-[#080e1e] rounded-full" onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                                <RotateCcw className="w-3.5 h-3.5" /> Reset
                            </Button>
                    )}
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard title="Total Clinics" value={total} icon={Building2} selected={statusFilter === 'All'} onClick={() => setStatusFilter('All')} />
                <SummaryCard title="Active Clinics" value={active} icon={Activity} selected={statusFilter === 'Active'} onClick={() => setStatusFilter('Active')} />
                <SummaryCard title="Inactive Clinics" value={inactive} icon={UserMinus} selected={statusFilter === 'Inactive'} onClick={() => setStatusFilter('Inactive')} />
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
                                        <TableCell>
                                            <Badge className={`${statusColor(c.status)} text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full`}>
                                                {c.status || 'Active'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} className="h-8 w-8 rounded-full hover:bg-[#080e1e] hover:text-white">
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
                                                    {user?.role === 'ADMIN' && <>
                                                        <DropdownMenuSeparator className="bg-[#e6e0ce]" />
                                                        <DropdownMenuItem className="gap-2 text-xs font-bold text-rose-600 focus:text-rose-700" onClick={() => {
                                                            setSelectedClinic(c); setConfirmationName(''); setDeleteError(''); setIsDeleteModalOpen(true);
                                                        }}>
                                                            <Trash2 className="w-4 h-4" /> Delete Clinic
                                                        </DropdownMenuItem>
                                                    </>}
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
            <Dialog open={isDeleteModalOpen} onOpenChange={open => { if (!deletionInFlight.current) setIsDeleteModalOpen(open); }}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-700 font-bold"><Trash2 className="w-5 h-5" /> Permanently delete clinic?</DialogTitle>
                        <DialogDescription className="pt-2 text-sm leading-relaxed text-slate-600">
                            Deleting <strong>{selectedClinic?.name}</strong> permanently removes its staff accounts, patients, sessions, lab reports, logo and branding from Frigo Flow. This cannot be undone. You can register a new clinic with the same email afterward.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label htmlFor="delete-clinic-confirmation" className="text-sm font-semibold text-[#080e1e]">Type {selectedClinic?.name} to confirm</label>
                        <Input id="delete-clinic-confirmation" autoComplete="off" value={confirmationName} onChange={event => setConfirmationName(event.target.value)} disabled={deleting} />
                        {deleteError && <p role="alert" className="text-sm text-rose-700">{deleteError}</p>}
                    </div>
                    <DialogFooter className="gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>Cancel</Button>
                        <Button type="button" className="bg-rose-700 text-white hover:bg-rose-800" disabled={deleting || confirmationName.trim() !== selectedClinic?.name.trim()} onClick={async () => {
                            if (!selectedClinic || user?.role !== 'ADMIN' || deletionInFlight.current) return;
                            deletionInFlight.current = true; setDeleting(true); setDeleteError('');
                            try {
                                await axios.delete(`/api/v1/clinics/${selectedClinic.id}`, { headers: { Authorization: `Bearer ${user.token}` }, data: { confirmationName: confirmationName.trim() } });
                                deletedClinics.current.add(selectedClinic.id);
                                setClinics(previous => previous.filter(clinic => clinic.id !== selectedClinic.id));
                                setIsDeleteModalOpen(false); setSelectedClinic(null);
                            } catch (error: unknown) {
                                const response = axios.isAxiosError<{ message?: unknown }>(error) ? error.response : undefined;
                                setDeleteError(response && response.status < 500 && typeof response.data?.message === 'string'
                                    ? response.data.message : 'The clinic could not be deleted. Please try again.');
                            } finally { deletionInFlight.current = false; setDeleting(false); }
                        }}>{deleting ? 'Deleting…' : 'Delete Clinic Permanently'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, selected, onClick }: {
    title: string;
    value: number;
    icon: LucideIcon;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={title}
            aria-pressed={selected}
            onClick={onClick}
            className={`flex flex-col w-full border shadow-sm rounded-3xl overflow-hidden p-5 sm:p-6 gap-6 text-left cursor-pointer transition-colors hover:border-[#cbb28d] hover:bg-[#faf8f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c7657] focus-visible:ring-offset-2 ${selected ? 'border-[#cbb28d] bg-[#faf8f3]' : 'border-[#e4dec3]/70 bg-white'}`}
        >
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
            </div>
        </button>
    );
}

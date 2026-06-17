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
            .catch(() => {})
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
        if (!s || s === 'Active') return 'bg-emerald-500';
        if (s === 'Pending') return 'bg-amber-500';
        return 'bg-slate-400';
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">All Clinics</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">Manage clinic accounts, contacts, and workflow activity.</p>
                </div>
            </div>

            {/* Search + Filters */}
            <Card className="border-none shadow-sm overflow-hidden">
                <CardContent className="p-4 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by clinic name, contact, email, or phone"
                            className="pl-10"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <select
                            className="bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="All">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}>
                            <RotateCcw className="w-4 h-4" /> Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard title="Total Clinics" value={total} icon={Building2} color="text-primary" />
                <SummaryCard title="Active Clinics" value={active} icon={Activity} color="text-emerald-500" />
                <SummaryCard title="Pending Clinics" value={pending} icon={RotateCcw} color="text-amber-500" />
                <SummaryCard title="Inactive Clinics" value={inactive} icon={UserMinus} color="text-slate-400" />
            </div>

            {/* Table */}
            <Card className="border-none shadow-sm overflow-hidden min-w-0">
                <CardHeader className="bg-muted/10 border-b">
                    <CardTitle className="text-lg">Clinic Directory</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 py-2">
                                    <Skeleton className="h-4 w-36" />
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-4 flex-1" />
                                    <Skeleton className="h-4 w-8" />
                                    <Skeleton className="h-4 w-8" />
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/50 border-b">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-bold">Clinic Name</TableHead>
                                    <TableHead className="font-bold">Primary Contact</TableHead>
                                    <TableHead className="font-bold">Contact Details</TableHead>
                                    <TableHead className="font-bold text-center">Patients</TableHead>
                                    <TableHead className="font-bold text-center">Workflows</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="text-right font-bold w-[60px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClinics.map(c => (
                                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell
                                            className="font-bold text-primary cursor-pointer hover:underline"
                                            onClick={() => router.push(`/dashboard/clinics/${c.id}`)}
                                        >
                                            {c.name}
                                        </TableCell>
                                        <TableCell className="font-medium text-sm">{c.contact_name || '—'}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {c.email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Mail className="w-3 h-3" /> {c.email}
                                                    </div>
                                                )}
                                                {c.phone && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Phone className="w-3 h-3" /> {c.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold">
                                            <div className="flex items-center justify-center gap-1">
                                                <Users className="w-3 h-3 text-muted-foreground" />
                                                {c._count?.patients ?? 0}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="font-black border-primary/20 text-primary">
                                                {c._count?.workflows ?? 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`${statusColor(c.status)} text-[10px] uppercase font-bold tracking-widest`}>
                                                {c.status || 'Active'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    }
                                                />
                                                <DropdownMenuContent align="end" className="w-[160px]">
                                                    <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/clinics/${c.id}`)}>
                                                        <Eye className="w-4 h-4" /> View Patients
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="gap-2 text-destructive focus:text-destructive"
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
                        <div className="p-12 text-center flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <Building2 className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <p className="font-bold text-lg">No clinics found.</p>
                            <p className="text-muted-foreground text-sm">Try adjusting your search or filters.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Disable confirm */}
            <Dialog open={isDisableModalOpen} onOpenChange={setIsDisableModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="w-5 h-5" /> Confirm Action
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {selectedClinic?.status === 'Inactive'
                                ? <>Are you sure you want to re-enable <strong>{selectedClinic?.name}</strong>? Clinic users will regain access to the portal.</>
                                : <>Are you sure you want to disable <strong>{selectedClinic?.name}</strong>? All associated clinic users will lose access to the portal.</>
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsDisableModalOpen(false)} disabled={disabling}>Cancel</Button>
                        <Button
                            variant="destructive"
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Upload, Download, Search, RotateCcw, FlaskConical, Clock,
    CheckCircle2, Send, FileText, Eye, Mail, Building2,
    Paperclip, AlertCircle, BarChart3,
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const API = '/api/v1';

const getResultStatusBadge = (status: string) => {
    switch (status) {
        case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'Available': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'Reviewed': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'Sent to Clinic': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        default: return 'bg-slate-100 text-slate-600';
    }
};

export default function LabResultsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    const [results, setResults] = useState<any[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [clinics, setClinics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedResult, setSelectedResult] = useState<any>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Upload form state
    const [uploadForm, setUploadForm] = useState({
        patient_id: '', clinic_id: '', test_name: '',
        result_date: '', status: 'Available', notes: '',
    });
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const authHeader = { Authorization: `Bearer ${token}` };

    const loadResults = async () => {
        try {
            const res = await axios.get(`${API}/lab-results`, { headers: authHeader });
            setResults(res.data);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                const [pRes, cRes] = await Promise.all([
                    axios.get(`${API}/patients`, { headers: authHeader }),
                    isAdmin ? axios.get(`${API}/clinics`, { headers: authHeader }) : Promise.resolve({ data: [] }),
                ]);
                setPatients(pRes.data);
                setClinics(cRes.data);
                await loadResults();
            } finally {
                setLoading(false);
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When patient is selected, auto-fill clinic and test type (both locked)
    const handlePatientChange = (patientId: string) => {
        const patient = patients.find((p: any) => p.id === patientId);
        setUploadForm(f => ({
            ...f,
            patient_id: patientId,
            clinic_id: patient?.clinic_id || '',
            test_name: patient?.workflows?.[0]?.test_type || '',
        }));
    };

    const selectedPatient = patients.find((p: any) => p.id === uploadForm.patient_id);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadForm.patient_id) { setUploadError('Please select a patient.'); return; }
        if (!uploadForm.clinic_id) { setUploadError('Please select a clinic.'); return; }
        if (!uploadFile) { setUploadError('Please select a file to upload.'); return; }

        setUploading(true);
        setUploadError('');
        try {
            const fd = new FormData();
            fd.append('file', uploadFile);
            fd.append('patient_id', uploadForm.patient_id);
            fd.append('clinic_id', uploadForm.clinic_id);
            fd.append('test_name', uploadForm.test_name);
            fd.append('result_date', uploadForm.result_date);
            fd.append('status', uploadForm.status);
            fd.append('notes', uploadForm.notes);

            await axios.post(`${API}/lab-results`, fd, {
                headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
            });

            await loadResults();
            setIsUploadModalOpen(false);
            setUploadForm({ patient_id: '', clinic_id: '', test_name: '', result_date: '', status: 'Available', notes: '' });
            setUploadFile(null);
        } catch (err: any) {
            setUploadError(err.response?.data?.message || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const filtered = results.filter(r => {
        const name = `${r.patient?.first_name} ${r.patient?.last_name}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        return !q || name.includes(q) || r.clinic?.name?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    });

    const pending = filtered.filter(r => r.status === 'Pending');
    const available = filtered.filter(r => r.status === 'Available' || r.status === 'Reviewed');
    const sent = filtered.filter(r => r.status === 'Sent to Clinic');

    const openDrawer = (r: any) => { setSelectedResult(r); setIsDrawerOpen(true); };
    const openSend = (r: any) => { setSelectedResult(r); setIsSendModalOpen(true); };

    const patientName = (r: any) => r?.patient ? `${r.patient.first_name} ${r.patient.last_name}` : '—';
    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">Lab Results</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">Upload, review, track, and share patient lab results with clinics.</p>
                </div>
                {isAdmin && (
                    <Button className="gap-2 bg-primary shadow-lg hover:bg-primary/90 self-start" onClick={() => { setUploadError(''); setIsUploadModalOpen(true); }}>
                        <Upload className="w-4 h-4" /> Upload Result
                    </Button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
                <SummaryCard title="Total Results" value={results.length} icon={FlaskConical} color="text-primary" />
                <SummaryCard title="Pending" value={results.filter(r => r.status === 'Pending').length} icon={Clock} color="text-amber-500" />
                <SummaryCard title="Available" value={results.filter(r => r.status === 'Available').length} icon={CheckCircle2} color="text-emerald-500" />
                <SummaryCard title="Reviewed" value={results.filter(r => r.status === 'Reviewed').length} icon={Eye} color="text-blue-500" />
                <SummaryCard title="Sent to Clinics" value={results.filter(r => r.status === 'Sent to Clinic').length} icon={Send} color="text-indigo-500" />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="all" className="w-full">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
                    <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
                        <TabsTrigger value="all">All Results</TabsTrigger>
                        <TabsTrigger value="pending">
                            Pending {pending.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 h-4 text-[10px] bg-amber-50 text-amber-600">{pending.length}</Badge>}
                        </TabsTrigger>
                        <TabsTrigger value="available">Available</TabsTrigger>
                        <TabsTrigger value="sent">Sent to Clinic</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2 flex-1 md:max-w-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Search patient, clinic, ID…" className="pl-10 h-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSearchQuery('')}>
                            <RotateCcw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* All Results */}
                <TabsContent value="all" className="mt-0">
                    <TableCard title="Lab Results Directory" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
                        <TableHeader className="bg-muted/30 border-b">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Patient</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Clinic</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Uploaded</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-7 w-20 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))}
                                </>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No lab results found.</TableCell></TableRow>
                            ) : filtered.map(r => (
                                <TableRow key={r.id} className="hover:bg-muted/20 transition-colors">
                                    <TableCell className="font-bold text-primary">{patientName(r)}</TableCell>
                                    <TableCell className="text-xs">{r.clinic?.name || '—'}</TableCell>
                                    <TableCell className="text-xs">{r.test_name || '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`${getResultStatusBadge(r.status)} text-[10px] font-bold border`}>{r.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.uploaded_at)} <span className="text-foreground font-medium">by {r.user?.name}</span></TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon-sm" onClick={() => openDrawer(r)}><Eye className="w-4 h-4" /></Button>
                                            {r.file_url && (
                                                <a href={`${r.file_url}`} download={r.file_name || 'lab_result'}>
                                                    <Button variant="ghost" size="icon-sm"><Download className="w-4 h-4" /></Button>
                                                </a>
                                            )}
                                            {isAdmin && r.status !== 'Sent to Clinic' && (
                                                <Button variant="ghost" size="icon-sm" onClick={() => openSend(r)}><Send className="w-4 h-4" /></Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </TableCard>
                </TabsContent>

                {/* Pending */}
                <TabsContent value="pending" className="mt-0">
                    <TableCard title="Pending Lab Results" icon={<AlertCircle className="w-4 h-4 text-amber-500" />}>
                        <TableHeader className="bg-muted/30 border-b">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Patient</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Clinic</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Uploaded</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pending.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No pending results.</TableCell></TableRow>
                            ) : pending.map(r => (
                                <TableRow key={r.id} className="hover:bg-amber-50/30 transition-colors">
                                    <TableCell className="font-bold text-amber-900">{patientName(r)}</TableCell>
                                    <TableCell className="text-xs">{r.clinic?.name || '—'}</TableCell>
                                    <TableCell className="text-xs">{r.test_name || '—'}</TableCell>
                                    <TableCell className="text-xs">{formatDate(r.uploaded_at)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon-sm" onClick={() => openDrawer(r)}><Eye className="w-4 h-4" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </TableCard>
                </TabsContent>

                {/* Available */}
                <TabsContent value="available" className="mt-0">
                    <TableCard title="Available Lab Results" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}>
                        <TableHeader className="bg-muted/30 border-b">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Patient</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Clinic</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Uploaded</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {available.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No available results.</TableCell></TableRow>
                            ) : available.map(r => (
                                <TableRow key={r.id} className="hover:bg-muted/20 transition-colors">
                                    <TableCell className="font-bold text-primary">{patientName(r)}</TableCell>
                                    <TableCell className="text-xs">{r.clinic?.name || '—'}</TableCell>
                                    <TableCell className="text-xs">{r.test_name || '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`${getResultStatusBadge(r.status)} text-[10px] font-bold border`}>{r.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{formatDate(r.uploaded_at)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon-sm" onClick={() => openDrawer(r)}><Eye className="w-4 h-4" /></Button>
                                            {isAdmin && (
                                                <Button variant="ghost" size="sm" className="text-xs gap-1 text-indigo-600 hover:bg-indigo-50" onClick={() => openSend(r)}>
                                                    <Send className="w-3 h-3" /> Send
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </TableCard>
                </TabsContent>

                {/* Sent */}
                <TabsContent value="sent" className="mt-0">
                    <TableCard title="Results Sent to Clinics" icon={<Send className="w-4 h-4 text-indigo-500" />}>
                        <TableHeader className="bg-muted/30 border-b">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Patient</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Clinic</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Test Type</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider">Uploaded</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sent.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No results sent yet.</TableCell></TableRow>
                            ) : sent.map(r => (
                                <TableRow key={r.id} className="hover:bg-muted/20 transition-colors">
                                    <TableCell className="font-bold text-primary">{patientName(r)}</TableCell>
                                    <TableCell className="text-xs">{r.clinic?.name || '—'}</TableCell>
                                    <TableCell className="text-xs">{r.test_name || '—'}</TableCell>
                                    <TableCell className="text-xs">{formatDate(r.uploaded_at)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon-sm" onClick={() => openDrawer(r)}><Eye className="w-4 h-4" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </TableCard>
                </TabsContent>
            </Tabs>

            {/* ─── Upload Modal ─── */}
            <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /> Upload Lab Result</DialogTitle>
                        <DialogDescription>Add a new lab result file for a patient.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpload}>
                        <div className="grid gap-4 py-4">
                            <FormRow label="Select Patient *">
                                <select
                                    className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                                    value={uploadForm.patient_id}
                                    onChange={e => handlePatientChange(e.target.value)}
                                    required
                                >
                                    <option value="">Select a patient…</option>
                                    {patients.map((p: any) => (
                                        <option key={p.id} value={p.id}>
                                            {p.first_name} {p.last_name} {p.clinic?.name ? `— ${p.clinic.name}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </FormRow>

                            <FormRow label="Clinic">
                                <Input
                                    value={selectedPatient ? (selectedPatient.clinic?.name || '—') : ''}
                                    readOnly
                                    placeholder="Auto-filled when patient is selected"
                                    className="bg-muted/40 cursor-not-allowed text-muted-foreground"
                                />
                            </FormRow>

                            <FormRow label="Test Type">
                                <Input
                                    value={uploadForm.test_name}
                                    readOnly
                                    placeholder="Auto-filled from patient's workflow"
                                    className="bg-muted/40 cursor-not-allowed text-muted-foreground"
                                />
                            </FormRow>

                            <FormRow label="Result Date">
                                <Input
                                    type="date"
                                    value={uploadForm.result_date}
                                    onChange={e => setUploadForm(f => ({ ...f, result_date: e.target.value }))}
                                />
                            </FormRow>

                            <FormRow label="Upload File *">
                                <div
                                    className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                                    {uploadFile ? (
                                        <p className="font-medium text-foreground">{uploadFile.name}</p>
                                    ) : (
                                        <>
                                            <p className="font-medium">Click to upload or drag and drop</p>
                                            <p className="text-xs mt-1">PDF, JPG, PNG — max 10 MB</p>
                                        </>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                            </FormRow>

                            <FormRow label="Result Status">
                                <select
                                    className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                                    value={uploadForm.status}
                                    onChange={e => setUploadForm(f => ({ ...f, status: e.target.value }))}
                                >
                                    <option>Available</option>
                                    <option>Pending</option>
                                    <option>Reviewed</option>
                                    <option>Sent to Clinic</option>
                                </select>
                            </FormRow>

                            <FormRow label="Notes">
                                <Input
                                    placeholder="Internal notes (optional)…"
                                    value={uploadForm.notes}
                                    onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                                />
                            </FormRow>

                            {uploadError && (
                                <p className="text-sm text-destructive font-medium">{uploadError}</p>
                            )}
                        </div>
                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsUploadModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={uploading} className="gap-2">
                                <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload Result'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ─── Send to Clinic Modal ─── */}
            <Dialog open={isSendModalOpen} onOpenChange={setIsSendModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> Send Lab Result to Clinic</DialogTitle>
                        <DialogDescription>Send <strong>{patientName(selectedResult)}</strong>'s result to their clinic.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <FormRow label="Clinic">
                            <Input value={selectedResult?.clinic?.name || ''} readOnly className="bg-muted/40" />
                        </FormRow>
                        <FormRow label="Recipient Email">
                            <Input key={selectedResult?.id} defaultValue={selectedResult?.clinic?.email || ''} placeholder="clinic@example.com" />
                        </FormRow>
                        <FormRow label="Subject">
                            <Input defaultValue={`Lab Result Available for ${patientName(selectedResult)}`} />
                        </FormRow>
                        <FormRow label="Message">
                            <textarea
                                rows={5}
                                className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/20 resize-none"
                                defaultValue={`Hello ${selectedResult?.clinic?.name || ''},\n\nThe lab result for ${patientName(selectedResult)} is now available in Frigo Labs.\n\nPlease log in to review the result.\n\nThank you,\nFrigo Labs Team`}
                            />
                        </FormRow>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="w-4 h-4 rounded" /> Attach Result File</label>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsSendModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (selectedResult) {
                                    await axios.patch(`${API}/lab-results/${selectedResult.id}/status`, { status: 'Sent to Clinic' }, { headers: authHeader });
                                    await loadResults();
                                }
                                setIsSendModalOpen(false);
                            }}
                            className="gap-2"
                        >
                            <Send className="w-4 h-4" /> Send Result
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Detail Drawer ─── */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetContent className="sm:max-w-[420px] p-0 overflow-y-auto flex flex-col">
                    {/* Drawer Header */}
                    <div className="bg-gradient-to-br from-primary to-primary/80 text-white px-6 pt-8 pb-6">
                        <div className="flex items-center gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest mb-3">
                            <FlaskConical className="w-3 h-3" /> Result #{selectedResult?.id?.slice(0, 8)}
                        </div>
                        <SheetTitle className="text-2xl font-extrabold text-white mb-1">
                            {patientName(selectedResult)}
                        </SheetTitle>
                        <SheetDescription className="text-white/70 text-sm font-medium flex items-center gap-2 mt-1">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            {selectedResult?.clinic?.name || '—'}
                        </SheetDescription>
                        {selectedResult?.test_name && (
                            <div className="mt-3">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/15 text-white text-xs font-semibold">
                                    {selectedResult.test_name}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 px-6 py-6 space-y-6">
                        {/* Status + Dates */}
                        <div className="rounded-xl border bg-card overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                                <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Status</span>
                                <Badge variant="outline" className={`${getResultStatusBadge(selectedResult?.status)} font-bold border text-[10px] px-2.5`}>
                                    {selectedResult?.status}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                                <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Uploaded</span>
                                <span className="text-sm font-semibold">{formatDate(selectedResult?.uploaded_at)}</span>
                            </div>
                            {selectedResult?.result_date && (
                                <div className="flex items-center justify-between px-4 py-3 border-b">
                                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Result Date</span>
                                    <span className="text-sm font-semibold">{formatDate(selectedResult?.result_date)}</span>
                                </div>
                            )}
                            {selectedResult?.user?.name && (
                                <div className="flex items-center justify-between px-4 py-3">
                                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Uploaded By</span>
                                    <span className="text-sm font-semibold">{selectedResult.user.name}</span>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {selectedResult?.notes && (
                            <div className="rounded-xl border bg-amber-50 border-amber-200 px-4 py-3">
                                <p className="text-[10px] font-bold uppercase text-amber-600 tracking-wider mb-1">Notes</p>
                                <p className="text-sm text-amber-900">{selectedResult.notes}</p>
                            </div>
                        )}

                        {/* Result File */}
                        <div className="space-y-3">
                            <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Result File</p>
                            {selectedResult?.file_url ? (
                                <>
                                    <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <FileText className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate">{selectedResult.file_name || 'lab_result.pdf'}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">Uploaded {formatDate(selectedResult.uploaded_at)}</p>
                                        </div>
                                    </div>
                                    <a
                                        href={`${selectedResult.file_url}`}
                                        download={selectedResult.file_name || 'lab_result'}
                                        className="block"
                                    >
                                        <Button variant="outline" className="w-full gap-2">
                                            <Download className="w-4 h-4" /> Download File
                                        </Button>
                                    </a>
                                </>
                            ) : (
                                <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center text-center gap-2 text-muted-foreground">
                                    <FileText className="w-8 h-8 opacity-20" />
                                    <p className="text-xs font-medium">No file attached</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    {isAdmin && (
                        <div className="px-6 pb-6 pt-2 border-t space-y-2 bg-background">
                            {selectedResult?.status === 'Sent to Clinic' ? (
                                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
                                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                                    <span className="text-sm font-semibold text-indigo-700">Already sent to clinic</span>
                                </div>
                            ) : (
                                <Button className="w-full gap-2" onClick={() => { setIsDrawerOpen(false); openSend(selectedResult); }}>
                                    <Send className="w-4 h-4" /> Send to Clinic
                                </Button>
                            )}
                            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setIsDrawerOpen(false)}>
                                Close
                            </Button>
                        </div>
                    )}
                    {!isAdmin && (
                        <div className="px-6 pb-6 pt-2 border-t bg-background">
                            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setIsDrawerOpen(false)}>
                                Close
                            </Button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
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

function TableCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="border-none shadow-sm overflow-hidden min-w-0">
            <CardHeader className="bg-muted/10 border-b py-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">{icon} {title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>{children}</Table>
            </CardContent>
        </Card>
    );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{label}</label>
            {children}
        </div>
    );
}

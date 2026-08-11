'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
    FlaskConical, Upload, Eye, Send, FileText, CheckCircle2,
    Clock, Search, RotateCcw, Building2, User, Calendar,
    BarChart3, AlertCircle, ExternalLink, Download, Check, X, ShieldCheck, Mail, Paperclip
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const API = '/api/v1';

const STATUS_BADGES: Record<string, string> = {
    'Pending': 'bg-amber-950/20 text-amber-900 border border-amber-900/30',
    'Available': 'bg-sky-950/20 text-sky-900 border border-sky-900/30',
    'Reviewed': 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30',
    'Sent to Clinic': 'bg-[#080e1e] text-[#cbb28d] border border-[#cbb28d]/30 font-bold',
};

export default function LabResultsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    const [results, setResults] = useState<any[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [clinics, setClinics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Upload Modal State (Matching User's Original Form)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState('');
    const [resultDate, setResultDate] = useState(new Date().toISOString().split('T')[0]);
    const [resultStatus, setResultStatus] = useState('Available');
    const [notes, setNotes] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    // Send Modal State
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [sendingResult, setSendingResult] = useState<any>(null);
    const [selectedClinicId, setSelectedClinicId] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState('');

    // Detail Drawer State
    const [selectedResult, setSelectedResult] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const authHeader = useMemo(() => ({ Authorization: `Bearer ${user?.token}` }), [user?.token]);

    const fetchData = useCallback(async () => {
        if (!user?.token) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [resData, patData, clinData] = await Promise.all([
                axios.get(`${API}/lab-results`, { headers: authHeader }).then(r => r.data).catch(() => []),
                axios.get(`${API}/patients`, { headers: authHeader }).then(r => r.data).catch(() => []),
                isAdmin ? axios.get(`${API}/clinics`, { headers: authHeader }).then(r => r.data).catch(() => []) : Promise.resolve([]),
            ]);
            setResults(resData);
            setPatients(patData);
            setClinics(clinData);
        } catch (err) {
            console.error("Failed to load lab results", err);
        } finally {
            setLoading(false);
        }
    }, [user?.token, isAdmin, authHeader]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Selected Patient details for auto-fill
    const selectedPatient = useMemo(() => {
        return patients.find(p => p.id === selectedPatientId);
    }, [patients, selectedPatientId]);

    const handleFileChange = (file: File | null) => {
        if (!file) return;
        setUploadError('');
        setSelectedFile(file);
        const mockUrl = URL.createObjectURL(file);
        setFileUrl(mockUrl);
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        const finalUrl = fileUrl || (selectedFile ? `https://storage.frigoflow.com/lab-reports/${selectedFile.name}` : '');
        if (!selectedPatientId) {
            setUploadError('Please select a patient.');
            return;
        }
        if (!selectedFile && !fileUrl.trim()) {
            setUploadError('Please attach a lab result file.');
            return;
        }
        setUploading(true); setUploadError('');
        try {
            await axios.post(`${API}/lab-results`, {
                patient_id: selectedPatientId,
                test_package: selectedPatient?.workflows?.[0]?.test_type || 'Standard Diagnostics',
                file_url: finalUrl,
                status: resultStatus || 'Available',
                result_date: resultDate,
                notes: notes || undefined
            }, { headers: authHeader });

            setIsUploadModalOpen(false);
            setSelectedPatientId(''); setFileUrl(''); setSelectedFile(null); setNotes('');
            await fetchData();
        } catch (err: any) {
            setUploadError(err?.response?.data?.message || 'Failed to upload lab result.');
        } finally {
            setUploading(false);
        }
    };

    const handleSendToClinic = async () => {
        if (!sendingResult || !selectedClinicId) return;
        setSending(true);
        try {
            await axios.patch(`${API}/lab-results/${sendingResult.id}/send`, { clinic_id: selectedClinicId }, { headers: authHeader });
            setSendSuccess('Report successfully transmitted to clinic!');
            setTimeout(() => {
                setIsSendModalOpen(false);
                setSendingResult(null);
                setSelectedClinicId('');
                setSendSuccess('');
                fetchData();
            }, 1200);
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Failed to transmit report.');
        } finally {
            setSending(false);
        }
    };

    const openSendModal = (r: any) => {
        setSendingResult(r);
        setSelectedClinicId(r.patient?.clinic_id || clinics[0]?.id || '');
        setSendSuccess('');
        setIsSendModalOpen(true);
    };

    const filtered = useMemo(() => {
        if (!searchQuery) return results;
        const q = searchQuery.toLowerCase();
        return results.filter(r =>
            r.patient?.first_name?.toLowerCase().includes(q) ||
            r.patient?.last_name?.toLowerCase().includes(q) ||
            r.test_package?.toLowerCase().includes(q) ||
            r.status?.toLowerCase().includes(q) ||
            r.patient?.clinic?.name?.toLowerCase().includes(q)
        );
    }, [results, searchQuery]);

    const pending = filtered.filter(r => r.status === 'Pending');
    const available = filtered.filter(r => r.status === 'Available');
    const sent = filtered.filter(r => r.status === 'Sent to Clinic');

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-full overflow-hidden pb-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <span className="text-[10px] font-mono tracking-[0.25em] text-[#8c7657] uppercase font-bold block mb-1">

                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">
                        Lab Results Center
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">

                    </p>
                </div>
                {isAdmin && (
                    <Button
                        className="gap-2 bg-[#080e1e] hover:bg-white hover:text-[#080e1e] text-[#f7f3e8] font-bold text-xs rounded-full shadow-sm px-5 h-10 transition-colors"
                        onClick={() => { setUploadError(''); setIsUploadModalOpen(true); }}
                    >
                        <Upload className="w-4 h-4 text-[#cbb28d]" /> Upload Lab Result
                    </Button>
                )}
            </div>

            {/* Off-White & Cream Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
                <SummaryCard title="Total Reports" value={results.length} icon={FlaskConical} />
                <SummaryCard title="Pending" value={results.filter(r => r.status === 'Pending').length} icon={Clock} />
                <SummaryCard title="Available" value={results.filter(r => r.status === 'Available').length} icon={CheckCircle2} />
                <SummaryCard title="Reviewed" value={results.filter(r => r.status === 'Reviewed').length} icon={Eye} />
                <SummaryCard title="Sent to Clinics" value={results.filter(r => r.status === 'Sent to Clinic').length} icon={Send} />
            </div>

            {/* Tabs & Table */}
            <Tabs defaultValue="all" className="w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <TabsList className="bg-white/10 p-1 rounded-full border border-white/20 flex-wrap shadow-xs">
                        <TabsTrigger value="all" className="text-xs font-bold text-slate-300 rounded-full px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            All Results
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="text-xs font-bold text-slate-300 rounded-full px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            Pending {pending.length > 0 && <Badge className="ml-1 px-1.5 py-0 text-[10px] bg-amber-950/20 text-amber-900 border-none">{pending.length}</Badge>}
                        </TabsTrigger>
                        <TabsTrigger value="available" className="text-xs font-bold text-slate-300 rounded-full px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            Available
                        </TabsTrigger>
                        <TabsTrigger value="sent" className="text-xs font-bold text-slate-300 rounded-full px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-[#080e1e] transition-colors">
                            Sent to Clinic
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 flex-1 md:max-w-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search patient, clinic, ID..."
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

                <TabsContent value="all" className="mt-0">
                    <ResultTable data={filtered} loading={loading} isAdmin={isAdmin} openSendModal={openSendModal} setSelectedResult={setSelectedResult} setIsDrawerOpen={setIsDrawerOpen} />
                </TabsContent>
                <TabsContent value="pending" className="mt-0">
                    <ResultTable data={pending} loading={loading} isAdmin={isAdmin} openSendModal={openSendModal} setSelectedResult={setSelectedResult} setIsDrawerOpen={setIsDrawerOpen} />
                </TabsContent>
                <TabsContent value="available" className="mt-0">
                    <ResultTable data={available} loading={loading} isAdmin={isAdmin} openSendModal={openSendModal} setSelectedResult={setSelectedResult} setIsDrawerOpen={setIsDrawerOpen} />
                </TabsContent>
                <TabsContent value="sent" className="mt-0">
                    <ResultTable data={sent} loading={loading} isAdmin={isAdmin} openSendModal={openSendModal} setSelectedResult={setSelectedResult} setIsDrawerOpen={setIsDrawerOpen} />
                </TabsContent>
            </Tabs>

            {/* Upload Modal (Exact Original Fields as Shared Screenshot) */}
            <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#080e1e] font-bold text-lg">
                            <Upload className="w-5 h-5 text-[#8c7657]" /> Upload Lab Result
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            Add a new lab result file for a patient.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleUpload} className="space-y-4 py-2">
                        {/* SELECT PATIENT * */}
                        <FormRow label="SELECT PATIENT *">
                            <select
                                className="w-full bg-white border border-[#ded8c4] rounded-xl px-3 py-2.5 text-xs font-bold text-[#080e1e] outline-none focus:border-[#080e1e]"
                                value={selectedPatientId}
                                onChange={e => setSelectedPatientId(e.target.value)}
                                required
                            >
                                <option value="">Select a patient...</option>
                                {patients.map(p => (
                                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                ))}
                            </select>
                        </FormRow>

                        {/* CLINIC (Auto-filled) */}
                        <FormRow label="CLINIC">
                            <Input
                                disabled
                                readOnly
                                value={selectedPatient?.clinic?.name || 'Auto-filled when patient is selected'}
                                className="h-10 bg-[#080e1e] border-[#ded8c4] text-xs font-medium text-slate-600 rounded-xl cursor-not-allowed"
                            />
                        </FormRow>

                        {/* TEST TYPE (Auto-filled) */}
                        <FormRow label="TEST TYPE">
                            <Input
                                disabled
                                readOnly
                                value={selectedPatient?.workflows?.[0]?.test_type || 'Auto-filled from patient\'s workflow'}
                                className="h-10 bg-[#080e1e] border-[#ded8c4] text-xs font-medium text-slate-600 rounded-xl cursor-not-allowed"
                            />
                        </FormRow>

                        {/* RESULT DATE */}
                        <FormRow label="RESULT DATE">
                            <Input
                                type="date"
                                value={resultDate}
                                onChange={e => setResultDate(e.target.value)}
                                className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl"
                            />
                        </FormRow>

                        {/* UPLOAD FILE * (Paperclip Dropzone) */}
                        <FormRow label="UPLOAD FILE *">
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragActive(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        handleFileChange(e.dataTransfer.files[0]);
                                    }
                                }}
                                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-colors ${dragActive ? 'border-[#080e1e] bg-white' : 'border-[#ded8c4] bg-white hover:border-[#080e1e]'
                                    }`}
                            >
                                <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                                    className="hidden"
                                    id="orig-lab-pdf-upload"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            handleFileChange(e.target.files[0]);
                                        }
                                    }}
                                />

                                {selectedFile ? (
                                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#e6e0ce]">
                                        <div className="flex items-center gap-2.5 text-left">
                                            <div className="p-2 rounded-lg bg-[#080e1e] text-[#cbb28d]">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-[#080e1e] truncate max-w-[240px]">{selectedFile.name}</p>
                                                <p className="text-[10px] text-slate-500 font-mono">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-rose-700 hover:bg-white rounded-full"
                                            onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setFileUrl(''); }}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <label htmlFor="orig-lab-pdf-upload" className="cursor-pointer block space-y-1.5 py-1">
                                        <Paperclip className="w-6 h-6 text-slate-400 mx-auto" />
                                        <p className="text-xs font-bold text-[#080e1e]">
                                            Click to upload or drag and drop
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-mono">
                                            PDF, JPG, PNG — max 10 MB
                                        </p>
                                    </label>
                                )}
                            </div>
                        </FormRow>

                        {/* RESULT STATUS */}
                        <FormRow label="RESULT STATUS">
                            <select
                                className="w-full bg-white border border-[#ded8c4] rounded-xl px-3 py-2.5 text-xs font-bold text-[#080e1e] outline-none focus:border-[#080e1e]"
                                value={resultStatus}
                                onChange={e => setResultStatus(e.target.value)}
                            >
                                <option value="Available">Available</option>
                                <option value="Pending">Pending</option>
                                <option value="Reviewed">Reviewed</option>
                                <option value="Sent to Clinic">Sent to Clinic</option>
                            </select>
                        </FormRow>

                        {/* NOTES */}
                        <FormRow label="NOTES">
                            <Input
                                placeholder="Internal notes (optional)..."
                                className="h-10 bg-white border-[#ded8c4] text-xs font-medium rounded-xl"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </FormRow>

                        {uploadError && <p className="text-xs font-bold text-rose-700">{uploadError}</p>}

                        <DialogFooter className="gap-2 pt-3">
                            <Button type="button" variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={() => setIsUploadModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={uploading} className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-1.5 px-5">
                                <Upload className="w-3.5 h-3.5 text-[#cbb28d]" />
                                {uploading ? 'Uploading...' : 'Upload Result'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Transmit Modal */}
            <Dialog open={isSendModalOpen} onOpenChange={setIsSendModalOpen}>
                <DialogContent className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#080e1e] font-bold">
                            <Mail className="w-5 h-5 text-[#cbb28d]" /> Transmit Result to Clinic
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <FormRow label="Target Clinic">
                            <select
                                className="w-full bg-white border border-[#ded8c4] rounded-xl px-3 py-2 text-xs font-bold text-[#080e1e] outline-none"
                                value={selectedClinicId}
                                onChange={e => setSelectedClinicId(e.target.value)}
                            >
                                {clinics.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </FormRow>
                        {sendSuccess && <p className="text-xs font-bold text-emerald-700">{sendSuccess}</p>}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={() => setIsSendModalOpen(false)}>Cancel</Button>
                        <Button disabled={sending} className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full" onClick={handleSendToClinic}>
                            {sending ? 'Transmitting...' : 'Transmit Report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detail Drawer */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetContent className="bg-white border-[#e4dec3] sm:max-w-md overflow-y-auto">
                    <SheetHeader className="pb-4 border-b border-[#e6e0ce]">
                        <SheetTitle className="text-[#080e1e] font-bold text-lg flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[#8c7657]" /> Lab Report Summary
                        </SheetTitle>
                        <SheetDescription className="text-xs text-slate-500">
                            Diagnostic telemetry report metadata & verified document reference.
                        </SheetDescription>
                    </SheetHeader>

                    {selectedResult && (
                        <div className="space-y-5 py-5 text-xs">
                            {/* Hero Patient Card */}
                            <div className="p-5 rounded-3xl bg-white border border-[#e4dec3]/70 shadow-[0_4px_20px_rgba(8,14,30,0.04)] space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-base flex items-center justify-center border-2 border-[#faf8f3] shadow-xs">
                                            {selectedResult.patient?.first_name?.[0]}{selectedResult.patient?.last_name?.[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-[#080e1e] text-base">
                                                {selectedResult.patient?.first_name} {selectedResult.patient?.last_name}
                                            </h3>
                                            <span className="text-[10px] font-mono font-bold text-[#8c7657]">
                                                ID #{selectedResult.id?.slice(-6)?.toUpperCase() || '482910'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${STATUS_BADGES[selectedResult.status] || 'bg-slate-200 text-slate-800'}`}>
                                        {selectedResult.status}
                                    </span>
                                </div>

                                {/* Metadata Grid */}
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#e6e0ce]">
                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <Building2 className="w-3 h-3 text-[#cbb28d]" /> Clinic
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] truncate">
                                            {selectedResult.patient?.clinic?.name || 'Frigo Network'}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <FlaskConical className="w-3 h-3 text-[#cbb28d]" /> Package
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] truncate">
                                            {selectedResult.test_package || 'General Panel'}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-[#cbb28d]" /> Uploaded Date
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e] font-mono">
                                            {new Date(selectedResult.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                        <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] block flex items-center gap-1">
                                            <ShieldCheck className="w-3 h-3 text-[#cbb28d]" /> Security
                                        </span>
                                        <p className="font-bold text-xs text-[#080e1e]">
                                            Verified Telemetry
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Internal Clinical Note */}
                            <div className="p-4 rounded-2xl bg-white border border-[#e4dec3]/70 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#080e1e]">
                                    <FileText className="w-4 h-4 text-[#8c7657]" />
                                    <span>Physician & Diagnostic Notes</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    {selectedResult.notes || 'Lab test results compiled and ready for physician review & transmission.'}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2 pt-2">
                                {selectedResult.file_url ? (
                                    <Button
                                        className="w-full bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full h-11 gap-2 shadow-sm"
                                        onClick={() => window.open(selectedResult.file_url, '_blank')}
                                    >
                                        <ExternalLink className="w-4 h-4 text-[#cbb28d]" /> Open PDF Report Document
                                    </Button>
                                ) : (
                                    <p className="text-center text-xs text-slate-400 italic">No attached PDF file document.</p>
                                )}

                                {isAdmin && selectedResult.status !== 'Sent to Clinic' && (
                                    <Button
                                        variant="outline"
                                        className="w-full border-[#ded8c4] text-[#080e1e] font-bold text-xs rounded-full h-10 gap-2 bg-white hover:bg-[#080e1e]"
                                        onClick={() => {
                                            setIsDrawerOpen(false);
                                            openSendModal(selectedResult);
                                        }}
                                    >
                                        <Send className="w-4 h-4 text-[#8c7657]" /> Transmit Report to Clinic
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function ResultTable({ data, loading, isAdmin, openSendModal, setSelectedResult, setIsDrawerOpen }: any) {
    const patientName = (r: any) => r?.patient ? `${r.patient.first_name} ${r.patient.last_name}` : '—';
    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return (
        <TableCard title="Lab Results Directory" icon={<BarChart3 className="w-4 h-4 text-[#cbb28d]" />}>
            <TableHeader className="bg-[#f2ede0]/80 border-b border-[#e6e0ce]">
                <TableRow>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Patient</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Clinic</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Test Package</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Status</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e]">Uploaded Date</TableHead>
                    <TableHead className="font-mono text-xs tracking-wider font-bold uppercase text-[#080e1e] text-right pr-6">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-28 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20 rounded-full bg-[#e4dec3]/50" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-28 bg-[#e4dec3]/50" /></TableCell>
                                <TableCell className="text-right pr-6"><Skeleton className="h-7 w-20 ml-auto bg-[#e4dec3]/50" /></TableCell>
                            </TableRow>
                        ))}
                    </>
                ) : data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-500 text-xs italic">No lab results found in this view.</TableCell></TableRow>
                ) : data.map((r: any) => (
                    <TableRow key={r.id} className="hover:bg-[#f3eee0] transition-colors border-b border-[#e6e0ce]">
                        <TableCell className="font-bold text-xs text-[#080e1e]">{patientName(r)}</TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">{r.patient?.clinic?.name || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">{r.test_package || 'General'}</TableCell>
                        <TableCell>
                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${STATUS_BADGES[r.status] || 'bg-slate-200 text-slate-800'}`}>
                                {r.status}
                            </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{formatDate(r.uploaded_at)}</TableCell>
                        <TableCell className="text-right pr-6 space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#080e1e] hover:bg-white rounded-full" onClick={() => { setSelectedResult(r); setIsDrawerOpen(true); }}>
                                <Eye className="w-4 h-4 text-[#cbb28d]" />
                            </Button>
                            {r.file_url && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-700 hover:bg-white rounded-full" onClick={() => window.open(r.file_url, '_blank')}>
                                    <Download className="w-4 h-4" />
                                </Button>
                            )}
                            {isAdmin && r.status !== 'Sent to Clinic' && (
                                <Button variant="outline" size="sm" className="h-8 text-xs font-bold gap-1 rounded-full bg-white border-[#ded8c4]" onClick={() => openSendModal(r)}>
                                    <Send className="w-3 h-3 text-[#cbb28d]" /> Send
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
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

function TableCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="border border-[#e4dec3]/70 bg-white shadow-sm rounded-3xl overflow-hidden min-w-0">
            <CardHeader className="bg-white/60 border-b border-[#e6e0ce] py-4">
                <CardTitle className="text-sm font-bold text-[#080e1e] flex items-center gap-2">{icon} {title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>{children}</Table>
            </CardContent>
        </Card>
    );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase text-[#8c7657] tracking-wider">{label}</label>
            {children}
        </div>
    );
}

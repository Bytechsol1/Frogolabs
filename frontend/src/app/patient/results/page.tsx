'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    KeyRound,
    ShieldCheck,
    Loader2,
    AlertCircle,
    FileText,
    Calendar,
    FlaskConical,
    User,
    Eye,
    ArrowLeft,
    LockKeyhole,
    RotateCcw,
    Building2,
    FileWarning,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
    Printer,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Hash,
} from 'lucide-react';

interface TerraBiomarker {
    name: string;
    value: number | null;
    unit: string | null;
    referenceRange: { low: number | null; high: number | null } | null;
    interpretation: { code: string | null; display: string | null } | null;
}

interface TerraStructuredReport {
    isSandbox?: boolean;
    reportDate: string | null;
    issued: string | null;
    resultStatus: string;
    isPartial: boolean;
    biomarkers: TerraBiomarker[];
}

// Terra's sandbox has been observed returning both HL7-style codes (N/L/H/LL/HH)
// and its own escalation vocabulary (not_escalated/low/medium/high/...) in the
// same interpretation field — normalize rather than assume one scheme.
const NORMAL_INTERPRETATION_CODES = new Set(['n', 'normal', 'not_escalated']);
function isAbnormal(code: string | null | undefined) {
    if (!code) return false;
    return !NORMAL_INTERPRETATION_CODES.has(code.toLowerCase());
}

export default function AccessResultsPage() {
    const [resultId, setResultId] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<any>(null);
    const [view, setView] = useState<'form' | 'summary' | 'report'>('form');

    // Report viewer state
    const [reportBlobUrl, setReportBlobUrl] = useState<string | null>(null);
    const [structuredReport, setStructuredReport] = useState<TerraStructuredReport | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState('');
    const [zoom, setZoom] = useState(100);
    const [page, setPage] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const docContainerRef = useRef<HTMLDivElement>(null);
    const pdfFrameRef = useRef<HTMLIFrameElement>(null);

    // Verified credentials, kept only in memory to lazily fetch the report file on demand
    const credsRef = useRef({ resultId: '', accessCode: '' });

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    useEffect(() => {
        return () => {
            if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
        };
    }, [reportBlobUrl]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resultId.trim() || !accessCode.trim()) {
            setError('Please enter both your Result ID and Access Code.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const normalizedResultId = resultId.trim().toUpperCase();
            const normalizedAccessCode = accessCode.trim();
            const res = await axios.post('/api/v1/patient-access/verify', {
                result_id: normalizedResultId,
                access_code: normalizedAccessCode,
            });
            credsRef.current = { resultId: normalizedResultId, accessCode: normalizedAccessCode };
            setResult(res.data);
            setView('summary');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            if (typeof msg === 'string') {
                setError(msg);
            } else if (!err.response) {
                setError('Unable to reach the server. Please check your connection and try again.');
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleViewReport = async () => {
        setReportError('');
        setZoom(100);
        setPage(1);
        setView('report');
        setReportLoading(true);
        try {
            if (result?.reportType === 'structured') {
                const res = await axios.post('/api/v1/patient-access/report', {
                    result_id: credsRef.current.resultId,
                    access_code: credsRef.current.accessCode,
                });
                setStructuredReport(res.data);
            } else {
                const res = await axios.post(
                    '/api/v1/patient-access/report',
                    { result_id: credsRef.current.resultId, access_code: credsRef.current.accessCode },
                    { responseType: 'blob' }
                );
                const contentType = res.headers['content-type'];
                const blob = new Blob([res.data], { type: typeof contentType === 'string' ? contentType : undefined });
                setReportBlobUrl(URL.createObjectURL(blob));
            }
        } catch (err: any) {
            let msg = 'Something went wrong loading the report. Please try again.';
            if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const parsed = JSON.parse(text);
                    if (typeof parsed?.message === 'string') msg = parsed.message;
                } catch {
                    // fall through to default message
                }
            } else if (err.response?.data?.message) {
                msg = err.response.data.message;
            } else if (!err.response) {
                msg = 'Unable to reach the server. Please check your connection and try again.';
            }
            setReportError(msg);
        } finally {
            setReportLoading(false);
        }
    };

    const handleBackToSummary = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
        setReportBlobUrl(null);
        setStructuredReport(null);
        setReportError('');
        setView('summary');
    };

    const reset = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
        setReportBlobUrl(null);
        setStructuredReport(null);
        setReportError('');
        setReportLoading(false);
        setResult(null);
        setResultId('');
        setAccessCode('');
        setError('');
        setView('form');
        credsRef.current = { resultId: '', accessCode: '' };
    };

    const zoomIn = () => setZoom((z) => Math.min(200, z + 25));
    const zoomOut = () => setZoom((z) => Math.max(50, z - 25));
    const goPrevPage = () => setPage((p) => Math.max(1, p - 1));
    const goNextPage = () => setPage((p) => p + 1);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            docContainerRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    const handlePrint = () => {
        if (result?.reportType === 'pdf') {
            pdfFrameRef.current?.contentWindow?.focus();
            pdfFrameRef.current?.contentWindow?.print();
        } else if (result?.reportType === 'image' && reportBlobUrl) {
            const win = window.open('', '_blank', 'noopener,noreferrer');
            if (win) {
                win.document.write(
                    `<html><head><title>Print Lab Report</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${reportBlobUrl}" style="max-width:100%;" onload="window.focus();window.print();" /></body></html>`
                );
                win.document.close();
            }
        }
    };

    const backToSignIn = (
        <Link href="/login" className="inline-flex min-h-9 items-center gap-2 rounded-lg text-xs font-semibold text-[#080e1e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8c7657]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f7f3e8]">
                <ArrowLeft className="h-3.5 w-3.5 text-[#8c7657]" aria-hidden="true" />
            </span>
            Back to Sign In
        </Link>
    );

    return (
        <div className="min-h-screen w-full bg-slate-50 text-[#091124] flex items-center justify-center p-4 sm:p-6">
            <div className={`w-full space-y-6 ${view === 'report' ? 'max-w-5xl' : 'max-w-md'}`}>
                {/* Brand Header */}
                <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="bg-[#080e1e] w-9 h-9 rounded-md flex items-center justify-center text-[#cbb28d] font-bold italic text-lg">F</div>
                        <span className="text-2xl font-extrabold text-[#080e1e]">Frigo Flow</span>
                    </div>
                    <p className="text-slate-500 text-sm">
                        {view === 'report' ? 'Your lab report' : view === 'summary' ? 'Your secure lab result' : 'Access your lab results securely'}
                    </p>
                </div>

                {view === 'form' ? (
                    <div className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.06)] p-6 sm:p-8 space-y-6">
                        <div className="-mt-2 border-b border-[#e6e0ce] pb-3">
                            {backToSignIn}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-[#080e1e] text-[#cbb28d]">
                                <KeyRound className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-lg font-extrabold text-[#080e1e]">Access Your Results</h1>
                                <p className="text-xs text-slate-500">Enter the Result ID and Access Code your clinic provided.</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="resultId" className="text-[10px] font-mono uppercase tracking-wider text-[#080e1e] font-bold">
                                    Result ID
                                </Label>
                                <Input
                                    id="resultId"
                                    placeholder="FF-XXXX-XXXX"
                                    value={resultId}
                                    onChange={(e) => setResultId(e.target.value.toUpperCase())}
                                    className="h-11 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-xl focus:border-[#080e1e] focus:ring-1 focus:ring-[#080e1e] text-sm font-mono font-bold tracking-wider"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="accessCode" className="text-[10px] font-mono uppercase tracking-wider text-[#080e1e] font-bold">
                                    Access Code
                                </Label>
                                <Input
                                    id="accessCode"
                                    placeholder="6-digit code"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="h-11 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-xl focus:border-[#080e1e] focus:ring-1 focus:ring-[#080e1e] text-sm font-mono font-bold tracking-[0.3em]"
                                    autoComplete="off"
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-[#cbb28d]" /> Verifying...
                                    </>
                                ) : (
                                    <>
                                        <LockKeyhole className="w-4 h-4 text-[#cbb28d]" /> View My Results
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium pt-1 border-t border-[#e8e2cf]">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#8c7657] shrink-0 mt-2" />
                            <span className="pt-2">Your Result ID and Access Code were provided by your clinic. Both are required to view your results.</span>
                        </div>
                    </div>
                ) : view === 'summary' ? (
                    <div className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.06)] p-6 sm:p-8 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full bg-[#080e1e] text-[#cbb28d] font-extrabold text-base flex items-center justify-center border-2 border-[#faf8f3] shadow-xs">
                                    <User className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-base font-extrabold text-[#080e1e]">{result.patientName}</h2>
                                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Verified Access</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3.5 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] flex items-center gap-1">
                                    <FlaskConical className="w-3 h-3 text-[#cbb28d]" /> Test Package
                                </span>
                                <p className="font-bold text-xs text-[#080e1e]">{result.testName || 'General'}</p>
                            </div>
                            <div className="p-3.5 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1">
                                <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-[#cbb28d]" /> Result Date
                                </span>
                                <p className="font-bold text-xs text-[#080e1e]">
                                    {result.resultDate ? new Date(result.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                </p>
                            </div>
                            <div className="p-3.5 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-1 col-span-2">
                                <span className="text-[9px] font-mono uppercase font-bold text-[#8c7657] flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3 text-[#cbb28d]" /> Status
                                </span>
                                <p className="font-bold text-xs text-[#080e1e]">{result.status}</p>
                            </div>
                        </div>

                        {result.notes && (
                            <div className="p-4 rounded-2xl bg-white border border-[#e4dec3]/70 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#080e1e]">
                                    <FileText className="w-4 h-4 text-[#8c7657]" />
                                    <span>Physician Notes</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">{result.notes}</p>
                            </div>
                        )}

                        {result.reportType === 'pdf' || result.reportType === 'image' || result.reportType === 'structured' ? (
                            <Button
                                className="w-full bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-xl h-11 gap-2 shadow-sm"
                                onClick={handleViewReport}
                            >
                                <Eye className="w-4 h-4 text-[#cbb28d]" /> View Report
                            </Button>
                        ) : result.reportType === 'unsupported' ? (
                            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                                <FileWarning className="w-4 h-4 shrink-0" />
                                <span>This report&apos;s file format can&apos;t be previewed here. Please contact your clinic.</span>
                            </div>
                        ) : (
                            <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-medium flex items-center gap-2">
                                <FileWarning className="w-4 h-4 shrink-0" />
                                <span>No report file has been attached to this result yet.</span>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            className="w-full border-[#ded8c4] text-[#080e1e] font-bold text-xs rounded-xl h-10 gap-2"
                            onClick={reset}
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Access Another Result
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Branded Report Header */}
                        <div className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-5 space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <button
                                    onClick={handleBackToSummary}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#080e1e] transition-colors"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Result Summary
                                </button>
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wide bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                                    <ShieldCheck className="w-3 h-3" /> Verified Access
                                </span>
                            </div>

                            <div className="flex items-center gap-3 pt-1">
                                <div className="w-10 h-10 shrink-0 rounded-full bg-[#080e1e] text-[#cbb28d] flex items-center justify-center border-2 border-[#faf8f3] shadow-xs">
                                    <User className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#8c7657] font-bold">Patient Lab Report</p>
                                    <h1 className="text-base font-extrabold text-[#080e1e] truncate">{result?.patientName}</h1>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[52px] text-[11px] text-slate-500 font-semibold">
                                <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3 text-[#cbb28d]" /> {result?.testName || 'General'}</span>
                                {result?.clinicName && (
                                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-[#cbb28d]" /> {result.clinicName}</span>
                                )}
                                {result?.resultDate && (
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-[#cbb28d]" />
                                        {new Date(result.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Document + Details Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 items-start">
                            {/* Document Column */}
                            <div className="space-y-3 min-w-0">
                                {(reportBlobUrl || structuredReport) && !reportLoading && !reportError && (
                                    <div className="bg-[#080e1e] rounded-2xl px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-1">
                                            {result?.reportType === 'pdf' && (
                                                <>
                                                    <ToolbarIconButton onClick={goPrevPage} title="Previous page">
                                                        <ChevronLeft className="w-4 h-4" />
                                                    </ToolbarIconButton>
                                                    <span className="text-[11px] font-mono font-bold text-[#cbb28d] px-1.5 min-w-[52px] text-center">Page {page}</span>
                                                    <ToolbarIconButton onClick={goNextPage} title="Next page">
                                                        <ChevronRight className="w-4 h-4" />
                                                    </ToolbarIconButton>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {result?.reportType !== 'structured' && (
                                                <>
                                                    <ToolbarIconButton onClick={zoomOut} title="Zoom out">
                                                        <ZoomOut className="w-4 h-4" />
                                                    </ToolbarIconButton>
                                                    <span className="text-[11px] font-mono font-bold text-[#cbb28d] px-1 min-w-[38px] text-center">{zoom}%</span>
                                                    <ToolbarIconButton onClick={zoomIn} title="Zoom in">
                                                        <ZoomIn className="w-4 h-4" />
                                                    </ToolbarIconButton>
                                                    <div className="w-px h-4 bg-white/15 mx-1" />
                                                    <ToolbarIconButton onClick={handlePrint} title="Print">
                                                        <Printer className="w-4 h-4" />
                                                    </ToolbarIconButton>
                                                </>
                                            )}
                                            <ToolbarIconButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                                                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                            </ToolbarIconButton>
                                        </div>
                                    </div>
                                )}

                                <div
                                    ref={docContainerRef}
                                    className={`bg-[#f2ede0]/60 rounded-3xl border border-[#e4dec3] overflow-auto ${isFullscreen ? 'p-6 bg-[#f2ede0]' : 'p-4 sm:p-8'}`}
                                    style={{ maxHeight: isFullscreen ? '100vh' : '75vh' }}
                                >
                                    {(reportBlobUrl || structuredReport) && !reportLoading && !reportError && (
                                        <div className="flex items-center justify-center mb-4">
                                            <span className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider font-bold text-[#8c7657] bg-white/70 border border-[#cbb28d]/40 rounded-full px-3 py-1">
                                                <LockKeyhole className="w-3 h-3" /> Secure Clinical Document
                                            </span>
                                        </div>
                                    )}

                                    {reportLoading ? (
                                        <div className="py-16 flex flex-col items-center gap-3 text-slate-500 text-xs font-bold">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#8c7657]" /> Loading report...
                                        </div>
                                    ) : reportError ? (
                                        <div className="py-10 flex flex-col items-center gap-4 text-center">
                                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2 max-w-sm">
                                                <AlertCircle className="w-4 h-4 shrink-0" /> {reportError}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full text-xs font-bold border-[#ded8c4] gap-1.5"
                                                onClick={handleViewReport}
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" /> Retry
                                            </Button>
                                        </div>
                                    ) : result?.reportType === 'pdf' && reportBlobUrl ? (
                                        <div
                                            className="mx-auto bg-white rounded-xl shadow-[0_8px_30px_rgba(8,14,30,0.08)] border border-[#e6e0ce] overflow-hidden transition-[width] duration-150"
                                            style={{ width: `${zoom}%`, maxWidth: '850px' }}
                                        >
                                            <iframe
                                                ref={pdfFrameRef}
                                                src={`${reportBlobUrl}#page=${page}&toolbar=0&navpanes=0&statusbar=0`}
                                                title="Lab Report"
                                                className="w-full h-[65vh] sm:h-[70vh] block"
                                            />
                                        </div>
                                    ) : result?.reportType === 'image' && reportBlobUrl ? (
                                        <div
                                            className="mx-auto bg-white rounded-xl shadow-[0_8px_30px_rgba(8,14,30,0.08)] border border-[#e6e0ce] overflow-hidden transition-[width] duration-150"
                                            style={{ width: `${zoom}%`, maxWidth: '850px' }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={reportBlobUrl} alt="Lab Report" className="w-full h-auto block" />
                                        </div>
                                    ) : result?.reportType === 'structured' && structuredReport ? (
                                        <div className="mx-auto bg-white rounded-xl shadow-[0_8px_30px_rgba(8,14,30,0.08)] border border-[#e6e0ce] overflow-hidden max-w-3xl">
                                            {structuredReport.isSandbox && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Terra sandbox demo: simulated results, not clinical results.</p>}
                                            {structuredReport.isPartial && (
                                                <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-2">
                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Partial results — some biomarkers may still be processing.
                                                </div>
                                            )}
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="bg-[#f7f3e8] text-[9px] font-mono uppercase tracking-wider text-[#8c7657] font-bold">
                                                        <th className="px-5 py-3">Biomarker</th>
                                                        <th className="px-5 py-3">Result</th>
                                                        <th className="px-5 py-3">Reference Range</th>
                                                        <th className="px-5 py-3">Flag</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#e6e0ce]">
                                                    {structuredReport.biomarkers.map((b, i) => {
                                                        const abnormal = isAbnormal(b.interpretation?.code);
                                                        return (
                                                            <tr key={i} className={abnormal ? 'bg-rose-50/60' : undefined}>
                                                                <td className="px-5 py-3 font-bold text-[#080e1e]">{b.name}</td>
                                                                <td className="px-5 py-3 font-mono font-bold text-[#080e1e]">
                                                                    {b.value ?? '—'} {b.unit || ''}
                                                                </td>
                                                                <td className="px-5 py-3 font-mono text-slate-500">
                                                                    {b.referenceRange && (b.referenceRange.low !== null || b.referenceRange.high !== null)
                                                                        ? `${b.referenceRange.low ?? ''} – ${b.referenceRange.high ?? ''}`
                                                                        : '—'}
                                                                </td>
                                                                <td className="px-5 py-3">
                                                                    {b.interpretation?.display ? (
                                                                        <span
                                                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                                                abnormal
                                                                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                            }`}
                                                                        >
                                                                            {b.interpretation.display}
                                                                        </span>
                                                                    ) : (
                                                                        '—'
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Report Details (desktop only) */}
                            <div className="hidden lg:block bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-5 space-y-4 sticky top-4">
                                <h3 className="text-[11px] font-extrabold text-[#080e1e] uppercase tracking-wide flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-[#cbb28d]" /> Report Details
                                </h3>
                                <div className="space-y-3">
                                    <ReportDetailRow icon={User} label="Patient" value={result?.patientName} />
                                    <ReportDetailRow icon={FlaskConical} label="Test" value={result?.testName || 'General'} />
                                    <ReportDetailRow
                                        icon={Calendar}
                                        label="Report Date"
                                        value={result?.resultDate ? new Date(result.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                    />
                                    <ReportDetailRow icon={Hash} label="Report ID" value={credsRef.current.resultId} mono />
                                    <ReportDetailRow icon={CheckCircle2} label="Access Status" value="Verified" valueClassName="text-emerald-700" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {view !== 'form' && <div className="text-center">{backToSignIn}</div>}
            </div>
        </div>
    );
}

function ToolbarIconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#cbb28d] hover:bg-white/10 transition-colors"
        >
            {children}
        </button>
    );
}

function ReportDetailRow({
    icon: Icon,
    label,
    value,
    mono,
    valueClassName,
}: {
    icon: any;
    label: string;
    value?: string | null;
    mono?: boolean;
    valueClassName?: string;
}) {
    return (
        <div className="space-y-0.5">
            <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-[#8c7657] flex items-center gap-1">
                <Icon className="w-3 h-3 text-[#cbb28d]" /> {label}
            </span>
            <p className={`text-xs font-bold text-[#080e1e] truncate ${mono ? 'font-mono tracking-wide' : ''} ${valueClassName || ''}`}>
                {value || '—'}
            </p>
        </div>
    );
}

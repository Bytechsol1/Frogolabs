'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

interface Biomarker {
    name: string;
    value: number | null;
    unit: string | null;
    referenceRange: { low: number | null; high: number | null } | null;
    interpretation: { code: string | null; display: string | null } | null;
}

export interface LabReport {
    id: string;
    test_name?: string | null;
    file_url?: string | null;
    uploaded_at: string;
    result_date?: string | null;
    notes?: string | null;
    structured_report?: {
        isSandbox?: boolean;
        isPartial: boolean;
        biomarkers: Biomarker[];
    } | null;
}

function FilePreview({ fileUrl, title }: { fileUrl: string; title: string }) {
    const { user } = useAuth();
    const token = user?.token;
    const [preview, setPreview] = useState<{ url: string; type: 'pdf' | 'image' } | null>(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl: string | undefined;

        async function load() {
            try {
                const path = new URL(fileUrl, window.location.origin).pathname;
                if (!path.startsWith('/uploads/lab-results/') || new URL(fileUrl, window.location.origin).origin !== window.location.origin) throw new Error('Invalid report location.');
                const extension = path.split('.').pop()?.toLowerCase();
                const imageTypes: Record<string, string> = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                    gif: 'image/gif', webp: 'image/webp',
                };
                const mimeType = extension === 'pdf' ? 'application/pdf' : imageTypes[extension || ''];
                if (!mimeType) {
                    setError('This report format cannot be displayed here. Please ask for a PDF or image report.');
                    return;
                }

                const response = await axios.get<Blob>(fileUrl, {
                    responseType: 'blob', signal: controller.signal,
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (controller.signal.aborted) return;
                // A missing upload may be answered by an HTML fallback page.
                if (response.data.type.includes('text/html') || !response.data.size) {
                    throw new Error('Report file unavailable');
                }
                objectUrl = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
                setPreview({ url: objectUrl, type: extension === 'pdf' ? 'pdf' : 'image' });
            } catch {
                if (!controller.signal.aborted) {
                    setError('Unable to load this report. Please try again.');
                }
            }
        }

        void load();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [fileUrl, attempt, token]);

    if (error) return (
        <div role="alert" className="space-y-3 rounded-2xl border border-[#e6e0ce] p-6 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <Button variant="outline" size="sm" onClick={() => {
                setError('');
                setPreview(null);
                setAttempt(value => value + 1);
            }}>Try again</Button>
        </div>
    );

    if (!preview) return (
        <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading report...
        </div>
    );

    return preview.type === 'pdf' ? (
        <iframe
            src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`}
            title={title}
            className="h-[70vh] min-h-[480px] w-full rounded-2xl border border-[#e6e0ce] bg-slate-50"
        />
    ) : (
        <div className="overflow-auto rounded-2xl border border-[#e6e0ce] bg-slate-50 p-3">
            {/* Uploaded report blobs must be displayed locally without image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={title} className="mx-auto h-auto max-w-full" onError={() => setError('Unable to display this report image. Please try again.')} />
        </div>
    );
}

export function LabReportPreview({ report }: { report: LabReport }) {
    if (report.structured_report) {
        const { isPartial, biomarkers } = report.structured_report;
        return (
            <div className="space-y-3">
                {report.structured_report.isSandbox && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Terra sandbox demo: simulated results, not clinical results.</p>}
                {isPartial && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Partial results — additional results are still pending.
                    </p>
                )}
                {biomarkers.length ? (
                    <div className="overflow-x-auto rounded-2xl border border-[#e6e0ce]">
                        <table className="w-full text-left text-xs">
                            <caption className="sr-only">{report.test_name || 'Lab report'} results</caption>
                            <thead className="bg-[#faf8f3] text-slate-600">
                                <tr>{['Biomarker', 'Result', 'Unit', 'Reference Range', 'Interpretation'].map(label => (
                                    <th key={label} scope="col" className="px-4 py-3 font-bold">{label}</th>
                                ))}</tr>
                            </thead>
                            <tbody>
                                {biomarkers.map((marker, index) => {
                                    const flagged = marker.interpretation?.code && !['n', 'normal', 'not_escalated'].includes(marker.interpretation.code.toLowerCase());
                                    return (
                                    <tr key={index} className={`border-t border-[#e6e0ce] text-[#080e1e] ${flagged ? 'bg-rose-50/60' : ''}`}>
                                        <th scope="row" className="px-4 py-3 font-bold">{marker.name}</th>
                                        <td className="px-4 py-3 font-mono">{marker.value ?? '—'}</td>
                                        <td className="px-4 py-3">{marker.unit || '—'}</td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            {marker.referenceRange?.low != null && marker.referenceRange?.high != null
                                                ? `${marker.referenceRange.low} – ${marker.referenceRange.high}`
                                                : marker.referenceRange?.low != null ? `≥ ${marker.referenceRange.low}`
                                                : marker.referenceRange?.high != null ? `≤ ${marker.referenceRange.high}` : '—'}
                                        </td>
                                        <td className={`px-4 py-3 ${flagged ? 'font-bold text-rose-700' : ''}`}>{marker.interpretation?.display || marker.interpretation?.code || '—'}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="p-6 text-center text-sm text-slate-500">No biomarker values are available yet.</p>}
            </div>
        );
    }

    if (!report.file_url) return <p className="p-6 text-center text-sm text-slate-500">No report is attached yet.</p>;

    return <FilePreview key={`${report.id}:${report.file_url}`} fileUrl={report.file_url} title={report.test_name || 'Diagnostic Lab Report'} />;
}

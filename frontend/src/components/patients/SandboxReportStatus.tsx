'use client';

import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

interface Job {
    id: string;
    status: string;
    test_name: string;
    due_at: string;
    last_error: string | null;
}

export function SandboxReportStatus({ jobs, onRefresh }: { jobs: Job[]; onRefresh: () => Promise<void> }) {
    const { user } = useAuth();
    const [retrying, setRetrying] = useState<string | null>(null);
    const [error, setError] = useState('');
    if (!jobs.length) return null;
    async function retry(id: string) {
        setRetrying(id);
        setError('');
        try {
            await axios.post(`/api/v1/terra/sandbox/jobs/${id}/retry`, {}, { headers: { Authorization: `Bearer ${user?.token}` } });
            await onRefresh();
        } catch { setError('Unable to retry. Please try again.'); }
        finally { setRetrying(null); }
    }
    return <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-5" aria-label="Automatic sandbox reports">
        <h3 className="text-sm font-bold">Automatic sandbox reports</h3>
        <p className="text-xs text-slate-600">Terra demo data. Reports are simulated and are not clinical results.</p>
        {jobs.map(job => {
            const minutes = Math.max(0, Math.ceil((new Date(job.due_at).getTime() - Date.now()) / 60000));
            const message = job.status === 'COMPLETED' ? 'Ready — open the report below.'
                : job.last_error || (minutes > 0 ? `Expected in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
                    : 'Fetching your report from Terra. This page updates automatically.');
            return <div key={job.id} className="text-sm" role="status">
                <span className="font-semibold">{job.test_name}: </span>{message}
                {job.status === 'FAILED' && <button type="button" disabled={retrying !== null} className="ml-3 underline disabled:opacity-50" onClick={() => void retry(job.id)}>{retrying === job.id ? 'Retrying...' : 'Retry report'}</button>}
            </div>;
        })}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>;
}

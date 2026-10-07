'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type ReportNotification = { id: string; patientId: string; patientName: string; testName: string; readyAt: string; isSandbox: boolean };

export function LabReportNotifications() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<ReportNotification[]>([]);
    const [read, setRead] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const storageKey = `frigoflow:read-reports:${user?.id}`;

    useEffect(() => {
        if (!user?.token || !user?.id) return;
        setItems([]); setLoading(true);
        const loadRead = () => {
            try {
                const ids = JSON.parse(localStorage.getItem(storageKey) || '[]');
                setRead(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
            } catch { setRead([]); }
        };
        loadRead();
        const controller = new AbortController();
        let busy = false;
        const refresh = async () => {
            if (busy || document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const response = await fetch('/api/v1/notifications/lab-reports', {
                    headers: { Authorization: `Bearer ${user.token}` }, cache: 'no-store', signal: controller.signal,
                });
                if (!response.ok) throw new Error('Notification request failed');
                const data = await response.json();
                if (!controller.signal.aborted) { setItems(data); setError(false); }
            } catch { if (!controller.signal.aborted) setError(true); }
            finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
        };
        void refresh();
        const timer = window.setInterval(refresh, 10000);
        const onFocus = () => { loadRead(); void refresh(); };
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', loadRead);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            controller.abort(); window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', loadRead);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [user?.id, user?.token, storageKey]);

    const markRead = (ids: string[]) => {
        const next = [...new Set([...read, ...ids])].slice(-500);
        setRead(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    };
    const unread = items.filter(item => !read.includes(item.id)).length;

    return <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications"
            className="relative w-9 h-9 shrink-0 rounded-full bg-[#e4dec3]/40 hover:bg-[#e4dec3]/70 text-[#080e1e] flex items-center justify-center border border-[#ded8c4]/50">
            <Bell className="w-4 h-4" aria-hidden="true" />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
        </Popover.Trigger>
        <span className="sr-only" role="status" aria-live="polite">{unread ? `${unread} unread lab report notifications` : ''}</span>
        <Popover.Portal>
            <Popover.Positioner align="end" sideOffset={12} className="z-[100]">
                <Popover.Popup className="w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#e4dec3] bg-white p-4 shadow-xl outline-none">
                    <Popover.Title className="border-b border-[#e6e0ce] pb-3 text-sm font-bold text-[#080e1e]">Notifications</Popover.Title>
                    <Popover.Description className="sr-only">New lab reports ready to view.</Popover.Description>
                    {error && <p role="alert" className="pt-3 text-xs text-rose-700">Could not refresh notifications. Retrying automatically.</p>}
                    {loading ? <p className="py-6 text-center text-xs text-slate-500">Loading notifications...</p> : items.length === 0 ?
                        <div className="flex flex-col items-center gap-2 py-6 text-slate-500"><Bell className="h-6 w-6 text-[#cbb28d]" /><p className="text-xs">No notifications yet.</p></div> :
                        <div className="max-h-80 overflow-y-auto pt-2">
                            {items.map(item => <Link key={item.id} href={`/dashboard/patients/${item.patientId}?tab=results&report=${item.id}`}
                                onClick={() => { markRead([item.id]); setOpen(false); }}
                                className={`block rounded-lg p-2 my-1 text-xs focus-visible:outline-2 focus-visible:outline-[#8c7657] ${read.includes(item.id) ? 'text-slate-600' : 'bg-amber-50 text-[#080e1e]'}`}>
                                <span className="block font-bold">Lab report ready{!read.includes(item.id) && ' • New'}</span>
                                <span className="block mt-1 break-words">{item.patientName} — {item.testName}</span>
                                <span className="block mt-1 text-[10px] text-slate-500">{new Date(item.readyAt).toLocaleString()}</span>
                                {item.isSandbox && <span className="block mt-1 text-[10px] text-amber-800">Sandbox · Simulated result</span>}
                            </Link>)}
                        </div>}
                    {unread > 0 && <button onClick={() => markRead(items.map(item => item.id))} className="mt-2 text-xs font-bold underline text-[#8c7657]">Mark all as read</button>}
                </Popover.Popup>
            </Popover.Positioner>
        </Popover.Portal>
    </Popover.Root>;
}

'use client';

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { FlaskConical } from "lucide-react";

interface TerraOrder {
    id: string;
    terra_order_id: string;
    terra_product_id: string;
    terra_order_status: string;
    results_status: string | null;
    created_at: string;
    updated_at: string;
    lab_result_id: string | null;
}

function formatStatus(raw: string | null): string {
    if (!raw) return 'Not reported by Terra';
    return raw
        .replace(/^order\.|^results\./, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Resolves Terra variant_id -> human-readable variant name using only the
// existing GET /terra/products, /terra/products/:id, /terra/products/:id/variants
// endpoints (no backend changes) — TerraOrder only stores the raw variant id.
async function fetchVariantNameMap(token: string): Promise<Record<string, string>> {
    const headers = { Authorization: `Bearer ${token}` };
    const map: Record<string, string> = {};
    try {
        const { data: types } = await axios.get('/api/v1/terra/products', { headers });
        const productLists = await Promise.all(
            types.map((t: any) => axios.get(`/api/v1/terra/products/${t.id}`, { headers }).then(r => r.data).catch(() => []))
        );
        const products = productLists.flat();
        const variantLists = await Promise.all(
            products.map((p: any) => axios.get(`/api/v1/terra/products/${p.id}/variants`, { headers }).then(r => r.data).catch(() => []))
        );
        for (const variants of variantLists) {
            for (const v of variants) {
                map[String(v.id)] = v.variant_name;
            }
        }
    } catch {
        // Non-fatal — falls back to showing the raw variant id.
    }
    return map;
}

export function TerraReportEmptyState({ orders }: { orders: TerraOrder[] }) {
    if (!orders.length) return <p>No diagnostic report has been uploaded or received from Terra.</p>;
    return <div className="space-y-2">{orders.map(order => (
        <p key={order.id}>
            {order.results_status === 'results.sample_processing_in_lab'
                ? 'Sample is currently processing in the lab.'
                : ['results.results_ready', 'results.partial_results_ready'].includes(order.results_status || '')
                    ? 'Terra reports results are ready. The report has not been synchronized yet; use Refresh from Terra to retry.'
                    : `Lab report is not available yet. Terra order status: ${formatStatus(order.terra_order_status)}. Result status: ${formatStatus(order.results_status)}.`}
        </p>
    ))}</div>;
}

export function TerraOrdersSection({ orders, onRefresh }: { orders: TerraOrder[]; onRefresh: () => Promise<void> }) {
    const { user } = useAuth();
    const [variantNames, setVariantNames] = useState<Record<string, string>>({});
    const [syncing, setSyncing] = useState<string | null>(null);
    const [syncError, setSyncError] = useState('');
    const hasOrders = orders.length > 0;

    useEffect(() => {
        if (!user?.token || !hasOrders) return;
        let active = true;
        fetchVariantNameMap(user.token).then(names => { if (active) setVariantNames(names); });
        return () => { active = false; };
    }, [hasOrders, user?.token]);

    if (!orders.length) {
        return null;
    }

    return (
        <div className="bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_4px_25px_rgba(8,14,30,0.04)] p-6 space-y-3">
            <h3 className="text-base font-bold text-[#080e1e]">Terra Lab Test Orders</h3>
            <p className="text-xs text-slate-500">Session stages update automatically from Terra. Results Ready is confirmed once the final report has been saved.</p>
            {syncError && <p role="alert" className="text-xs text-rose-700">{syncError}</p>}
            <div className="grid gap-3 md:grid-cols-2">
                {orders.map((order) => (
                    <div key={order.id} className="p-4 rounded-2xl bg-white/60 border border-[#e6e0ce] space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-[#080e1e] text-[#cbb28d]">
                                <FlaskConical className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-[#080e1e] truncate">
                                    {variantNames[order.terra_product_id] || `Terra Test (variant ${order.terra_product_id})`}
                                </p>
                                <p className="text-[10px] text-slate-500">Created: {new Date(order.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#080e1e] text-[#cbb28d]">
                                Order Status: {formatStatus(order.terra_order_status)}
                            </span>
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Result Status: {formatStatus(order.results_status)}
                                </span>
                        </div>
                        <p className="text-[9px] font-mono text-slate-400">Terra Order ID: {order.terra_order_id}</p>
                        {!order.lab_result_id && order.results_status && ['results.results_ready', 'results.partial_results_ready'].includes(order.results_status) && (
                            <p className="text-xs text-amber-800">Results are ready at Terra; the report has not been synchronized yet.</p>
                        )}
                        <button type="button" disabled={syncing !== null} className="text-xs font-bold text-[#8c7657] underline disabled:opacity-50" onClick={async () => {
                            setSyncing(order.id);
                            setSyncError('');
                            try {
                                await axios.post(`/api/v1/terra/orders/${order.id}/sync`, {}, { headers: { Authorization: `Bearer ${user?.token}` } });
                                await onRefresh();
                            } catch {
                                setSyncError('Unable to synchronize with Terra. Please try again.');
                            } finally { setSyncing(null); }
                        }}>{syncing === order.id ? 'Synchronizing...' : 'Refresh from Terra'}</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

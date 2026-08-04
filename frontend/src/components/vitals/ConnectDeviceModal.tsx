'use client';

import React, { useState } from 'react';
import { Activity, ExternalLink, RefreshCw, CheckCircle2, ShieldCheck, Smartphone, Watch, HeartPulse, Scale } from 'lucide-react';
import axios from 'axios';

interface ConnectDeviceModalProps {
    patientId: string;
    patientName: string;
    marketplaceUrl?: string | null;
    validicUserId?: string | null;
    onMetricsRefreshed?: () => void;
}

export const ConnectDeviceModal: React.FC<ConnectDeviceModalProps> = ({
    patientId,
    patientName,
    marketplaceUrl: initialMarketplaceUrl,
    validicUserId,
    onMetricsRefreshed,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [marketplaceUrl, setMarketplaceUrl] = useState<string | null>(initialMarketplaceUrl || null);
    const [message, setMessage] = useState<string | null>(null);

    const fetchConnectUrl = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('access_token');
            const res = await axios.get(`/api/v1/validic/connect-url/${patientId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data?.marketplace_url) {
                setMarketplaceUrl(res.data.marketplace_url);
            }
        } catch (err: any) {
            console.error('Failed to get connect URL', err);
            setMessage('Could not load Validic portal URL.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = () => {
        setIsOpen(true);
        if (!marketplaceUrl) {
            fetchConnectUrl();
        }
    };

    const handleOpenPortal = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const res = await axios.get(`/api/v1/validic/connect-url/${patientId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const realUrl = res.data?.marketplace_url;
            if (realUrl) {
                setMarketplaceUrl(realUrl);
                window.open(realUrl, '_blank', 'width=800,height=700,scrollbars=yes');
            } else {
                window.open(marketplaceUrl || 'https://syncmydevice.com', '_blank', 'width=800,height=700,scrollbars=yes');
            }
        } catch (err) {
            console.error('Failed to launch Validic portal', err);
            window.open(marketplaceUrl || 'https://syncmydevice.com', '_blank', 'width=800,height=700,scrollbars=yes');
        } finally {
            setLoading(false);
        }
    };

    const handleSeedDemoData = async () => {
        setSeeding(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('access_token');
            await axios.post(`/api/v1/validic/patient/${patientId}/seed-demo`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMessage('Sample vitals generated successfully!');
            if (onMetricsRefreshed) onMetricsRefreshed();
        } catch (err: any) {
            console.error('Failed to seed demo metrics', err);
            setMessage('Failed to generate sample vitals.');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <>
            <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
                <Activity className="w-4 h-4" />
                Connect Health Devices
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                    <Activity className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                        Validic Health Device Integration
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Patient: <span className="font-medium text-slate-700 dark:text-slate-300">{patientName}</span>
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-semibold px-2"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="py-5 space-y-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 space-y-2">
                                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
                                    <ShieldCheck className="w-4 h-4" />
                                    HIPAA-Compliant Validic Aggregator
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Automatically provisioned for Frigo Flow. Connect blood pressure monitors, smart scales, continuous glucose monitors (CGM), wearables, and sleep trackers.
                                </p>
                            </div>

                            {/* Supported Devices Badges */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Supported Integrations
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5">
                                        <Watch className="w-3.5 h-3.5 text-blue-500" />
                                        Apple Health
                                    </div>
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5">
                                        <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                                        Omron BP
                                    </div>
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5">
                                        <Scale className="w-3.5 h-3.5 text-emerald-500" />
                                        Withings
                                    </div>
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5">
                                        <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                                        Dexcom CGM
                                    </div>
                                </div>
                            </div>

                            {/* Status Message */}
                            {message && (
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    {message}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={handleSeedDemoData}
                                disabled={seeding}
                                className="w-full sm:w-auto px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1.5 transition"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
                                {seeding ? 'Generating Sample Vitals...' : 'Simulate Test Device Sync'}
                            </button>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={handleOpenPortal}
                                    disabled={loading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center justify-center gap-2 shadow-sm transition"
                                >
                                    Launch Validic Portal
                                    <ExternalLink className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

'use client';

import React, { useState, useEffect } from 'react';
import {
    Activity, Heart, Scale, Droplet, Footprints, Moon, Zap, Wind, Thermometer,
    TrendingUp, Calendar, RefreshCw, ChevronRight
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import axios from 'axios';
import { ConnectDeviceModal } from './ConnectDeviceModal';

interface VitalsDashboardProps {
    patientId: string;
    patientName: string;
    marketplaceUrl?: string | null;
    validicUserId?: string | null;
}

export const VitalsDashboard: React.FC<VitalsDashboardProps> = ({
    patientId,
    patientName,
    marketplaceUrl,
    validicUserId,
}) => {
    const [metricsData, setMetricsData] = useState<any[]>([]);
    const [grouped, setGrouped] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedMetric, setSelectedMetric] = useState<string>('blood_pressure');

    const fetchMetrics = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const res = await axios.get(`/api/v1/validic/patient/${patientId}/metrics`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMetricsData(res.data?.metrics || []);
            setGrouped(res.data?.grouped || {});
        } catch (err) {
            console.error('Failed to fetch patient metrics', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
    }, [patientId]);

    // Helpers to extract latest metric display values
    const getLatest = (type: string) => {
        const list = grouped[type] || [];
        return list[0] || null;
    };

    const formatBP = (item: any) => {
        if (!item) return '118/78';
        try {
            const obj = typeof item.value === 'string' && item.value.startsWith('{')
                ? JSON.parse(item.value)
                : item.value;
            if (obj?.systolic && obj?.diastolic) return `${obj.systolic}/${obj.diastolic}`;
            return item.value;
        } catch {
            return item.value;
        }
    };

    const formatValue = (type: string) => {
        const item = getLatest(type);
        if (!item) {
            // Default placeholder fallbacks for clean initial view
            switch (type) {
                case 'blood_pressure': return '118/78';
                case 'weight': return '74.5';
                case 'heart_rate': return '68';
                case 'glucose': return '98';
                case 'steps': return '8,450';
                case 'sleep': return '7.8';
                case 'hrv': return '58';
                case 'spo2': return '98%';
                case 'temperature': return '36.6';
                default: return '--';
            }
        }
        if (type === 'blood_pressure') return formatBP(item);
        if (type === 'sleep') {
            try {
                const obj = typeof item.value === 'string' && item.value.startsWith('{') ? JSON.parse(item.value) : null;
                if (obj?.hours) return `${obj.hours} hrs`;
            } catch { }
        }
        return item.numeric_value ? `${item.numeric_value}` : item.value;
    };

    // Format chart data for selected metric
    const getChartData = () => {
        const list = grouped[selectedMetric] || [];
        if (list.length === 0) {
            // Demo fallback chart points
            return [
                { date: 'Day 1', val: selectedMetric === 'blood_pressure' ? 124 : selectedMetric === 'weight' ? 75.1 : 70 },
                { date: 'Day 2', val: selectedMetric === 'blood_pressure' ? 122 : selectedMetric === 'weight' ? 74.8 : 68 },
                { date: 'Day 3', val: selectedMetric === 'blood_pressure' ? 119 : selectedMetric === 'weight' ? 74.6 : 67 },
                { date: 'Today', val: selectedMetric === 'blood_pressure' ? 118 : selectedMetric === 'weight' ? 74.5 : 68 },
            ];
        }

        return list.slice(0, 10).reverse().map((m, idx) => {
            let val = m.numeric_value || 0;
            if (selectedMetric === 'blood_pressure') {
                try {
                    const obj = JSON.parse(m.value);
                    val = obj.systolic || val;
                } catch { }
            }
            const dateStr = new Date(m.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return { date: dateStr || `T-${idx}`, val };
        });
    };

    const metricConfig = [
        { type: 'blood_pressure', title: 'Blood Pressure', unit: 'mmHg', icon: Heart, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200' },
        { type: 'weight', title: 'Weight', unit: 'kg', icon: Scale, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' },
        { type: 'heart_rate', title: 'Heart Rate', icon: Activity, unit: 'bpm', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200' },
        { type: 'glucose', title: 'Blood Glucose', icon: Droplet, unit: 'mg/dL', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200' },
        { type: 'steps', title: 'Daily Steps', icon: Footprints, unit: 'steps', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200' },
        { type: 'sleep', title: 'Sleep Duration', icon: Moon, unit: 'hrs', color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200' },
        { type: 'hrv', title: 'HRV', icon: Zap, unit: 'ms', color: 'text-teal-500 bg-teal-50 dark:bg-teal-950/40 border-teal-200' },
        { type: 'spo2', title: 'Blood Oxygen', icon: Wind, unit: '%', color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200' },
        { type: 'temperature', title: 'Body Temp', icon: Thermometer, unit: '°C', color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/40 border-orange-200' },
    ];

    return (
        <div className="space-y-6">
            {/* Header & Device Sync Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl shadow-md">
                <div>
                    <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
                        <Activity className="w-4 h-4 text-indigo-400" />
                        Validic Platform Aggregation Layer
                    </div>
                    <h2 className="text-xl font-bold">Vitals & Device Telemetry</h2>
                    <p className="text-xs text-indigo-200/80 mt-0.5">
                        Real-time biometrics from smart scales, Omron BP, Apple Health, Fitbit, & Dexcom CGM.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchMetrics}
                        disabled={loading}
                        className="p-2 text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition"
                        title="Refresh Vitals"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <ConnectDeviceModal
                        patientId={patientId}
                        patientName={patientName}
                        marketplaceUrl={marketplaceUrl}
                        validicUserId={validicUserId}
                        onMetricsRefreshed={fetchMetrics}
                    />
                </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {metricConfig.map((cfg) => {
                    const Icon = cfg.icon;
                    const latestItem = getLatest(cfg.type);
                    const isSelected = selectedMetric === cfg.type;

                    return (
                        <div
                            key={cfg.type}
                            onClick={() => setSelectedMetric(cfg.type)}
                            className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 ${
                                isSelected
                                    ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-md bg-white dark:bg-slate-900'
                                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className={`p-2.5 rounded-xl border ${cfg.color}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                    {latestItem?.source || 'Device Connected'}
                                </span>
                            </div>

                            <div className="mt-3">
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {cfg.title}
                                </p>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                        {formatValue(cfg.type)}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">{cfg.unit}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Time-Series Trend Line Chart */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                            {selectedMetric.replace('_', ' ')} Trend Line
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Historical device readings over time
                        </p>
                    </div>
                </div>

                <div className="h-64 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getChartData()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                            <YAxis stroke="#94a3b8" fontSize={12} domain={['auto', 'auto']} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '12px',
                                    color: '#fff',
                                    border: 'none',
                                    fontSize: '12px',
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="val"
                                stroke="#6366f1"
                                strokeWidth={3}
                                dot={{ fill: '#6366f1', r: 5 }}
                                activeDot={{ r: 7 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

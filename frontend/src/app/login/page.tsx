'use client';

import { EmailInput } from '@/components/ui/email-input';
import { normalizeEmail } from '@/lib/email-validation';
import { useEmailValidation } from '@/lib/use-email-validation';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { prepareEmailVerification } from '@/lib/email-verification';
import {
    Activity,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    Loader2,
    LockKeyhole
} from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const emailValidation = useEmailValidation(email, true, 'login');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [verificationEmail, setVerificationEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [gateOpen, setGateOpen] = useState(false);

    const { login } = useAuth();
    const router = useRouter();

    // Trigger "Gate Opening" reveal animation on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            setGateOpen(true);
        }, 150);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setVerificationEmail('');
        if (!emailValidation.check()) return;
        setLoading(true);
        try {
            const response = await axios.post('/api/v1/auth/login', { email: normalizeEmail(email), password });
            await login(response.data.access_token);
            router.push('/dashboard');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                setVerificationEmail(email.trim().toLowerCase());
                setError('Your email has not been verified.');
            } else if (err.response?.status >= 500) {
                setError('The login server is temporarily unavailable. Please try again shortly.');
            } else if (typeof msg === 'string') {
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

    return (
        <div className="min-h-screen w-full bg-slate-50 text-[#091124] flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#091124] selection:text-[#e5d8bf] relative overflow-hidden">
            
            {/* LUXURY "GATE OPENING" VAULT DOORS ANIMATION OVERLAY */}
            <div className="fixed inset-0 z-50 pointer-events-none flex">
                {/* Left Gate Door */}
                <div
                    className={`w-1/2 h-full bg-[#080e1e] border-r border-[#cbb28d]/30 flex items-center justify-end pr-8 sm:pr-12 transition-transform duration-1000 ease-[cubic-bezier(0.77,0,0.175,1)] ${gateOpen ? '-translate-x-full' : 'translate-x-0'
                        }`}
                >
                    <div className="text-right opacity-80">
                        <div className="text-xl sm:text-2xl font-sans tracking-widest font-extrabold uppercase">FRIGOFLOW</div>
                    </div>
                </div>

                {/* Right Gate Door */}
                <div
                    className={`w-1/2 h-full bg-[#080e1e] border-l border-[#cbb28d]/30 flex items-center justify-start pl-8 sm:pl-12 transition-transform duration-1000 ease-[cubic-bezier(0.77,0,0.175,1)] ${gateOpen ? 'translate-x-full' : 'translate-x-0'
                        }`}
                >
                    <div className="text-left opacity-80">
                        <div className="text-xl sm:text-2xl font-sans tracking-widest font-extrabold uppercase">PORTAL</div>
                    </div>
                </div>

                {/* Center Gold Lock Crest Seal */}
                <div
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-700 delay-100 ${gateOpen ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                        }`}
                >
                    <div className="w-16 h-16 rounded-full bg-[#080e1e] border-2 border-[#cbb28d] flex items-center justify-center shadow-[0_0_40px_rgba(203,178,137,0.3)]">
                        <LockKeyhole className="w-7 h-7 text-[#cbb28d]" />
                    </div>
                </div>
            </div>

            {/* Ambient Background Watermark / Glows */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-[#d8c3a5]/10 via-[#091124]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#091124]/5 rounded-full blur-3xl pointer-events-none" />

            {/* MAIN EXECUTIVE CARD CONTAINER */}
            <div className="w-full max-w-4xl bg-white rounded-3xl border border-[#e4dec3]/70 shadow-[0_25px_60px_rgba(9,17,36,0.12)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">

                {/* Left Executive Brand Hero Panel */}
                <div
                    className={`lg:col-span-5 bg-white text-[#080e1e] p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-[#e4dec3] transition-all duration-1000 delay-300 ${gateOpen ? 'translate-x-0 opacity-100' : '-translate-x-12 opacity-0'
                        }`}
                >
                    {/* Radial Glow */}
                    <div className="absolute -top-24 -left-24 w-80 h-80 bg-[#cbb28d]/15 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-900/20 rounded-full blur-2xl pointer-events-none" />

                    {/* Logo with Multiply Blend */}
                    <div className="relative z-10 flex justify-center mb-4 mix-blend-multiply">
                        <img src="/logo.jpg" alt="Frigo Flow" className="h-28 w-auto scale-125" />
                    </div>

                    {/* Brand Emblem Header */}
                    <div className="relative z-10 space-y-6">
                        <div className="space-y-3 pt-6 border-t border-[#e4dec3]">
                            <h2 className="text-3xl sm:text-4xl font-serif text-[#080e1e]">
                                Authorized<br />
                                <span className="text-[#cbb28d] font-light">Personnel Only</span>
                            </h2>
                            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                                Unified health telemetry aggregation, real-time patient biometrics, and precision session analytics.
                            </p>
                        </div>
                    </div>

                    {/* Validic Telemetry Engine Indicator */}
                    <div className="relative z-10 my-8 space-y-3">
                        <div className="p-4 rounded-2xl bg-[#0f192e] border border-[#cbb28d]/20 shadow-lg space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold text-[#f7f3e8]">
                                    <Activity className="w-4 h-4 text-[#cbb28d]" />
                                    <span>Validic Telemetry Layer</span>
                                </div>
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            </div>
                            <p className="text-[11px] text-slate-400">
                                Real-time biometric stream across 9 priority vitals & connected devices.
                            </p>
                        </div>
                    </div>

                </div>

                {/* Right Executive Sign In Form */}
                <div
                    className={`lg:col-span-7 bg-slate-50 p-8 sm:p-12 flex flex-col justify-center transition-all duration-1000 delay-500 ${gateOpen ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'
                        }`}
                >
                    <div className="max-w-md mx-auto w-full space-y-8">

                        {/* Title */}
                        <div className="text-center">
                            <h3 className="text-2xl sm:text-3xl font-sans font-extrabold text-[#080e1e] tracking-tight">
                                Sign In
                            </h3>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-ping" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Email */}
                            {verificationEmail && <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => {
                                prepareEmailVerification(verificationEmail);
                                router.push('/verify-email');
                            }}>Verify Email</Button>}
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-[10px] font-mono uppercase tracking-wider text-[#080e1e] font-bold">
                                    Physician Email
                                </Label>
                                <div className="relative">
                                    <div className="absolute top-0 h-11 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <EmailInput validationContext="login" error={emailValidation.error}
                                        id="email"
                                        
                                        placeholder="doctor@gmail.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10 h-11 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-xl focus:border-[#080e1e] focus:ring-1 focus:ring-[#080e1e] text-xs font-medium shadow-2xs"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-[10px] font-mono uppercase tracking-wider text-[#080e1e] font-bold">
                                        Password
                                    </Label>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10 pr-10 h-11 bg-white border-[#ded8c4] text-[#080e1e] placeholder:text-slate-400 rounded-xl focus:border-[#080e1e] focus:ring-1 focus:ring-[#080e1e] text-xs font-medium shadow-2xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all duration-200 gap-2 mt-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-[#cbb28d]" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        Sign In to Portal
                                        <ArrowRight className="w-4 h-4 text-[#cbb28d]" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Sign Up Link */}
                        <div className="text-center pt-2 border-t border-[#e8e2cf] space-y-2">
                            <p className="text-xs text-slate-500">
                                New medical practice?{' '}
                                <a href="/signup" className="text-[#080e1e] font-bold hover:underline">
                                    Register a clinic account
                                </a>
                            </p>
                            <p className="text-xs text-slate-500">
                                Patient?{' '}
                                <a href="/patient/results" className="text-[#080e1e] font-bold hover:underline">
                                    Access your lab results
                                </a>
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

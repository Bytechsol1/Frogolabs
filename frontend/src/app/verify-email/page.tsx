'use client';

import { EmailInput } from '@/components/ui/email-input';
import { normalizeEmail } from '@/lib/email-validation';
import { useEmailValidation } from '@/lib/use-email-validation';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { Mail, RefreshCw, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { EMAIL_VERIFICATION_KEY, maskEmail, prepareEmailVerification } from '@/lib/email-verification';

export default function VerifyEmailPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const emailValidation = useEmailValidation(email);
    const [sent, setSent] = useState(false);
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [deadline, setDeadline] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [ready, setReady] = useState(false);
    const locked = useRef(false);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(EMAIL_VERIFICATION_KEY) || 'null');
            if (typeof saved?.email === 'string' && saved.email.length <= 254) {
                setEmail(saved.email);
                setSent(saved.sent === true);
                if (Number.isFinite(saved.resendAt)) setDeadline(saved.resendAt);
            }
        } catch { /* No stored registration context. */ }
        setReady(true);
    }, []);

    useEffect(() => {
        const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [deadline]);

    function saveContext(wasSent: boolean, delay: number) {
        const state = prepareEmailVerification(email, wasSent, delay);
        setDeadline(state.resendAt);
        setSeconds(Math.max(0, delay));
        setSent(wasSent);
    }

    function showError(err: unknown, fallback: string) {
        const data = axios.isAxiosError(err) ? err.response?.data : null;
        const known = ['OTP_INVALID', 'OTP_INCORRECT', 'OTP_EXPIRED', 'OTP_ATTEMPTS_EXCEEDED', 'OTP_COOLDOWN', 'RATE_LIMITED', 'EMAIL_DELIVERY_FAILED'];
        setError(known.includes(data?.code) && typeof data?.message === 'string' ? data.message : fallback);
        if (Number.isFinite(data?.retry_after)) saveContext(sent, data.retry_after);
    }

    async function resend() {
        if (locked.current || seconds > 0) return;
        if (!emailValidation.check()) return;
        locked.current = true; setBusy('resend'); setError(''); setSuccess('');
        try {
            const { data } = await axios.post('/api/v1/auth/register/resend', { email: normalizeEmail(email) });
            saveContext(true, data.resend_after || 60);
            setOtp(['', '', '', '', '', '']);
            setSuccess(data.message);
            inputs.current[0]?.focus();
        } catch (err) { showError(err, 'Unable to send verification email. Please try again.'); }
        finally { locked.current = false; setBusy(null); }
    }

    async function verify(event: React.FormEvent) {
        event.preventDefault();
        if (!emailValidation.check()) return;
        if (locked.current || !/^\d{6}$/.test(otp.join(''))) return;
        locked.current = true; setBusy('verify'); setError(''); setSuccess('');
        try {
            const { data } = await axios.post('/api/v1/auth/register/verify', { email: normalizeEmail(email), otp: otp.join('') });
            setOtp(['', '', '', '', '', '']);
            setSuccess('Email verified successfully.');
            try { sessionStorage.removeItem(EMAIL_VERIFICATION_KEY); } catch { }
            try {
                await login(data.access_token);
                router.replace('/dashboard');
            } catch { setError('Your email is verified. Please sign in to continue.'); }
        } catch (err) { showError(err, 'Unable to verify your email. Please try again.'); }
        finally { locked.current = false; setBusy(null); }
    }

    function changeDigit(index: number, value: string) {
        if (/^\d{6}$/.test(value)) { setOtp(value.split('')); inputs.current[5]?.focus(); return; }
        if (!/^\d?$/.test(value)) return;
        setOtp(previous => previous.map((digit, i) => i === index ? value : digit));
        if (value && index < 5) inputs.current[index + 1]?.focus();
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-[#f7f9fb] px-4 py-6 text-[#080e1e]">
            <div className="w-full max-w-md space-y-6">
                <div className="flex justify-center">
                    <img src="/logo.jpg" alt="Frigo Flow" className="h-auto w-52 max-w-full mix-blend-multiply" />
                </div>
                <Card className="gap-0 rounded-3xl border border-[#e6e0ce] bg-white py-0 shadow-[0_8px_30px_rgba(8,14,30,0.05)] ring-0">
                    <CardHeader className="border-b border-[#e6e0ce] bg-[#faf8f3] p-5 sm:p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 shrink-0 rounded-xl bg-[#080e1e] flex items-center justify-center"><Mail className="w-5 h-5 text-[#cbb28d]" aria-hidden="true" /></div>
                            <div>
                                <CardTitle className="text-xl font-extrabold tracking-tight text-[#080e1e]">Verify Your Email</CardTitle>
                                <CardDescription className="text-xs leading-relaxed text-slate-500 mt-1">
                                    {sent ? 'We sent a 6-digit verification code to:' : 'Request a verification code for your email:'}
                                    {email && <strong className="block mt-1 break-all font-semibold text-[#080e1e]">{maskEmail(email)}</strong>}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6">
                        <form onSubmit={verify} className="space-y-5">
                            {(!sent || !!emailValidation.error) && <div className="space-y-2"><Label htmlFor="verification-email" className="text-[11px] font-bold uppercase tracking-wider text-[#080e1e]">Email</Label><EmailInput error={emailValidation.error} className="h-11 rounded-xl border-[#ded8c4] bg-white text-[#080e1e] focus-visible:border-[#8c7657] focus-visible:ring-2 focus-visible:ring-[#cbb28d]/30" id="verification-email"  required value={email} disabled={!!busy} maxLength={254} onChange={event => { setEmail(event.target.value); setError(''); }} /></div>}
                            <div className="space-y-3">
                                <Label htmlFor="otp-digit-1" className="text-[11px] font-bold uppercase tracking-wider text-[#080e1e]">Enter 6-digit verification code</Label>
                                <div className="flex gap-1.5 sm:gap-2" onPaste={event => {
                                    event.preventDefault();
                                    if (locked.current) return;
                                    const value = event.clipboardData.getData('text').replace(/\s/g, '');
                                    if (/^\d{6}$/.test(value)) { setOtp(value.split('')); inputs.current[5]?.focus(); }
                                    else setError('Paste a 6-digit verification code.');
                                }}>
                                    {otp.map((digit, index) => <input key={index} id={`otp-digit-${index + 1}`} aria-label={`Verification digit ${index + 1}`} ref={el => { inputs.current[index] = el; }} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={6} value={digit} disabled={!!busy || !ready} onChange={event => changeDigit(index, event.target.value)} onKeyDown={event => {
                                        if (event.key === 'Backspace' && !digit && index > 0) inputs.current[index - 1]?.focus();
                                        if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
                                        if (event.key === 'ArrowRight' && index < 5) inputs.current[index + 1]?.focus();
                                    }} className="min-w-0 flex-1 w-full h-12 sm:h-14 text-center text-xl sm:text-2xl font-bold text-[#080e1e] border border-[#ded8c4] rounded-xl outline-none focus:border-[#8c7657] focus:ring-2 focus:ring-[#cbb28d]/30 bg-[#faf8f3] disabled:opacity-60" />)}
                                </div>
                                <p className="text-xs leading-relaxed text-slate-500 text-center">Code expires in 10 minutes. Check your spam folder if not received.</p>
                            </div>
                            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 text-center font-medium">{error}</p>}
                            {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 text-center font-medium">{success}</p>}
                            <Button type="submit" className="h-11 w-full gap-2 rounded-full bg-[#080e1e] text-white font-bold hover:bg-[#080e1e] focus-visible:ring-[#cbb28d]/50" disabled={!!busy || !ready || !/^\d{6}$/.test(otp.join(''))}>{busy === 'verify' ? <><Loader2 className="h-4 w-4 animate-spin text-[#cbb28d]" aria-hidden="true" />Verifying...</> : <><ShieldCheck className="h-4 w-4 text-[#cbb28d]" aria-hidden="true" />Verify Code</>}</Button>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#e6e0ce] pt-3 text-xs">
                                <Link href="/signup" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg font-medium text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c7657]"><ArrowLeft className="w-4 h-4" /> Change email / Back</Link>
                                <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-[#8c7657] font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c7657]" onClick={resend} disabled={!!busy || !ready || seconds > 0}><RefreshCw className={`w-3.5 h-3.5 ${busy === 'resend' ? 'animate-spin' : ''}`} />{busy === 'resend' ? 'Sending...' : seconds > 0 ? `Resend code in ${seconds}s` : 'Resend Code'}</button>
                            </div>
                            <p className="text-center text-sm"><Link href="/login" className="font-semibold text-[#080e1e] underline decoration-[#cbb28d] underline-offset-4">Sign in</Link></p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

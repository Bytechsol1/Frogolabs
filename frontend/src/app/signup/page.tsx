'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, ArrowLeft, RefreshCw } from 'lucide-react';

export default function SignupPage() {
    const { login } = useAuth();
    const router = useRouter();

    const [step, setStep] = useState<'form' | 'otp'>('form');
    const [form, setForm] = useState({
        clinicName: '',
        contactName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setOtp(pasted.split(''));
            otpRefs.current[5]?.focus();
        }
        e.preventDefault();
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setIsLoading(true);
        try {
            await axios.post('/api/v1/auth/register', {
                clinicName: form.clinicName,
                contactName: form.contactName,
                email: form.email,
                phone: form.phone,
                password: form.password,
            });
            setStep('otp');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please enter the full 6-digit code.');
            return;
        }
        setError('');
        setIsLoading(true);
        try {
            const response = await axios.post('/api/v1/auth/register/verify', {
                email: form.email,
                otp: code,
            });
            await login(response.data.access_token);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Verification failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setError('');
        try {
            await axios.post('/api/v1/auth/register', {
                clinicName: form.clinicName,
                contactName: form.contactName,
                email: form.email,
                phone: form.phone,
                password: form.password,
            });
            setOtp(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to resend code.');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <div className="w-full max-w-md space-y-6">
                {/* Logo */}
                <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="bg-primary w-9 h-9 rounded-md flex items-center justify-center text-primary-foreground font-bold italic text-lg">F</div>
                        <span className="text-2xl font-extrabold text-primary">Frigo Labs</span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        {step === 'form' ? 'Create your clinic account to get started' : 'Check your email for a verification code'}
                    </p>
                </div>

                {step === 'form' ? (
                    <Card className="border-none shadow-md">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-xl font-bold">Register Your Clinic</CardTitle>
                            <CardDescription>Fill in your clinic details below</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleFormSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="clinicName">Clinic Name</Label>
                                    <Input
                                        id="clinicName"
                                        placeholder="e.g. Austin Family Clinic"
                                        required
                                        value={form.clinicName}
                                        onChange={set('clinicName')}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="contactName">Your Full Name</Label>
                                    <Input
                                        id="contactName"
                                        placeholder="e.g. Dr. Emily Carter"
                                        required
                                        value={form.contactName}
                                        onChange={set('contactName')}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="you@clinic.com"
                                            required
                                            value={form.email}
                                            onChange={set('email')}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone</Label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="(555) 000-0000"
                                            value={form.phone}
                                            onChange={set('phone')}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Min. 6 characters"
                                            required
                                            value={form.password}
                                            onChange={set('password')}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            onClick={() => setShowPassword(v => !v)}
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        placeholder="Re-enter your password"
                                        required
                                        value={form.confirmPassword}
                                        onChange={set('confirmPassword')}
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-destructive text-center font-medium">{error}</p>
                                )}

                                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
                                    {isLoading ? 'Sending code...' : 'Continue'}
                                </Button>

                                <p className="text-center text-sm text-muted-foreground">
                                    Already have an account?{' '}
                                    <a href="/login" className="text-primary font-semibold hover:underline">Sign in</a>
                                </p>
                            </form>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-none shadow-md">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Mail className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold">Verify your email</CardTitle>
                                    <CardDescription className="text-xs">Code sent to <strong>{form.email}</strong></CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleOtpSubmit} className="space-y-6">
                                <div className="space-y-3">
                                    <Label>Enter 6-digit verification code</Label>
                                    <div className="flex gap-2 justify-between" onPaste={handleOtpPaste}>
                                        {otp.map((digit, i) => (
                                            <input
                                                key={i}
                                                ref={el => { otpRefs.current[i] = el; }}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={1}
                                                value={digit}
                                                onChange={e => handleOtpChange(i, e.target.value)}
                                                onKeyDown={e => handleOtpKeyDown(i, e)}
                                                className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none focus:border-primary transition-colors bg-background"
                                            />
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center">
                                        Code expires in 10 minutes. Check your spam folder if not received.
                                    </p>
                                </div>

                                {error && (
                                    <p className="text-sm text-destructive text-center font-medium">{error}</p>
                                )}

                                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading || otp.join('').length !== 6}>
                                    {isLoading ? 'Verifying...' : 'Verify & Create Account'}
                                </Button>

                                <div className="flex items-center justify-between text-sm">
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => { setStep('form'); setError(''); setOtp(['', '', '', '', '', '']); }}
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </button>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 text-primary font-semibold hover:underline disabled:opacity-50"
                                        onClick={handleResend}
                                        disabled={resending}
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                                        {resending ? 'Sending...' : 'Resend code'}
                                    </button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

'use client';

import { EmailInput } from '@/components/ui/email-input';
import { normalizeEmail, validateEmail } from '@/lib/email-validation';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowLeft, ArrowRight, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';

import { prepareEmailVerification } from '@/lib/email-verification';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

function signupPhone(value: string) {
    const international = value.trim().replace(/^00/, '+');
    const phone = international.length <= 40 && /^\+[\d\s().-]+$/.test(international)
        ? parsePhoneNumberFromString(international, { extract: false }) : undefined;
    return phone && phone.countryCallingCode === '1' && !phone.ext && phone.isValid() ? phone.number : null;
}
function validatePhone(value: string) {
    if (!value.trim()) return 'Enter your phone number.';
    return signupPhone(value) ? '' : 'Enter a valid +1 number, such as +1 202 555 0123.';
}
const registeredEmailMessage = 'This email is already registered. Please use another email or sign in.';

export default function SignupPage() {
    const router = useRouter();

    const [form, setForm] = useState({
        clinicName: '',
        contactName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const submitting = useRef(false);


    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setForm(prev => ({ ...prev, [field]: value }));
        setError('');
        if (field === 'email') setEmailError(validateEmail(value) || (normalizeEmail(value) === registeredEmail ? registeredEmailMessage : ''));
        if (field === 'phone' && phoneError) setPhoneError(validatePhone(value));
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting.current) return;
        setError('');

        const invalidEmail = validateEmail(form.email) || (normalizeEmail(form.email) === registeredEmail ? registeredEmailMessage : '');
        setEmailError(invalidEmail);
        if (invalidEmail) {
            document.getElementById('email')?.focus();
            return;
        }
        if (!form.clinicName.trim() || !form.contactName.trim()) {
            setError('Enter your clinic name and full name.');
            document.getElementById(!form.clinicName.trim() ? 'clinicName' : 'contactName')?.focus();
            return;
        }
        const invalidPhone = validatePhone(form.phone);
        const normalizedPhone = signupPhone(form.phone);
        setPhoneError(invalidPhone);
        if (invalidPhone || !normalizedPhone) {
            document.getElementById('phone')?.focus();
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (new TextEncoder().encode(form.password).length > 72) {
            setError('Password is too long. Use at most 72 bytes.');
            return;
        }

        submitting.current = true;
        setIsLoading(true);
        try {
            const response = await axios.post('/api/v1/auth/register', {
                clinicName: form.clinicName.trim(),
                contactName: form.contactName.trim(),
                email: normalizeEmail(form.email),
                phone: normalizedPhone,
                password: form.password,
            });
            prepareEmailVerification(form.email, true, response.data.resend_after || 60);
            router.push('/verify-email');
        } catch (err: any) {
            if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                prepareEmailVerification(form.email, false, 0);
                router.push('/verify-email');
                return;
            }
            if (err.response?.data?.code === 'EMAIL_ALREADY_REGISTERED') {
                setRegisteredEmail(normalizeEmail(form.email));
                setEmailError(registeredEmailMessage);
                document.getElementById('email')?.focus();
                return;
            }
            if (err.response?.data?.code === 'EMAIL_DELIVERY_FAILED') {
                setError('Registration was not completed because the verification email could not be sent. Please try again shortly.');
                return;
            }
            const msg = err.response?.status >= 500 ? 'Registration is temporarily unavailable. Please try again shortly.' : err.response?.data?.message;
            if (typeof msg === 'string') {
                setError(msg);
            } else if (!err.response) {
                setError('Unable to reach the server. Please check your connection and try again.');
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            submitting.current = false;
            setIsLoading(false);
        }
    };

    const inputClass = "h-10 rounded-xl border-[#ded8c4] bg-white px-3.5 text-[#080e1e] placeholder:text-slate-400 focus-visible:border-[#8c7657] focus-visible:ring-2 focus-visible:ring-[#cbb28d]/30";
    const labelClass = "text-[11px] font-bold uppercase tracking-wider text-[#080e1e]";

    return (
        <main className="min-h-screen bg-[#f7f9fb] px-4 py-5 text-[#080e1e] sm:px-6 sm:py-6 lg:flex lg:flex-col lg:justify-center">
            <div className="mx-auto w-full max-w-4xl">
                <Link href="/login" className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#e6e0ce] bg-white px-4 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8c7657]">
                    <ArrowLeft className="h-4 w-4 text-[#8c7657]" aria-hidden="true" />
                    Back to Sign In
                </Link>

                <div className="grid overflow-hidden rounded-3xl border border-[#e6e0ce] bg-white shadow-[0_16px_50px_rgba(8,14,30,0.06)] lg:grid-cols-[0.85fr_1.15fr]">
                    <aside className="flex flex-col justify-between border-b border-[#e6e0ce] bg-[#faf8f3] px-5 py-3 sm:px-7 sm:py-4 lg:border-b-0 lg:border-r lg:p-7">
                        <div>
                            <img src="/logo.jpg" alt="Frigo Flow" className="h-auto w-44 max-w-full mix-blend-multiply lg:w-52" />
                            <div className="mt-6 hidden border-t border-[#e6e0ce] pt-6 lg:block">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8c7657]">Your clinic, connected</p>
                                <h2 className="font-serif text-3xl leading-tight">A new home for<br className="hidden lg:block" /> <span className="text-[#a88a5c]">your practice.</span></h2>
                                <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">Bring your patients, diagnostic sessions and lab results together in Frigo Flow.</p>
                            </div>
                        </div>

                        <ol className="my-7 hidden space-y-4 lg:block" aria-label="Account setup steps">
                            {[
                                ['Clinic details', 'Tell us about your practice.'],
                                ['Verify your email', 'Confirm the code sent to your inbox.'],
                                ['Sign in', 'Access your clinic workspace.'],
                            ].map(([title, description], index) => (
                                <li key={title} className="flex items-start gap-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ded8c4] bg-white text-xs font-bold text-[#8c7657]">0{index + 1}</span>
                                    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>
                                </li>
                            ))}
                        </ol>

                        <div className="hidden items-center gap-2 border-t border-[#e6e0ce] pt-4 text-[11px] font-medium text-[#8c7657] lg:flex">
                            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Email verification protects your account
                        </div>
                    </aside>

                    <section className="min-w-0 p-5 sm:p-7" aria-labelledby="signup-heading">
                        <header className="mb-5">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8c7657]">Create your account</p>
                            <h1 id="signup-heading" className="text-2xl font-extrabold tracking-tight">Register Your Clinic</h1>
                            <p className="mt-1.5 text-xs text-slate-500">Fill in your clinic details to get started.</p>
                        </header>

                        <form noValidate onSubmit={handleFormSubmit} className="space-y-3" aria-busy={isLoading}>
                            <div className="space-y-1.5">
                                <Label htmlFor="clinicName" className={labelClass}>Clinic Name</Label>
                                <Input id="clinicName" autoComplete="organization" placeholder="e.g. Austin Family Clinic" required maxLength={160} value={form.clinicName} onChange={set('clinicName')} className={inputClass} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="contactName" className={labelClass}>Your Full Name</Label>
                                <Input id="contactName" autoComplete="name" placeholder="e.g. Dr. Emily Carter" required maxLength={160} value={form.contactName} onChange={set('contactName')} className={inputClass} />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="min-w-0 space-y-1.5">
                                    <Label htmlFor="email" className={labelClass}>Email</Label>
                                    <EmailInput error={emailError} id="email"  autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@clinic.com" required maxLength={254} value={form.email} onChange={set('email')} onBlur={() => setEmailError(validateEmail(form.email) || (normalizeEmail(form.email) === registeredEmail ? registeredEmailMessage : ''))} onInvalid={() => setEmailError(validateEmail(form.email) || 'Please enter a valid email address')} aria-invalid={!!emailError}  className={inputClass} />
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <Label htmlFor="phone" className={labelClass}>Phone</Label>
                                    <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 202 555 0123" required maxLength={40} value={form.phone} onChange={set('phone')} onBlur={() => setPhoneError(validatePhone(form.phone))} onInvalid={() => setPhoneError(validatePhone(form.phone))} aria-invalid={!!phoneError} aria-describedby={phoneError ? 'signup-phone-error' : 'signup-phone-help'} className={inputClass} />
                                    {phoneError ? <p id="signup-phone-error" role="alert" className="text-xs leading-relaxed text-rose-700">{phoneError}</p> : <p id="signup-phone-help" className="text-[11px] text-slate-500">Only +1 numbers are accepted.</p>}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="password" className={labelClass}>Password</Label>
                                <div className="relative">
                                    <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Min. 6 characters" required value={form.password} onChange={set('password')} className={inputClass + ' pr-12'} />
                                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-xl text-[#8c7657] focus-visible:outline-2 focus-visible:outline-[#8c7657]" onClick={() => setShowPassword(v => !v)}>
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="confirmPassword" className={labelClass}>Confirm Password</Label>
                                <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter your password" required value={form.confirmPassword} onChange={set('confirmPassword')} className={inputClass} />
                            </div>
                            {error && (
                                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
                                </div>
                            )}
                            <Button type="submit" className="mt-2 h-11 w-full gap-2 rounded-full bg-[#080e1e] text-sm font-bold text-white hover:bg-[#080e1e] focus-visible:ring-[#cbb28d]/50" disabled={isLoading}>
                                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin text-[#cbb28d]" aria-hidden="true" />Sending code...</> : <>Sign Up<ArrowRight className="h-4 w-4 text-[#cbb28d]" aria-hidden="true" /></>}
                            </Button>
                            <p className="pt-1 text-center text-xs leading-relaxed text-slate-500">We will send a verification code to your email.</p>
                            <p className="border-t border-[#e6e0ce] pt-3 text-center text-xs text-slate-500">
                                Already have an account?{' '}<Link href="/login" className="font-semibold text-[#080e1e] underline decoration-[#cbb28d] underline-offset-4">Sign in</Link>
                            </p>
                        </form>
                    </section>
                </div>
            </div>
        </main>
    );
}

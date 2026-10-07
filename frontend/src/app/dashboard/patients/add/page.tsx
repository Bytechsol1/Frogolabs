'use client';

import { EmailInput } from '@/components/ui/email-input';
import { UsPhoneInput } from '@/components/ui/us-phone-input';
import { patientDetailsSchema, patientFieldErrors, patientOrderFieldErrors } from '@frigo-flow/validation';
import { useFormValidation } from '@/lib/use-form-validation';
import { FieldError } from '@/components/ui/field-error';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, UserRound, UserPlus, Loader2 } from 'lucide-react';
import { OrderLabTestModal, type NewLabPatient } from '@/components/patients/OrderLabTestModal';

function calculateAge(dob: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return '';
    // Interpret a date-only birthday locally so UTC offsets cannot shift its day.
    const birthDate = new Date(`${dob}T00:00:00`);
    const [year, month, day] = dob.split('-').map(Number);
    const today = new Date();
    if (Number.isNaN(birthDate.getTime()) || birthDate.getFullYear() !== year ||
        birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day || birthDate > today) return '';
    const birthdayPending = today.getMonth() < month - 1 ||
        (today.getMonth() === month - 1 && today.getDate() < day);
    return String(today.getFullYear() - year - (birthdayPending ? 1 : 0));
}

export default function AddPatientPage() {
    const router = useRouter();
    const { user } = useAuth();

    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        secondary_phone: '',
        address: '',
        postal_code: '',
        dob: '',
        gender: '',
    });
    const age = calculateAge(form.dob);
    const today = new Date();
    const latestDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const savedPatientId = useRef<string | null>(null);
    const [patientSaved, setPatientSaved] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [ordering, setOrdering] = useState(false);
    const validation = useFormValidation(form, ordering ? patientOrderFieldErrors : patientFieldErrors);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const savePatient = async (details?: NewLabPatient, testName?: string) => {
        const candidate = { ...form, ...details };
        if (!validation.check(candidate, details ? patientOrderFieldErrors : patientFieldErrors)) throw new Error('Please correct the highlighted patient details.');
        const validated = patientDetailsSchema.parse(candidate);
        if (savedPatientId.current) return savedPatientId.current;
        const res = await axios.post(
            '/api/v1/patients',
            { ...validated,
                age: calculateAge(details?.dob ?? form.dob), ...(testName ? { test_type: testName } : {}) },
            { headers: { Authorization: `Bearer ${user?.token}` } }
        );
        savedPatientId.current = res.data.id;
        if (details) setForm(previous => ({
            ...previous,
            first_name: details.first_name, last_name: details.last_name,
            email: details.email ?? previous.email, phone: details.phone ?? previous.phone,
            dob: details.dob ?? previous.dob, gender: details.gender ?? previous.gender,
            address: details.address ?? previous.address, postal_code: details.postal_code ?? previous.postal_code,
        }));
        setPatientSaved(true);
        return res.data.id as string;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError('');
        setOrdering(false);
        if (!validation.check(form, patientFieldErrors)) return;
        setSubmitting(true);
        try {
            const id = await savePatient();
            router.push(`/dashboard/patients/${id}`);
        } catch (err: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : err instanceof Error ? err.message : '';
            setError(message || 'Failed to add patient. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = 'h-11 rounded-xl border-[#ded8c4] bg-white px-3.5 text-[#080e1e] placeholder:text-slate-400 focus-visible:border-[#8c7657] focus-visible:ring-2 focus-visible:ring-[#cbb28d]/30 read-only:bg-[#faf8f3]';
    const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-[#080e1e]';

    return (
        <div className="max-w-3xl mx-auto space-y-6 text-[#080e1e]">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                <Button variant="outline" size="sm" className="h-9 rounded-full border-[#e6e0ce] bg-white px-4 text-[#080e1e] hover:bg-white" onClick={() => router.back()}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#080e1e]">Add New Patient</h1>
                    <p className="text-slate-500 text-sm mt-1">Fill in the patient details and order a lab test.</p>
                </div>
            </div>

            <form noValidate onSubmit={handleSubmit} className="space-y-5">
                {/* Patient Info */}
                <Card className="gap-0 rounded-3xl border border-[#e6e0ce] bg-white py-0 shadow-[0_4px_25px_rgba(8,14,30,0.04)] ring-0">
                    <CardHeader className="border-b border-[#e6e0ce] bg-[#faf8f3] px-5 py-5 sm:px-7">
                        <CardTitle className="flex items-center gap-3 text-base font-bold text-[#080e1e]">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#080e1e] text-[#cbb28d]"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
                            Patient Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-7">
                        <fieldset disabled={submitting || patientSaved} className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-5 disabled:opacity-70">
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="first_name">First Name <span className="text-destructive">*</span></Label>
                                <Input
                                    className={inputClass}
                                    id="first_name"
                                    {...validation.propsFor('first_name')}
                                    name="first_name"
                                    placeholder="e.g. James"
                                    value={form.first_name}
                                    onChange={handleChange}
                                    required
                                />
                                <FieldError id="first_name" message={validation.errorFor('first_name')} />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="last_name">Last Name <span className="text-destructive">*</span></Label>
                                <Input
                                    className={inputClass}
                                    id="last_name"
                                    {...validation.propsFor('last_name')}
                                    name="last_name"
                                    placeholder="e.g. Carter"
                                    value={form.last_name}
                                    onChange={handleChange}
                                    required
                                />
                                <FieldError id="last_name" message={validation.errorFor('last_name')} />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="email">Email Address</Label>
                                <EmailInput required={ordering} error={validation.errorFor('email')}
                                    className={inputClass}
                                    id="email"
                                    name="email"
                                    placeholder="patient@gmail.com"
                                    value={form.email}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="phone">Phone Number</Label>
                                <UsPhoneInput required={ordering} submitted={validation.submitted}
                                    className={inputClass}
                                    id="phone"
                                    name="phone"
                                    placeholder="+1 202 555 0123"
                                    value={form.phone}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="secondary_phone">Secondary Phone</Label>
                                <UsPhoneInput submitted={validation.submitted}
                                    className={inputClass}
                                    id="secondary_phone"
                                    name="secondary_phone"
                                    placeholder="+1 202 555 0124"
                                    autoComplete="off"
                                    value={form.secondary_phone}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="address">Address <span className="text-destructive">*</span></Label>
                                <Input
                                    className={inputClass}
                                    id="address"
                                    {...validation.propsFor('address')}
                                    name="address"
                                    placeholder="123 Main St, Austin, TX"
                                    value={form.address}
                                    onChange={handleChange}
                                    required
                                />
                                <FieldError id="address" message={validation.errorFor('address')} />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="postal_code">Postal Code <span className="text-destructive">*</span></Label>
                                <Input
                                    className={inputClass}
                                    id="postal_code"
                                    {...validation.propsFor('postal_code')}
                                    name="postal_code"
                                    placeholder="78701"
                                    value={form.postal_code}
                                    onChange={handleChange}
                                    required
                                />
                                <FieldError id="postal_code" message={validation.errorFor('postal_code')} />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="dob">Date of Birth</Label>
                                <Input
                                    className={inputClass}
                                    id="dob"
                                    {...validation.propsFor('dob')}
                                    name="dob"
                                    type="date"
                                    max={latestDob}
                                    value={form.dob}
                                    onChange={handleChange}
                                />
                                <FieldError id="dob" message={validation.errorFor('dob')} />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="age">Age</Label>
                                <Input
                                    className={inputClass}
                                    id="age"
                                    name="age"
                                    type="number"
                                    min={0}
                                    max={150}
                                    placeholder="Calculated from date of birth"
                                    value={age}
                                    readOnly
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className={labelClass} htmlFor="gender">Gender</Label>
                                <select
                                    id="gender"
                                    {...validation.propsFor('gender')}
                                    name="gender"
                                    value={form.gender}
                                    onChange={handleChange}
                                    className={`${inputClass} w-full min-w-0 border text-base outline-none md:text-sm`}
                                >
                                    <option value="">Select gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                                <FieldError id="gender" message={validation.errorFor('gender')} />
                            </div>
                        </fieldset>
                    </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e6e0ce] bg-[#faf8f3] p-5">
                    <p className="text-sm text-slate-500">
                        {patientSaved ? 'Patient saved. Retry the lab order or open the patient card.' : 'Choose and order a lab test for this patient.'}
                    </p>
                    <OrderLabTestModal
                        patient={form}
                        beforeOpen={() => { setOrdering(true); return validation.check(form, patientOrderFieldErrors); }}
                        disabled={submitting}
                        createPatient={savePatient}
                        onOrderCreated={() => {
                            if (savedPatientId.current) router.push(`/dashboard/patients/${savedPatientId.current}`);
                        }}
                    />
                </div>

                {error && (
                    <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm font-medium">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pb-8">
                    <Button type="button" variant="outline" className="h-11 rounded-full border-[#ded8c4] bg-white px-6 text-[#080e1e] hover:bg-white" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="h-11 gap-2 rounded-full bg-[#080e1e] px-6 text-white hover:bg-[#080e1e] focus-visible:ring-[#cbb28d]/50">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin text-[#cbb28d]" aria-hidden="true" /> : <UserPlus className="h-4 w-4 text-[#cbb28d]" aria-hidden="true" />}
                        {submitting ? 'Adding Patient...' : patientSaved ? 'Open Patient Card' : 'Add Patient'}
                    </Button>
                </div>
            </form>
        </div>
    );
}

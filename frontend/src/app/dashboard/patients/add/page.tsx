'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, CheckCircle2, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

const TEST_PACKAGES = [
    {
        key: 'Tasso+ Basic Panel',
        label: 'Tasso+ Basic Panel',
        description: 'Core biomarker screening via at-home Tasso blood collection.',
        turnaround: '3–5 business days',
        color: 'border-blue-300 bg-blue-50/50',
        activeColor: 'border-blue-500 bg-blue-50 ring-2 ring-blue-400',
        iconColor: 'text-blue-500',
    },
    {
        key: 'Tasso+ Comprehensive Panel',
        label: 'Tasso+ Comprehensive Panel',
        description: 'Extended panel covering metabolic, hormonal, and inflammatory markers.',
        turnaround: '5–7 business days',
        color: 'border-indigo-300 bg-indigo-50/50',
        activeColor: 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-400',
        iconColor: 'text-indigo-500',
    },
    {
        key: 'Tasso+ DNA Analysis',
        label: 'Tasso+ DNA Analysis',
        description: 'Genomic profiling for genetic risk assessment and personalized care.',
        turnaround: '10–14 business days',
        color: 'border-purple-300 bg-purple-50/50',
        activeColor: 'border-purple-500 bg-purple-50 ring-2 ring-purple-400',
        iconColor: 'text-purple-500',
    },
    {
        key: 'Standard Lab Screening',
        label: 'Standard Lab Screening',
        description: 'Traditional in-clinic venipuncture lab panel for routine diagnostics.',
        turnaround: '2–4 business days',
        color: 'border-emerald-300 bg-emerald-50/50',
        activeColor: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400',
        iconColor: 'text-emerald-500',
    },
];

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
    });
    const [selectedPackage, setSelectedPackage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPackage) {
            setError('Please select a test package.');
            return;
        }
        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First name and last name are required.');
            return;
        }
        if (!form.address.trim() || !form.postal_code.trim()) {
            setError('Address and Postal Code are required.');
            return;
        }
        setError('');
        setSubmitting(true);
        try {
            const res = await axios.post(
                '/api/v1/patients',
                { ...form, test_type: selectedPackage },
                { headers: { Authorization: `Bearer ${user?.token}` } }
            );
            router.push(`/dashboard/patients/${res.data.id}`);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to add patient. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div className="h-4 w-px bg-border mx-2" />
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-primary">Add New Patient</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">Fill in the patient details and select a test package to begin the diagnostic workflow.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Patient Info */}
                <Card className="border-none shadow-sm">
                    <CardHeader className="border-b">
                        <CardTitle className="text-base font-bold">Patient Information</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="first_name">First Name <span className="text-destructive">*</span></Label>
                            <Input
                                id="first_name"
                                name="first_name"
                                placeholder="e.g. James"
                                value={form.first_name}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="last_name">Last Name <span className="text-destructive">*</span></Label>
                            <Input
                                id="last_name"
                                name="last_name"
                                placeholder="e.g. Carter"
                                value={form.last_name}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="patient@example.com"
                                value={form.email}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input
                                id="phone"
                                name="phone"
                                type="tel"
                                placeholder="(512) 555-0100"
                                value={form.phone}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="secondary_phone">Secondary Phone</Label>
                            <Input
                                id="secondary_phone"
                                name="secondary_phone"
                                type="tel"
                                placeholder="(512) 555-0101"
                                value={form.secondary_phone}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="address">Address <span className="text-destructive">*</span></Label>
                            <Input
                                id="address"
                                name="address"
                                placeholder="123 Main St, Austin, TX"
                                value={form.address}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="postal_code">Postal Code <span className="text-destructive">*</span></Label>
                            <Input
                                id="postal_code"
                                name="postal_code"
                                placeholder="78701"
                                value={form.postal_code}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dob">Date of Birth</Label>
                            <Input
                                id="dob"
                                name="dob"
                                type="date"
                                value={form.dob}
                                onChange={handleChange}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Test Package Selection */}
                <Card className="border-none shadow-sm">
                    <CardHeader className="border-b">
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                            <FlaskConical className="w-4 h-4 text-primary" />
                            Select Test Package <span className="text-destructive">*</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {TEST_PACKAGES.map(pkg => {
                            const isSelected = selectedPackage === pkg.key;
                            return (
                                <button
                                    key={pkg.key}
                                    type="button"
                                    onClick={() => setSelectedPackage(pkg.key)}
                                    className={cn(
                                        'relative text-left rounded-xl border-2 p-5 transition-all duration-200 hover:shadow-md',
                                        isSelected ? pkg.activeColor : pkg.color
                                    )}
                                >
                                    {isSelected && (
                                        <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-primary" />
                                    )}
                                    <p className={cn('text-base font-bold mb-1', pkg.iconColor)}>{pkg.label}</p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{pkg.description}</p>
                                    <p className="text-xs font-semibold text-muted-foreground mt-3 uppercase tracking-wider">
                                        Turnaround: {pkg.turnaround}
                                    </p>
                                </button>
                            );
                        })}
                    </CardContent>
                </Card>

                {error && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm font-medium">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pb-8">
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="gap-2 px-8">
                        {submitting ? 'Adding Patient...' : 'Add Patient & Start Workflow'}
                    </Button>
                </div>
            </form>
        </div>
    );
}

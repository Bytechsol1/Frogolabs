'use client';

import { EmailInput } from '@/components/ui/email-input';
import { UsPhoneInput } from '@/components/ui/us-phone-input';
import { patientDetailsSchema, patientFieldErrors } from '@frigo-flow/validation';
import { useFormValidation } from '@/lib/use-form-validation';
import { FieldError } from '@/components/ui/field-error';

import { useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

export function AddPatientDialog({ onPatientAdded }: { onPatientAdded: () => void }) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        secondary_phone: '',
        address: '',
        postal_code: '',
        date_of_birth: ''
    });

    const details = { ...formData, dob: formData.date_of_birth };
    const validation = useFormValidation(details, patientFieldErrors);
    const [error, setError] = useState('');
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError('');
        if (!user?.token) { setError('Please sign in again before adding a patient.'); return; }
        if (!validation.check()) return;
        setLoading(true);
        try {
            await axios.post('/api/v1/patients', patientDetailsSchema.parse(details), {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            setOpen(false);
            validation.reset();
            setFormData({ first_name: '', last_name: '', email: '', phone: '', secondary_phone: '', address: '', postal_code: '', date_of_birth: '' });
            onPatientAdded();
        } catch {
            setError('Could not save patient. Please check the details and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
                <Button className="bg-secondary hover:bg-secondary/90">
                    <Plus className="mr-2 h-4 w-4" /> Add Patient
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Patient</DialogTitle>
                    <DialogDescription>
                        Enter the patient details below to register them in the clinic.
                    </DialogDescription>
                </DialogHeader>
                <form noValidate onSubmit={handleSubmit} className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-2">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="first_name" className="text-right">First Name</Label>
                        <Input
                            id="first_name"
                            {...validation.propsFor('first_name')}
                            className="col-span-3"
                            required
                            value={formData.first_name}
                            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        />
                        {validation.errorFor('first_name') && <div className="col-span-3 col-start-2"><FieldError id="first_name" message={validation.errorFor('first_name')} /></div>}
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="last_name" className="text-right">Last Name</Label>
                        <Input
                            id="last_name"
                            {...validation.propsFor('last_name')}
                            className="col-span-3"
                            required
                            value={formData.last_name}
                            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        />
                        {validation.errorFor('last_name') && <div className="col-span-3 col-start-2"><FieldError id="last_name" message={validation.errorFor('last_name')} /></div>}
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="email" className="text-right">Email</Label>
                        <EmailInput error={validation.errorFor('email')}
                            id="email"
                            className="col-span-3"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="phone" className="text-right">Phone</Label>
                        <UsPhoneInput submitted={validation.submitted}
                            placeholder="+1 202 555 0123"
                            id="phone"
                            className="col-span-3"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="dob" className="text-right">DOB</Label>
                        <Input
                            id="dob"
                            {...validation.propsFor('dob')}
                            type="date"
                            className="col-span-3"
                            value={formData.date_of_birth}
                            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                        />
                        {validation.errorFor('dob') && <div className="col-span-3 col-start-2"><FieldError id="dob" message={validation.errorFor('dob')} /></div>}
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="secondary_phone" className="text-right">Alt Phone</Label>
                        <UsPhoneInput submitted={validation.submitted}
                            placeholder="+1 202 555 0124"
                            autoComplete="off"
                            id="secondary_phone"
                            className="col-span-3"
                            value={formData.secondary_phone}
                            onChange={(e) => setFormData({ ...formData, secondary_phone: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="address" className="text-right">Address</Label>
                        <Input
                            id="address"
                            {...validation.propsFor('address')}
                            className="col-span-3"
                            required
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                        {validation.errorFor('address') && <div className="col-span-3 col-start-2"><FieldError id="address" message={validation.errorFor('address')} /></div>}
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="postal_code" className="text-right">Postal Code</Label>
                        <Input
                            id="postal_code"
                            {...validation.propsFor('postal_code')}
                            className="col-span-3"
                            required
                            value={formData.postal_code}
                            onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                        />
                        {validation.errorFor('postal_code') && <div className="col-span-3 col-start-2"><FieldError id="postal_code" message={validation.errorFor('postal_code')} /></div>}
                    </div>
                    <DialogFooter>
                        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Adding...' : 'Save Patient'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

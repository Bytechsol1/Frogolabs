'use client';

import { EmailInput } from '@/components/ui/email-input';
import { usLabPhoneSchema, validateUsLabPhone } from '@frigo-flow/validation';
import { UsPhoneInput } from '@/components/ui/us-phone-input';
import { normalizeEmail, validateEmail } from '@/lib/email-validation';
import { useEmailValidation } from '@/lib/use-email-validation';

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { FlaskConical, Loader2, AlertCircle } from "lucide-react";

interface TerraProductType {
    id: number;
    name: string;
    description?: string;
}

interface TerraProduct {
    id: number;
    product_type_id: number;
    name: string;
    description?: string;
}

interface TerraVariant {
    id: number;
    product_id: number;
    variant_name: string;
    available_collection_types: string[];
    supported_ship_to_countries: string[];
}

type Patient = {
    id?: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    dob?: string | null;
    gender?: string | null;
    address?: string | null;
    postal_code?: string | null;
};

export type NewLabPatient = Omit<Patient, 'id'>;

type OrderLabTestModalProps = {
    patient: Patient;
    onOrderCreated: () => void;
    beforeOpen?: () => boolean;
    disabled?: boolean;
    createPatient?: (details: NewLabPatient, testName: string) => Promise<string>;
};

function normalizeGender(gender?: string | null): 'male' | 'female' | '' {
    if (!gender) return '';
    const g = gender.trim().toLowerCase();
    if (g.startsWith('m')) return 'male';
    if (g.startsWith('f')) return 'female';
    return '';
}

const selectClass = "w-full bg-white border border-[#ded8c4] rounded-xl px-3 py-2 text-xs font-bold text-[#080e1e] outline-none disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass = "text-[10px] font-bold text-[#8c7657] uppercase";
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

export function OrderLabTestModal({ patient, onOrderCreated, beforeOpen, disabled, createPatient }: OrderLabTestModalProps) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [orderingConfig, setOrderingConfig] = useState<{ environment: 'SANDBOX' | 'PRODUCTION'; orderingEnabled: boolean } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [countryRejected, setCountryRejected] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [error]);

    const [productTypes, setProductTypes] = useState<TerraProductType[] | null>(null);
    const [loadingTypes, setLoadingTypes] = useState(false);
    const [selectedTypeId, setSelectedTypeId] = useState('');
    // Product count per category, probed once when the modal opens, so empty
    // categories (e.g. DNA Test / Connected Device with 0 sandbox products)
    // can be disabled up front instead of leaving a dead-end empty dropdown.
    const [categoryProductCounts, setCategoryProductCounts] = useState<Record<string, number> | null>(null);

    const [products, setProducts] = useState<TerraProduct[] | null>(null);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState('');

    const [variants, setVariants] = useState<TerraVariant[] | null>(null);
    const [loadingVariants, setLoadingVariants] = useState(false);
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const productRequest = useRef(0);
    const variantRequest = useRef(0);

    const [collectionType, setCollectionType] = useState('');
    const [consentAccepted, setConsentAccepted] = useState(false);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    const [recipient, setRecipient] = useState({
        first_name: patient.first_name || '',
        last_name: patient.last_name || '',
        email: patient.email || '',
        phone_number: patient.phone || '',
        date_of_birth: patient.dob ? patient.dob.slice(0, 10) : '',
        gender_at_birth: normalizeGender(patient.gender),
    });

    const [shipping, setShipping] = useState({
        address_line_1: patient.address || '',
        address_line_2: '',
        city: '',
        administrative_area: '',
        postal_code: patient.postal_code || '',
    });

    const authHeaders = { headers: { Authorization: `Bearer ${user?.token}` } };
    const selectedVariant = variants?.find(v => String(v.id) === selectedVariantId) || null;
    const usAlternative = products?.find(p => String(p.id) === '10002' || /^advanced blood (test|panel)$/i.test(p.name));
    // Submit the requested US destination unchanged; Terra validates fulfillment.
    const shippingCountry = 'US';
    const phoneResult = usLabPhoneSchema.safeParse(recipient.phone_number);
    const normalizedPhone = phoneResult.success ? phoneResult.data : null;

    function resetCascadeFromType() {
        setCountryRejected(false);
        variantRequest.current++;
        setLoadingVariants(false);
        setConsentAccepted(false);
        setProducts(null);
        setSelectedProductId('');
        setVariants(null);
        setSelectedVariantId('');
        setCollectionType('');
    }
    function resetCascadeFromProduct() {
        setCountryRejected(false);
        setConsentAccepted(false);
        setVariants(null);
        setSelectedVariantId('');
        setCollectionType('');
    }

    async function openModal() {
        if (beforeOpen && !beforeOpen()) return;
        productRequest.current++;
        setLoadingProducts(false);
        resetCascadeFromType();
        setSelectedTypeId('');
        emailValidation.reset();
        // Always prefill from the current patient record or Add Patient form.
        setConsentAccepted(false);
        setAttemptedSubmit(false);
        setRecipient({
            first_name: patient.first_name || '', last_name: patient.last_name || '',
            email: patient.email || '', phone_number: patient.phone || '',
            date_of_birth: patient.dob ? patient.dob.slice(0, 10) : '',
            gender_at_birth: normalizeGender(patient.gender),
        });
        setShipping(previous => ({ ...previous, address_line_1: patient.address || '', postal_code: patient.postal_code || '' }));
        setOpen(true);
        setError('');
        setOrderingConfig(null);
        try {
            const { data } = await axios.get('/api/v1/terra/ordering/config', authHeaders);
            setOrderingConfig(data);
        } catch {
            setError('Could not check lab ordering availability. Please reopen this form to try again.');
            return;
        }
        if (!productTypes) {
            setLoadingTypes(true);
            try {
                const res = await axios.get('/api/v1/terra/products', authHeaders);
                const types: TerraProductType[] = res.data;
                setProductTypes(types);

                // Probe every category's real product count up front, using
                // only the existing GET /terra/products/:id endpoint — no
                // invented categories/products, just checking what Terra
                // actually has right now.
                const counts: Record<string, number> = {};
                await Promise.all(types.map(async (t) => {
                    try {
                        const productsRes = await axios.get(`/api/v1/terra/products/${t.id}`, authHeaders);
                        counts[String(t.id)] = Array.isArray(productsRes.data) ? productsRes.data.length : 0;
                    } catch {
                        counts[String(t.id)] = 0;
                    }
                }));
                setCategoryProductCounts(counts);
            } catch {
                setError('Could not load Terra test categories.');
            } finally {
                setLoadingTypes(false);
            }
        }
    }

    async function handleTypeChange(typeId: string) {
        const request = ++productRequest.current;
        setSelectedTypeId(typeId);
        resetCascadeFromType();
        setError('');
        if (!typeId) { setLoadingProducts(false); return; }
        setLoadingProducts(true);
        setError('');
        try {
            const res = await axios.get(`/api/v1/terra/products/${typeId}`, authHeaders);
            if (request !== productRequest.current) return;
            setProducts(res.data);
        } catch {
            if (request !== productRequest.current) return;
            setError('Could not load products for this category.');
        } finally {
            if (request === productRequest.current) setLoadingProducts(false);
        }
    }

    async function handleProductChange(productId: string) {
        const request = ++variantRequest.current;
        setSelectedProductId(productId);
        resetCascadeFromProduct();
        setError('');
        if (!productId) { setLoadingVariants(false); return; }
        setLoadingVariants(true);
        setError('');
        try {
            // The US Essential option explicitly offers the same actual panels
            // as Advanced. Keep Terra's variant IDs/names; never submit a UK kit
            // with a fabricated destination or present the panels as equivalent.
            const useAdvancedUsPanels = productId === '10001';
            if (useAdvancedUsPanels && !usAlternative) {
                setError('US blood panels could not be loaded. Please reopen the form to refresh the catalogue.');
                return;
            }
            const catalogueProductId = useAdvancedUsPanels ? String(usAlternative!.id) : productId;
            const res = await axios.get(`/api/v1/terra/products/${catalogueProductId}/variants`, authHeaders);
            if (request !== variantRequest.current) return;
            const catalogueVariants: TerraVariant[] = Array.isArray(res.data) ? res.data : [];
            const available = useAdvancedUsPanels
                ? catalogueVariants.filter(variant => variant.supported_ship_to_countries?.includes('US'))
                : catalogueVariants;
            setVariants(available);
            if (!available.length) setError('No tests are currently available for this product.');
        } catch {
            if (request !== variantRequest.current) return;
            setError('Could not load this product. Please select it again.');
        } finally {
            if (request === variantRequest.current) setLoadingVariants(false);
        }
    }

    function updateRecipient(field: keyof typeof recipient, value: string) {
        setRecipient(r => ({ ...r, [field]: value }));
        if (field === 'phone_number') {
            setError('');
        }
    }
    function updateShipping(field: keyof typeof shipping, value: string) {
        setShipping(s => ({ ...s, [field]: value }));
    }

    const emailValidation = useEmailValidation(recipient.email);

    const needsShipping = collectionType === 'AT_HOME';

    function validate(): string | null {
        if (!selectedTypeId) return 'Please select a test category.';
        if (!selectedProductId) return 'Please select a product.';
        if (!selectedVariantId || loadingVariants) return 'Please select a test variant.';
        if (!collectionType) return 'Please select a collection type.';
        if (selectedVariant && !selectedVariant.available_collection_types.includes(collectionType)) {
            return 'The selected collection type is not supported by this product.';
        }
        if (!recipient.first_name.trim() || !recipient.last_name.trim()) return 'Patient first and last name are required.';
        const emailError = validateEmail(recipient.email);
        if (emailError) return emailError;
        const phoneError = validateUsLabPhone(recipient.phone_number);
        if (phoneError) return phoneError;
        if (!recipient.date_of_birth) return 'Patient date of birth is required.';
        const dob = new Date(recipient.date_of_birth);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(recipient.date_of_birth) || !Number.isFinite(dob.getTime()) || dob.toISOString().slice(0, 10) !== recipient.date_of_birth) return 'Please enter a valid date of birth.';
        if (dob > new Date()) return 'Date of birth cannot be in the future.';
        if (!recipient.gender_at_birth) return 'Please select gender at birth.';
        if (needsShipping) {
            if (!shipping.address_line_1.trim()) return 'Shipping address line 1 is required.';
            if (!shipping.city.trim()) return 'Shipping city is required.';
            if (!shipping.administrative_area.trim()) return 'Shipping state / administrative area is required.';
            if (!shipping.postal_code.trim()) return 'Shipping postal code is required.';
            if (shippingCountry === 'US' && !US_STATES.includes(shipping.administrative_area.toUpperCase())) return 'Choose a valid US shipping state.';
            if (shippingCountry === 'US' && !/^\d{5}(-\d{4})?$/.test(shipping.postal_code.trim())) return 'Enter a valid US ZIP code: 5 digits or ZIP+4.';
        }
        if (!consentAccepted) return 'Please confirm patient consent before placing the order.';
        return null;
    }

    async function handleSubmit() {
        if (submitting) return;
        if (!orderingConfig?.orderingEnabled) return;
        setAttemptedSubmit(true);
        if (!emailValidation.check()) return;
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        setSubmitting(true);
        try {
            const patientId = patient.id || (createPatient && await createPatient({
                first_name: recipient.first_name.trim(), last_name: recipient.last_name.trim(),
                email: normalizeEmail(recipient.email), phone: normalizedPhone!,
                dob: recipient.date_of_birth,
                gender: recipient.gender_at_birth === 'male' ? 'Male' : 'Female',
                ...(needsShipping ? { address: shipping.address_line_1.trim(), postal_code: shipping.postal_code.trim() } : {}),
            }, selectedVariant!.variant_name));
            if (!patientId) throw new Error('Save the patient before placing a lab order.');
            await axios.post('/api/v1/terra/orders', {
                patient_id: patientId,
                variant_id: selectedVariantId,
                quantity: 1,
                collection_type: collectionType,
                recipient: { ...recipient, email: normalizeEmail(recipient.email), phone_number: normalizedPhone! },
                ...(needsShipping ? { shipping_address: { ...shipping, country_code: shippingCountry } } : {}),
            }, authHeaders);
            setOpen(false);
            onOrderCreated();
        } catch (err: any) {
            // Terra's error body carries useful, non-sensitive guidance for
            // clinic staff — field-level validation messages (invalid_fields,
            // e.g. "phone must be E.164") on 400s, or a supplier-level
            // "detail" string (e.g. "error creating order with supplier X")
            // on 500s. Neither contains Terra internal ids/URLs, so both are
            // safe to surface instead of a generic message. The backend
            // already retries a bare transient 5xx once itself — if it still
            // failed here, it flags `transient: true` on the response.
            const data = err.response?.data;
            const terraBody = data?.terra;
            const invalidFields = terraBody?.invalid_fields;
            const fieldDetail = Array.isArray(invalidFields) && invalidFields.length
                ? invalidFields.map((f: any) => f.message).filter(Boolean).join(' ')
                : null;
            // Terra's own detail/message/error — real error metadata Terra
            // sent, never a fabricated string, never an internal id/URL/key.
            const terraDetail = [terraBody?.detail, terraBody?.message, terraBody?.error, terraBody?.title]
                .find((v: unknown) => typeof v === 'string' && v.trim().length > 0) || null;

            if (data?.code === 'TERRA_SHIPPING_COUNTRY_UNSUPPORTED') {
                setCountryRejected(true);
                setError(data.message);
            } else if (data?.transient && !fieldDetail) {
                setError('Terra could not create this order with its lab supplier. Check the shipping details and try again. The selected test has been kept.');
            } else {
                const baseMsg = data?.message;
                setError(
                    fieldDetail
                    || terraDetail
                    || (typeof baseMsg === 'string' ? baseMsg : !axios.isAxiosError(err) && err instanceof Error ? err.message : 'Terra rejected the order. Please check the details and try again.')
                );
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Button
                type="button"
                disabled={disabled}
                size="sm"
                variant="outline"
                className="gap-2 bg-white border-[#ded8c4] text-[#080e1e] font-bold text-xs rounded-full h-9 px-4 shadow-xs"
                onClick={openModal}
            >
                <FlaskConical className="w-4 h-4 text-[#8c7657]" /> Order Lab Test
            </Button>

            <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) setOpen(nextOpen); }}>
                <DialogContent showCloseButton={!submitting} className="bg-white border-[#e4dec3] rounded-3xl sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[#080e1e] font-bold">Order Lab Test</DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            Place a Terra Vantage lab test order for {patient.first_name} {patient.last_name}.
                            {createPatient && ' Confirming the order also saves the patient.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {orderingConfig?.environment === 'SANDBOX' && (
                            <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                Sandbox test order. Any results are simulated, not clinical results, and are shown separately from production data.
                            </p>
                        )}
                        {orderingConfig && !orderingConfig.orderingEnabled && (
                            <p role="alert" className="text-xs text-rose-700">Live lab ordering requires Terra production access.</p>
                        )}
                        {error && (
                            <div ref={errorRef} role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium space-y-3">
                                <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>
                                {countryRejected && usAlternative && (
                                    <Button type="button" className="rounded-full bg-[#080e1e] text-white hover:bg-[#121c36]" onClick={async () => {
                                        await handleProductChange(String(usAlternative.id));
                                        requestAnimationFrame(() => document.getElementById('terra-variant')?.focus());
                                    }}>
                                        Choose a US test
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Category and product selection */}
                        <div className="grid grid-cols-1 gap-3">
                            <div className="space-y-1">
                                <label className={labelClass} htmlFor="terra-category">Test Category</label>
                                <select
                                    id="terra-category"
                                    className={selectClass}
                                    value={selectedTypeId}
                                    disabled={loadingTypes}
                                    onChange={(e) => handleTypeChange(e.target.value)}
                                >
                                    <option value="">{loadingTypes ? 'Loading categories...' : 'Select a category'}</option>
                                    {productTypes?.map(t => {
                                        const count = categoryProductCounts?.[String(t.id)];
                                        const isEmpty = count === 0;
                                        return (
                                            <option key={t.id} value={t.id} disabled={isEmpty}>
                                                {t.name}{isEmpty ? ' (No products available in Terra sandbox)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {selectedTypeId && categoryProductCounts?.[selectedTypeId] === 0 && (
                                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
                                    No orderable products are currently available for this category in Terra sandbox.
                                </div>
                            )}

                            {selectedTypeId && categoryProductCounts?.[selectedTypeId] !== 0 && (
                                <div className="space-y-1">
                                    <label className={labelClass} htmlFor="terra-product">Product</label>
                                    <select
                                        id="terra-product"
                                        aria-describedby={selectedProductId === '10001' ? 'terra-essential-us-panel' : undefined}
                                        className={selectClass}
                                        value={selectedProductId}
                                        disabled={loadingProducts}
                                        onChange={(e) => handleProductChange(e.target.value)}
                                    >
                                        <option value="">{loadingProducts ? 'Loading products...' : 'Select a product'}</option>
                                        {products?.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedProductId && (
                                <div className="space-y-1">
                                    <label className={labelClass} htmlFor="terra-variant">Variant</label>
                                    <select id="terra-variant" className={selectClass} value={selectedVariantId}
                                        disabled={loadingVariants} onChange={e => {
                                            setError(''); setCountryRejected(false); setSelectedVariantId(e.target.value);
                                            setCollectionType(''); setConsentAccepted(false);
                                        }}>
                                        <option value="">{loadingVariants ? 'Loading variants...' : 'Select a variant'}</option>
                                        {variants?.map(v => <option key={v.id} value={v.id}>{v.variant_name}</option>)}
                                    </select>
                                    {selectedProductId === '10001' && (
                                        <p id="terra-essential-us-panel" className="text-xs text-slate-600 pt-2">
                                            This US option orders an Advanced Blood Test panel. Select the actual test below; Standard and Comprehensive kits are not included.
                                        </p>
                                    )}
                                </div>
                            )}

                            {selectedVariant && (
                                <div className="space-y-1">
                                    <label className={labelClass} htmlFor="terra-collection-type">Collection Type</label>
                                    <select
                                        id="terra-collection-type"
                                        className={selectClass}
                                        value={collectionType}
                                        onChange={(e) => setCollectionType(e.target.value)}
                                    >
                                        <option value="">Select collection type</option>
                                        {selectedVariant.available_collection_types.map(ct => (
                                            <option key={ct} value={ct}>{ct === 'AT_HOME' ? 'At Home' : 'Go To Lab'}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Recipient details */}
                        {collectionType && (
                            <div className="space-y-3 pt-2 border-t border-[#e6e0ce]">
                                <h4 className="text-xs font-bold text-[#080e1e]">Patient Details</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-first-name">First Name</label>
                                        <Input id="terra-first-name" autoComplete="off" className="h-9 text-xs" value={recipient.first_name} onChange={(e) => updateRecipient('first_name', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-last-name">Last Name</label>
                                        <Input id="terra-last-name" autoComplete="off" className="h-9 text-xs" value={recipient.last_name} onChange={(e) => updateRecipient('last_name', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-email">Email</label>
                                        <EmailInput required error={emailValidation.error} id="terra-email" autoComplete="off" className="h-9 text-xs"  value={recipient.email} onChange={(e) => updateRecipient('email', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-phone">Phone Number</label>
                                        <UsPhoneInput id="terra-phone" name="lab-recipient-phone" required usOnly
                                            submitted={attemptedSubmit} autoComplete="tel-national" placeholder="(202) 555-0123"
                                            className="h-9 text-xs" value={recipient.phone_number}
                                            onChange={e => updateRecipient('phone_number', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-dob">Date of Birth</label>
                                        <Input id="terra-dob" autoComplete="off" className="h-9 text-xs" type="date" value={recipient.date_of_birth} onChange={(e) => updateRecipient('date_of_birth', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-gender">Gender at Birth</label>
                                        <select
                                            id="terra-gender"
                                            autoComplete="off"
                                            className={selectClass + " h-9"}
                                            value={recipient.gender_at_birth}
                                            onChange={(e) => updateRecipient('gender_at_birth', e.target.value)}
                                        >
                                            <option value="">Select</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Shipping details, AT_HOME only */}
                        {needsShipping && selectedVariant && (
                            <div className="space-y-3 pt-2 border-t border-[#e6e0ce]">
                                <h4 className="text-xs font-bold text-[#080e1e]">Shipping Address (United States)</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1 col-span-2">
                                        <label className={labelClass} htmlFor="terra-address1">Address Line 1</label>
                                        <Input id="terra-address1" autoComplete="off" className="h-9 text-xs" value={shipping.address_line_1} onChange={(e) => updateShipping('address_line_1', e.target.value)} />
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className={labelClass} htmlFor="terra-address2">Mailing Address (optional)</label>
                                        <Input id="terra-address2" autoComplete="off" className="h-9 text-xs" value={shipping.address_line_2} onChange={(e) => updateShipping('address_line_2', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-city">City</label>
                                        <Input id="terra-city" autoComplete="off" className="h-9 text-xs" value={shipping.city} onChange={(e) => updateShipping('city', e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelClass} htmlFor="terra-state">State / Region</label>
                                        <select id="terra-state" className={selectClass + " h-9"} value={shipping.administrative_area} onChange={e => updateShipping('administrative_area', e.target.value)}>
                                            <option value="">Select US state</option>
                                            {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className={labelClass} htmlFor="terra-postal">ZIP Code</label>
                                        <Input id="terra-postal" autoComplete="off" className="h-9 text-xs" value={shipping.postal_code} onChange={(e) => updateShipping('postal_code', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {collectionType && (
                            <label className="flex items-start gap-2.5 pt-2 border-t border-[#e6e0ce] cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 w-3.5 h-3.5 accent-[#080e1e]"
                                    checked={consentAccepted}
                                    onChange={(e) => setConsentAccepted(e.target.checked)}
                                />
                                <span className="text-[11px] text-slate-600 leading-relaxed">
                                    I confirm the patient has consented to this lab test and to their information
                                    being shared with Terra Vantage for order fulfillment and result delivery.
                                </span>
                            </label>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" disabled={submitting} variant="outline" className="rounded-full text-xs font-bold border-[#ded8c4]" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            type="button"
                            disabled={submitting || !orderingConfig?.orderingEnabled || !collectionType || !consentAccepted}
                            className="bg-[#080e1e] hover:bg-[#121c36] text-[#f7f3e8] font-bold text-xs rounded-full gap-2"
                            onClick={handleSubmit}
                        >
                            {submitting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Placing Order...</>) : orderingConfig?.environment === 'SANDBOX' ? 'Place Sandbox Order' : 'Place Order'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

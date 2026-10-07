'use client';

import { useState } from 'react';

export function useFormValidation(value: unknown, validate: (value: unknown) => Record<string, string>, prefix = '') {
    const [submitted, setSubmitted] = useState(false);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const errors = validate(value);
    const errorFor = (field: string) => submitted || touched[field] ? errors[field] || '' : '';
    return {
        submitted, errorFor,
        propsFor: (field: string) => ({
            'aria-invalid': !!errorFor(field),
            'aria-describedby': errorFor(field) ? `${prefix}${field}-error` : undefined,
            onBlur: () => setTouched(previous => ({ ...previous, [field]: true })),
        }),
        check: (candidate: unknown = value, validateCandidate = validate) => {
            setSubmitted(true);
            const nextErrors = validateCandidate(candidate);
            const firstField = Object.keys(nextErrors)[0];
            if (firstField) {
                const field = document.getElementById(`${prefix}${firstField}`);
                field?.focus();
                field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            return !firstField;
        },
        reset: () => { setSubmitted(false); setTouched({}); },
    };
}

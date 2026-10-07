'use client';

import { useId, useState, type ComponentProps } from 'react';
import { Input } from './input';
import { validateEmail } from '@/lib/email-validation';

type Props = Omit<ComponentProps<typeof Input>, 'type'> & {
    value: string;
    error?: string;
    validationContext?: 'login';
};

/** Keeps the raw input intact; forms normalize only the submitted payload. */
export function EmailInput({ value, required = false, error, validationContext, onChange, onBlur, id, ...props }: Props) {
    const generatedId = useId();
    const [touched, setTouched] = useState(false);
    const inputId = id || generatedId;
    const message = error || (touched ? validateEmail(value, { required, context: validationContext }) : '');
    const errorId = `${inputId}-error`;
    return <>
        <Input {...props} id={inputId} type="text" inputMode="email" autoComplete={props.autoComplete ?? 'email'}
            autoCapitalize="none" spellCheck={false} value={value} aria-required={required}
            aria-invalid={!!message} aria-describedby={[props['aria-describedby'], message ? errorId : ''].filter(Boolean).join(' ') || undefined}
            onChange={event => { setTouched(true); onChange?.(event); }}
            onBlur={event => { setTouched(true); onBlur?.(event); }} />
        {message && <p id={errorId} role="alert" className="text-xs leading-relaxed text-rose-700">{message}</p>}
    </>;
}

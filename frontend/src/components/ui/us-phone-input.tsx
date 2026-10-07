'use client';

import { useId, useState, type ComponentProps } from 'react';
import { validateUsPhone, validateUsLabPhone } from '@frigo-flow/validation';
import { Input } from './input';

type Props = Omit<ComponentProps<typeof Input>, 'type'> & { value: string; submitted?: boolean; usOnly?: boolean };

export function UsPhoneInput({ value, required = false, submitted = false, usOnly = false, id, onChange, onBlur, ...props }: Props) {
    const generatedId = useId();
    const [touched, setTouched] = useState(false);
    const inputId = id || generatedId;
    const message = touched || submitted ? usOnly ? (!required && !value.trim() ? '' : validateUsLabPhone(value)) : validateUsPhone(value, { required }) : '';
    const errorId = `${inputId}-error`;
    return <>
        <Input {...props} id={inputId} type="tel" inputMode="tel" autoComplete={props.autoComplete ?? 'tel'}
            value={value} maxLength={40} aria-required={required} aria-invalid={!!message}
            aria-describedby={[props['aria-describedby'], message ? errorId : ''].filter(Boolean).join(' ') || undefined}
            onChange={event => { setTouched(true); onChange?.(event); }}
            onBlur={event => { setTouched(true); onBlur?.(event); }} />
        {message && <p id={errorId} role="alert" className="text-xs leading-relaxed text-rose-700">{message}</p>}
    </>;
}

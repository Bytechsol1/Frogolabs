'use client';

import { useState } from 'react';
import { validateEmail } from './email-validation';

export function useEmailValidation(value: string, required = true, context?: 'login') {
    const [submitted, setSubmitted] = useState(false);
    return {
        error: submitted ? validateEmail(value, { required, context }) : '',
        check: () => { setSubmitted(true); return !validateEmail(value, { required, context }); },
        reset: () => setSubmitted(false),
    };
}

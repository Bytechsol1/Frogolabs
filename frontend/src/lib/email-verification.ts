import { normalizeEmail, validateEmail } from './email-validation';

export const EMAIL_VERIFICATION_KEY = 'frigo-email-verification';

// Only routing context and the resend deadline are persisted, never an OTP/password.
export function prepareEmailVerification(email: string, sent = false, resendAfter = 0) {
    const error = validateEmail(email);
    if (error) throw new Error(error);
    const state = { email: normalizeEmail(email), sent, resendAt: Date.now() + resendAfter * 1000 };
    try { sessionStorage.setItem(EMAIL_VERIFICATION_KEY, JSON.stringify(state)); } catch { /* The page also accepts an email manually. */ }
    return state;
}

export function maskEmail(email: string) {
    const at = email.lastIndexOf('@');
    return at > 0 ? `${email[0]}***${email.slice(at)}` : '';
}

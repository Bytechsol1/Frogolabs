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

// Completion only controls the screen. Server authentication is still required.
// Keep it through a session-loading failure so a consumed OTP is never requested again.
export function completeEmailVerification(email: string) {
    const state = { ...prepareEmailVerification(email), verified: true };
    try { sessionStorage.setItem(EMAIL_VERIFICATION_KEY, JSON.stringify(state)); } catch { }
    return state;
}

export function clearEmailVerification(email: string) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(EMAIL_VERIFICATION_KEY) || 'null');
        if (typeof saved?.email === 'string' && normalizeEmail(saved.email) === normalizeEmail(email)) {
            sessionStorage.removeItem(EMAIL_VERIFICATION_KEY);
        }
    } catch { /* Storage is optional; it never grants access. */ }
}

export function maskEmail(email: string) {
    const at = email.lastIndexOf('@');
    return at > 0 ? `${email[0]}***${email.slice(at)}` : '';
}

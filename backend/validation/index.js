// Shared validation for browser forms and API payloads, with syntax-only mail transport validation.
const { z } = require('zod');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const EMAIL_INVALID = 'Please enter a valid email address';
const EMAIL_REQUIRED = EMAIL_INVALID;
const normalizeEmail = value => value.trim().toLowerCase();
// All entry points validate mailbox syntax without restricting the provider.
const mailboxEmailSchema = z.string({ error: EMAIL_INVALID })
    .trim().min(1, EMAIL_REQUIRED).max(254, EMAIL_INVALID)
    .email(EMAIL_INVALID).transform(normalizeEmail);
const emailSchema = mailboxEmailSchema;
const loginEmailSchema = mailboxEmailSchema;
// Missing optional values stay missing on updates; clearing an email stores null.
const optionalEmailSchema = z.preprocess(
    value => typeof value === 'string' && !value.trim() ? null : value,
    emailSchema.nullable().optional(),
);

function validateEmail(value, options = {}) {
    if (options.required !== false && (value == null || value === '')) return EMAIL_REQUIRED;
    const schema = options.context === 'login' ? loginEmailSchema : options.required === false ? optionalEmailSchema : emailSchema;
    const result = schema.safeParse(value);
    return result.success ? '' : result.error.issues[0].message;
}

const PHONE_INVALID = 'Enter a valid +1 phone number, such as +1 202 555 0123.';
const usPhoneSchema = z.string({ error: PHONE_INVALID }).trim().min(1, 'Phone number is required').max(40, PHONE_INVALID)
    .transform((value, context) => {
        const international = value.replace(/^00/, '+');
        const phone = /^[+\d\s().-]+$/.test(international)
            ? parsePhoneNumberFromString(international, { defaultCountry: 'US', extract: false }) : undefined;
        if (!phone || phone.countryCallingCode !== '1' || phone.ext || !phone.isValid()) {
            context.addIssue({ code: 'custom', message: PHONE_INVALID });
            return z.NEVER;
        }
        return phone.number;
    });
const optionalUsPhoneSchema = z.preprocess(
    value => typeof value === 'string' && !value.trim() ? null : value,
    usPhoneSchema.nullable().optional(),
);
const usLabPhoneSchema = z.unknown().transform((value, context) => {
    const parsed = usPhoneSchema.safeParse(value);
    if (!parsed.success || parsePhoneNumberFromString(parsed.data)?.country !== 'US') {
        context.addIssue({ code: 'custom', message: typeof value === 'string' && !value.trim() ? 'Phone number is required' : 'Enter a valid US phone number' });
        return z.NEVER;
    }
    return parsed.data;
});
function validateUsLabPhone(value) {
    const result = usLabPhoneSchema.safeParse(value);
    return result.success ? '' : result.error.issues[0].message;
}
function validateUsPhone(value, options = {}) {
    const result = (options.required ? usPhoneSchema : optionalUsPhoneSchema).safeParse(value);
    return result.success ? '' : result.error.issues[0].message;
}

const requiredText = message => z.string({ error: message }).trim().min(1, message);
const patientRequiredSchema = z.object({
    first_name: requiredText('First name is required'), last_name: requiredText('Last name is required'),
    address: requiredText('Address is required'), postal_code: requiredText('Postal code is required'),
});
const patientDobSchema = z.union([z.string(), z.date()], { error: 'Enter a valid date of birth' }).nullable().optional()
    .transform((value, context) => {
        if (value === undefined) return undefined;
        if (value === null || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        const datePart = typeof value === 'string' ? value.slice(0, 10) : '';
        if (!Number.isFinite(date.getTime()) || (typeof value === 'string' &&
            (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) || date.toISOString().slice(0, 10) !== datePart))) {
            context.addIssue({ code: 'custom', message: 'Enter a valid date of birth' }); return z.NEVER;
        }
        const today = new Date(); today.setHours(23, 59, 59, 999);
        if (date > today) { context.addIssue({ code: 'custom', message: 'Date of birth cannot be in the future' }); return z.NEVER; }
        return date;
    });
const patientGenderSchema = z.preprocess(value => value === '' ? null : value,
    z.enum(['Male', 'Female', 'Other'], { error: 'Select a valid gender' }).nullable().optional());
const patientDetailsSchema = patientRequiredSchema.extend({
    email: optionalEmailSchema, phone: optionalUsPhoneSchema, secondary_phone: optionalUsPhoneSchema,
    dob: patientDobSchema, gender: patientGenderSchema,
});
const patientOrderDetailsSchema = patientDetailsSchema.extend({ email: emailSchema, phone: usPhoneSchema });
const profileNameSchema = requiredText('Full name is required').max(160, 'Full name must be at most 160 characters');
const profileFormSchema = z.object({ name: profileNameSchema, email: emailSchema });
function fieldErrors(schema, value) {
    const result = schema.safeParse(value);
    const errors = {};
    if (!result.success) for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field && !errors[field]) errors[field] = issue.message;
    }
    return errors;
}
const patientFieldErrors = value => fieldErrors(patientDetailsSchema, value);
const patientOrderFieldErrors = value => fieldErrors(patientOrderDetailsSchema, value);
const profileFieldErrors = value => fieldErrors(profileFormSchema, value);

module.exports = { emailSchema, loginEmailSchema, mailboxEmailSchema, optionalEmailSchema, normalizeEmail, validateEmail, EMAIL_REQUIRED, EMAIL_INVALID,
    usPhoneSchema, usLabPhoneSchema, validateUsLabPhone, optionalUsPhoneSchema, validateUsPhone, patientRequiredSchema, patientDobSchema, patientGenderSchema,
    patientDetailsSchema, patientOrderDetailsSchema, profileNameSchema, profileFormSchema, patientFieldErrors, patientOrderFieldErrors, profileFieldErrors };

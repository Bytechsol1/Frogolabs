import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { emailSchema } from '../common/email-validation';
import { profileNameSchema } from '@frigo-flow/validation';
export { emailSchema } from '../common/email-validation';

export const registrationEmailSchema = emailSchema;
export const registrationPhoneSchema = z.string().trim().min(1).max(40).transform((value, context) => {
    const international = value.replace(/^00/, '+');
    const phone = /^\+[\d\s().-]+$/.test(international)
        ? parsePhoneNumberFromString(international, { extract: false }) : undefined;
    if (!phone || phone.countryCallingCode !== '1' || phone.ext || !phone.isValid()) {
        context.addIssue({ code: 'custom', message: 'Enter a valid phone number with +1 country code, such as +1 202 555 0123.' });
        return z.NEVER;
    }
    return phone.number;
});
export const registrationSchema = z.object({
    clinicName: z.string().trim().min(1).max(160),
    contactName: z.string().trim().min(1).max(160),
    email: registrationEmailSchema,
    phone: registrationPhoneSchema,
    password: z.string().min(6).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict();
export const emailOtpSchema = z.object({ email: emailSchema }).strict();
export const verifyOtpSchema = emailOtpSchema.extend({ otp: z.string().regex(/^\d{6}$/) }).strict();
export const profileSchema = z.object({
    name: profileNameSchema.optional(),
    email: emailSchema.optional(),
}).strict();
export type RegisterDto = z.infer<typeof registrationSchema>;
export type EmailOtpDto = z.infer<typeof emailOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

@Injectable()
export class AuthDtoPipe implements PipeTransform {
    constructor(private readonly schema: z.ZodType) { }
    transform(value: unknown) {
        const parsed = this.schema.safeParse(value);
        if (!parsed.success) {
            const field = parsed.error.issues[0]?.path[0];
            const message = field === 'otp' ? 'Enter the 6-digit verification code.'
                : field === 'email' ? parsed.error.issues[0].message
                : field === 'phone' ? 'Enter a valid phone number with +1 country code, such as +1 202 555 0123.'
                : field === 'password' ? 'Use a password with at least 6 characters and at most 72 bytes.'
                : 'Check the registration details and try again.';
            throw new BadRequestException(message);
        }
        return parsed.data;
    }
}

import { BadRequestException } from '@nestjs/common';
import { emailSchema, loginEmailSchema, mailboxEmailSchema, optionalEmailSchema, validateEmail } from '@frigo-flow/validation';

export { emailSchema, optionalEmailSchema } from '@frigo-flow/validation';

export function requireLoginEmail(value: unknown): string {
    const result = loginEmailSchema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.issues[0].message);
    return result.data;
}

// Stored delivery addresses and configured senders are not user-entry fields.
export function requireMailboxEmail(value: unknown): string {
    const result = mailboxEmailSchema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.issues[0].message);
    return result.data;
}

export function requireEmail(value: unknown): string {
    const result = emailSchema.safeParse(value);
    if (!result.success) throw new BadRequestException(validateEmail(value));
    return result.data;
}

export function optionalEmail(value: unknown): string | null | undefined {
    const result = optionalEmailSchema.safeParse(value);
    if (!result.success) throw new BadRequestException(validateEmail(value, { required: false }));
    return result.data;
}

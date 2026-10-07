import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { optionalEmailSchema } from './email-validation';
import { optionalUsPhoneSchema, patientRequiredSchema, patientDobSchema, patientGenderSchema } from '@frigo-flow/validation';

// Flat API records only: Prisma's nested write/set operators are not API input.
const nullableText = z.string().nullable().optional();
export const clinicCreateSchema = z.object({
    name: z.string().trim().min(1), contact_name: z.string().trim().min(1),
    email: optionalEmailSchema, phone: nullableText, status: z.enum(['Active', 'Inactive']).optional(),
}).strict();
export const clinicUpdateSchema = clinicCreateSchema.partial();
const patientFields = {
    ...patientRequiredSchema.shape,
    email: optionalEmailSchema, phone: optionalUsPhoneSchema, secondary_phone: optionalUsPhoneSchema,
    dob: patientDobSchema, gender: patientGenderSchema,
    age: z.union([z.number().int(), z.string()]).nullable().optional()
        .transform(value => value == null || value === '' ? null : Number(value))
        .refine(value => value == null || (Number.isInteger(value) && value >= 0), 'Enter a valid age'),
};
export const patientCreateSchema = z.object({
    ...patientFields, test_type: z.string().optional(), terra_variant_id: z.string().optional(),
    date_of_birth: patientDobSchema,
}).strict();
export const patientUpdateSchema = z.object(patientFields).partial().strict();

export function parseRecord<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        const contactIssue = parsed.error.issues.find(issue => ['email', 'phone', 'secondary_phone'].includes(String(issue.path[0])));
        const prefix = contactIssue?.path[0] === 'secondary_phone' ? 'Secondary phone: ' : '';
        throw new BadRequestException(contactIssue ? prefix + contactIssue.message : parsed.error.issues[0]?.message || 'Check the form details and try again.');
    }
    return parsed.data;
}

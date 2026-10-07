import { BadRequestException } from '@nestjs/common';
import type { CreateTerraOrderInput } from './terra.service';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { requireMailboxEmail } from '../common/email-validation';

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

// Validate locally so invalid shipping details never become an opaque supplier 500.
export function normalizeTerraOrder(input: CreateTerraOrderInput): CreateTerraOrderInput {
    const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const fail = (message: string): never => { throw new BadRequestException(message); };
    if (!['AT_HOME', 'GO_TO_LAB'].includes(input.collection_type)) fail('Select a supported collection type.');
    if (input.quantity !== undefined && input.quantity !== 1) fail('Order one test at a time for this patient.');
    const recipient = {
        first_name: clean(input.recipient?.first_name), last_name: clean(input.recipient?.last_name),
        email: requireMailboxEmail(input.recipient?.email), phone_number: clean(input.recipient?.phone_number).replace(/^00/, '+'),
        date_of_birth: clean(input.recipient?.date_of_birth), gender_at_birth: input.recipient?.gender_at_birth,
    };
    if (!recipient.first_name || !recipient.last_name) fail('Patient first and last name are required.');
    // Phone country is independent of shipping destination; the UI supplies E.164.
    const phone = parsePhoneNumberFromString(recipient.phone_number, { extract: false });
    // Accept international-format numbers without a separate country-length
    // restriction; preserve the patient's digits for supplier validation.
    if (!phone || phone.ext || !/^\+[1-9]\d{1,14}$/.test(phone.number)) {
        fail('Enter a phone number with its country code, using at most 15 digits and no extension.');
    }
    recipient.phone_number = phone!.number;
    const dob = new Date(recipient.date_of_birth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recipient.date_of_birth) || !Number.isFinite(dob.getTime()) || dob.toISOString().slice(0, 10) !== recipient.date_of_birth) fail('Enter a valid date of birth.');
    if (dob > new Date()) fail('Date of birth cannot be in the future.');
    if (!['male', 'female'].includes(recipient.gender_at_birth)) fail('Select gender at birth.');
    let shipping: CreateTerraOrderInput['shipping_address'];
    if (input.collection_type === 'AT_HOME') {
        shipping = {
            address_line_1: clean(input.shipping_address?.address_line_1),
            ...(clean(input.shipping_address?.address_line_2) ? { address_line_2: clean(input.shipping_address?.address_line_2) } : {}),
            city: clean(input.shipping_address?.city), administrative_area: clean(input.shipping_address?.administrative_area),
            postal_code: clean(input.shipping_address?.postal_code), country_code: clean(input.shipping_address?.country_code).toUpperCase(),
        };
        if (!shipping.address_line_1 || !shipping.city || !shipping.administrative_area || !shipping.postal_code || !shipping.country_code) fail('Complete the shipping address, city, state, postal code and country.');
        if (shipping.country_code === 'US') {
            shipping.administrative_area = shipping.administrative_area.toUpperCase();
            if (!US_STATES.has(shipping.administrative_area)) fail('This test ships to the US. Choose a valid US state, such as NY or CA.');
            if (!/^\d{5}(-\d{4})?$/.test(shipping.postal_code)) fail('Enter a valid US ZIP code: 5 digits or ZIP+4.');
        }
    }
    return { ...input, variant_id: clean(input.variant_id), quantity: 1, recipient, shipping_address: shipping };
}

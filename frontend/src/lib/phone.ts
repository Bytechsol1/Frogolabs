import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export function parsePatientPhone(value: string, country?: CountryCode) {
    return parsePhoneNumberFromString(value.trim().replace(/^00/, '+'), {
        defaultCountry: country,
        extract: false,
    });
}

export function normalizePatientPhone(value: string, country?: CountryCode): string | null {
    const phone = parsePatientPhone(value, country);
    // Normalize international format without imposing country-specific length
    // rules. Terra's supplier remains responsible for recipient validation.
    if (!phone || phone.ext || !/^\+[1-9]\d{1,14}$/.test(phone.number)) return null;
    return phone.number;
}

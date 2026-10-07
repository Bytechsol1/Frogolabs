import { normalizeTerraOrder } from './order-validation';
import { isApprovedTerraProduct } from './approved-products';
import type { CreateTerraOrderInput } from './terra.service';

describe('Terra order validation', () => {
    const order = (): CreateTerraOrderInput => ({ patient_id: 'patient', variant_id: '100101', collection_type: 'AT_HOME',
        recipient: { first_name: 'Demo', last_name: 'Patient', email: 'sandbox@example.com', phone_number: '+44 7911 123456', date_of_birth: '1990-01-01', gender_at_birth: 'male' },
        shipping_address: { address_line_1: '123 Main Street', city: 'New York', administrative_area: 'ny', postal_code: '10001', country_code: 'us' } });

    it('normalizes formatting while preserving a valid international phone for US delivery', () => {
        const normalized = normalizeTerraOrder(order());
        expect(normalized.recipient.phone_number).toBe('+447911123456');
        expect(normalized.shipping_address).toMatchObject({ administrative_area: 'NY', country_code: 'US' });
    });
    it('rejects a phone without its country code', () => {
        const input = order(); input.recipient.phone_number = '1122334455';
        expect(() => normalizeTerraOrder(input)).toThrow('country code');
    });
    it.each([
        ['+92 300 1234567', '+923001234567'],
        ['0092 300 1234567', '+923001234567'],
        ['+1 (521) 555-0101', '+15215550101'],
        ['+1 (555) 555-555', '+1555555555'],
        ['+91 98765 43210', '+919876543210'],
        ['+971 50 123 4567', '+971501234567'],
        ['+65 8123 4567', '+6581234567'],
        ['+39 02 36618 300', '+390236618300'],
    ])('normalizes %s independently of the US shipping destination', (value, expected) => {
        const input = order(); input.recipient.phone_number = value;
        expect(normalizeTerraOrder(input).recipient.phone_number).toBe(expected);
    });
    it.each(['+999123456789', '+92', '+923001234567 ext. 12', 'call +923001234567', '+1234567890123456'])('rejects malformed or unsupported phone input %s', value => {
        const input = order(); input.recipient.phone_number = value;
        expect(() => normalizeTerraOrder(input)).toThrow('phone number');
    });
    it('rejects non-US regions and malformed ZIP codes for US delivery', () => {
        const input = order(); input.shipping_address!.administrative_area = 'Punjab';
        expect(() => normalizeTerraOrder(input)).toThrow('US state');
        input.shipping_address!.administrative_area = 'NY'; input.shipping_address!.postal_code = 'ABC';
        expect(() => normalizeTerraOrder(input)).toThrow('ZIP');
    });
    it('rejects incomplete recipient details and invalid calendar dates', () => {
        const input = order(); input.recipient.email = 'not-an-email';
        expect(() => normalizeTerraOrder(input)).toThrow('email');
        input.recipient.email = 'sandbox@example.com'; input.recipient.date_of_birth = '2000-02-30';
        expect(() => normalizeTerraOrder(input)).toThrow('date of birth');
    });
    it('offers Essential and Advanced Blood Tests and excludes other products', () => {
        expect(isApprovedTerraProduct({ name: ' Essential Blood Test ' })).toBe(true);
        expect(isApprovedTerraProduct({ id: 10001, name: 'Renamed essential' })).toBe(true);
        expect(isApprovedTerraProduct({ id: 10002, name: 'Advanced Blood Panel' })).toBe(true);
        expect(isApprovedTerraProduct({ id: 10003, name: 'Energy & Iron Panel' })).toBe(false);
        expect(isApprovedTerraProduct({ name: 'Allergy Panel' })).toBe(false);
    });

    describe('patient date of birth', () => {
        beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-30T12:00:00Z')); });
        afterEach(() => jest.useRealTimers());

        it.each(['2026-09-30', '2020-01-01', '2008-10-01', '2008-09-30', '1990-01-01'])('accepts valid birth date %s unchanged, including patients under 18', date => {
            const input = order(); input.recipient.date_of_birth = date;
            expect(normalizeTerraOrder(input).recipient.date_of_birth).toBe(date);
        });

        it('still rejects future birth dates', () => {
            const input = order(); input.recipient.date_of_birth = '2026-10-01';
            expect(() => normalizeTerraOrder(input)).toThrow('cannot be in the future');
        });
    });
});

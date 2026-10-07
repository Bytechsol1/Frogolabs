import { isUnsupportedUsDelivery } from './order-country-error';

describe('Terra US delivery rejection', () => {
    it('recognizes the field error shown by Terra for the Essential kit', () => {
        expect(isUnsupportedUsDelivery({ invalid_fields: [{ field: 'shipping_address.country_code', message: 'must be one of: GB' }] }, 'US')).toBe(true);
    });
    it('recognizes the supplier country error', () => {
        expect(isUnsupportedUsDelivery({ detail: 'This test is not available in the provided country. Supported country codes: GB.' }, 'US')).toBe(true);
    });
    it('does not replace unrelated validation errors or errors for other destinations', () => {
        expect(isUnsupportedUsDelivery({ invalid_fields: [{ message: 'must be one of: male, female' }] }, 'US')).toBe(false);
        expect(isUnsupportedUsDelivery({ detail: 'must be one of: GB' }, 'GB')).toBe(false);
        expect(isUnsupportedUsDelivery({ detail: 'Supported country codes: GB, US.' }, 'US')).toBe(false);
        expect(isUnsupportedUsDelivery(null, 'US')).toBe(false);
    });
});

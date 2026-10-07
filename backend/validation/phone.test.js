const { test } = require('node:test');
const assert = require('node:assert/strict');
const { usLabPhoneSchema } = require('./index');
test('lab phone accepts US national input with automatic +1 and rejects non-US numbers', () => {
    for (const value of ['2025550123', '(202) 555-0123', '+12025550123']) assert.equal(usLabPhoneSchema.parse(value), '+12025550123');
    for (const value of ['', '1231231233', '202555012', '+923001234567', '+447911123456', '+14165550123', '4165550123', 'call 2025550123']) assert.equal(usLabPhoneSchema.safeParse(value).success, false, value);
});
const { usPhoneSchema, optionalUsPhoneSchema, validateUsPhone } = require('./index');

test('accepts formatted +1 numbers and normalizes national US numbers', () => {
    for (const value of ['+12025550123', '+1 (202) 555-0123', '(202) 555-0123', '2025550123', '0012025550123']) {
        assert.equal(usPhoneSchema.parse(value), '+12025550123');
        assert.equal(validateUsPhone(value), '');
    }
});
test('rejects incomplete, non-+1, text, extension and impossible numbers', () => {
    for (const value of ['123', '+1', '202555012', '+120255501234', '+923001234567', '+447911123456', 'call 2025550123', '2025550123 ext 5', '0000000000', '1111111111', 'abc', ['2025550123'], { set: '+12025550123' }]) {
        assert.equal(optionalUsPhoneSchema.safeParse(value).success, false, JSON.stringify(value));
        assert.ok(validateUsPhone(value));
    }
});
test('optional empty phones can be cleared and omitted updates stay omitted', () => {
    for (const value of ['', '   ', null]) assert.equal(optionalUsPhoneSchema.parse(value), null);
    assert.equal(optionalUsPhoneSchema.parse(undefined), undefined);
    assert.equal(usPhoneSchema.safeParse('').success, false);
});

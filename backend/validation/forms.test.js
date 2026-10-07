const { test } = require('node:test');
const assert = require('node:assert/strict');
const { patientDetailsSchema, patientFieldErrors, patientOrderDetailsSchema, patientOrderFieldErrors, profileFormSchema, profileFieldErrors } = require('./index');
const valid = { first_name: 'Jane', last_name: 'Doe', address: '123 Main St', postal_code: '10001', email: '', phone: '', secondary_phone: '', dob: '', gender: '' };
test('ordering requires primary phone and valid email even when saving a patient permits empty contacts', () => {
    assert.equal(patientDetailsSchema.safeParse(valid).success, true);
    assert.deepEqual(Object.keys(patientOrderFieldErrors(valid)), ['email', 'phone']);
    assert.ok(patientOrderFieldErrors({ ...valid, email: 'patient@gmail.com' }).phone);
    assert.ok(patientOrderFieldErrors({ ...valid, phone: '+12025550123' }).email);
    for (const phone of ['', '   ', '+923001234567', '202', '1122334455']) {
        assert.ok(patientOrderFieldErrors({ ...valid, email: 'patient@gmail.com', phone }).phone);
    }
    assert.equal(patientOrderDetailsSchema.safeParse({ ...valid, email: 'patient@gmail.com', phone: '+12025550123' }).success, true);
});
test('all required patient fields block empty and whitespace input with field errors', () => {
    assert.deepEqual(Object.keys(patientFieldErrors({})), ['first_name', 'last_name', 'address', 'postal_code']);
    for (const field of ['first_name', 'last_name', 'address', 'postal_code']) for (const value of ['', '   ', null, undefined]) {
        assert.equal(patientDetailsSchema.safeParse({ ...valid, [field]: value }).success, false);
        assert.ok(patientFieldErrors({ ...valid, [field]: value })[field]);
    }
});
test('optional contact fields and DOB remain optional; entered formats and dropdowns must be valid', () => {
    assert.equal(patientDetailsSchema.safeParse(valid).success, true);
    for (const email of ['abc', 'abc@', '@gmail.com', 'abc@gmail', 'abc..def@gmail.com', 'abc @gmail.com']) assert.ok(patientFieldErrors({ ...valid, email }).email);
    for (const email of ['test@gmail.com', 'john.doe@gmail.com', 'user+test@gmail.com', 'doctor@clinic.com', 'doctor@yahoo.com']) assert.equal(patientDetailsSchema.safeParse({ ...valid, email }).success, true);
    for (const dob of ['2025-02-29', '2026-02-31', 'not a date', '2999-01-01']) assert.ok(patientFieldErrors({ ...valid, dob }).dob);
    assert.ok(patientFieldErrors({ ...valid, gender: 'invalid' }).gender);
    assert.equal(patientDetailsSchema.parse({ ...valid, dob: '2024-02-29', gender: 'Other' }).dob.toISOString(), '2024-02-29T00:00:00.000Z');
});
test('profile requires full name and email, trims and preserves valid tags', () => {
    assert.deepEqual(profileFieldErrors({ name: '', email: '' }), { name: 'Full name is required', email: 'Please enter a valid email address' });
    for (const email of ['', 'abc', 'abc@gmail', 'abc @gmail.com', 'abc..def@gmail.com']) assert.equal(profileFormSchema.safeParse({ name: 'Jane', email }).success, false);
    assert.deepEqual(profileFormSchema.parse({ name: ' Jane ', email: ' John+Test@gmail.com ' }), { name: 'Jane', email: 'john+test@gmail.com' });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emailSchema, loginEmailSchema, mailboxEmailSchema, optionalEmailSchema, validateEmail } = require('./index');

for (const value of ['doctor@gmail.com', 'doctor@yahoo.com', 'doctor@outlook.com', 'doctor@hotmail.com', 'doctor@icloud.com', 'doctor@proton.me', 'doctor@clinic.com', 'doctor@hospital.org', 'doctor@myclinic.co.uk', 'doctor+test@example.com', 'doctor+clinic@example.com', 'admin@frigolabs.com', 'test@gmail.com', 'john.doe+test@gmail.com', 'user_name@gmail.com', "o'connor@gmail.com", 'clinic@gmail.com', ' Mixed.Name+Tag@GMAIL.COM ']) {
    test(`accepts and normalizes ${value}`, () => {
        assert.equal(emailSchema.parse(value), value.trim().toLowerCase());
        assert.equal(validateEmail(value), '');
        assert.equal(loginEmailSchema.parse(value), value.trim().toLowerCase());
    });
}
for (const value of ['doctor', 'doctor@', '@gmail.com', 'doctor@gmail', 'doctor @gmail.com', 'doctor..test@gmail.com', 'doctor@.com', '', '  ', 'test', 'test@', '@gmail.com', 'test@example', 'test..test@gmail.com', 'test name@gmail.com', '.test@gmail.com', 'test.@gmail.com', 'a@@gmail.com', 'a@gmail.com\r\nBcc: b@gmail.com', '<script>@gmail.com', ['test@gmail.com'], { email: 'test@gmail.com' }, null, undefined, 7]) {
    test(`rejects malformed input ${JSON.stringify(value)}`, () => {
        assert.equal(emailSchema.safeParse(value).success, false);
        assert.equal(validateEmail(value), 'Please enter a valid email address');
    });
}
test('optional emails retain missing updates and normalize explicit clears', () => {
    assert.equal(optionalEmailSchema.parse(undefined), undefined);
    for (const value of ['', '  ', null]) assert.equal(optionalEmailSchema.parse(value), null);
    assert.equal(optionalEmailSchema.parse(' USER+Tag@GMAIL.COM '), 'user+tag@gmail.com');
    assert.equal(validateEmail('test@', { required: false }), 'Please enter a valid email address');
});
test('does not remove dots or tags from legitimate email content', () => {
    assert.equal(emailSchema.parse(' John.Doe+Test@gmail.com '), 'john.doe+test@gmail.com');
    assert.equal(validateEmail('a'.repeat(250) + '@gmail.com'), 'Please enter a valid email address');
});

test('validates domain structure without a provider whitelist or autocorrection', () => {
    for (const email of ['name@gml.com', 'name@custom.example.org', 'name@gmail.co', 'name@outlok.com']) {
        assert.equal(emailSchema.parse(email), email);
        assert.equal(optionalEmailSchema.parse(email), email);
    }
    for (const email of ['name@gmailcom', 'name@.com', 'name@domain..com', 'name@-domain.com']) {
        assert.equal(emailSchema.safeParse(email).success, false);
    }
});

test('transport configuration and internal sandbox addresses retain syntax validation', () => {
    for (const email of ['notifications@frigolabs.com', 'sandbox@example.com']) assert.equal(mailboxEmailSchema.parse(email), email);
    assert.equal(mailboxEmailSchema.safeParse('bad@').success, false);
});

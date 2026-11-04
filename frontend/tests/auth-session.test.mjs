import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/auth-session.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled, filename);
const { readVerifiedSessionProfile } = loaded.exports;
const profile = { id: 'fixture-user', email: 'clinic@example.com', name: 'Fixture', role: 'CLINIC_USER', clinic_id: 'fixture-clinic',
    clinic_name: 'Fixture Clinic', email_verified: true, is_clinic_admin: true };

test('accepts an authenticated verified profile and copies only safe fields', () => {
    assert.deepEqual(readVerifiedSessionProfile({ ...profile, password_hash: 'private-fixture-hash', token: 'unexpected' }), profile);
});
test('rejects incomplete, unverified, or unauthorized profiles', () => {
    for (const value of [null, {}, { ...profile, email_verified: false }, { ...profile, id: '' }, { ...profile, role: 'OTHER' },
        { ...profile, clinic_id: null }, { ...profile, is_clinic_admin: 'true' }]) assert.equal(readVerifiedSessionProfile(value), null);
});
test('preserves central administrator sessions without a clinic', () => {
    const admin = { ...profile, role: 'ADMIN', clinic_id: null, clinic_name: null };
    assert.deepEqual(readVerifiedSessionProfile(admin), admin);
});

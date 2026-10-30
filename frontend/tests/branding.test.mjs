import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

// Exercise the actual TypeScript helpers without adding another test framework.
const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/branding.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled, filename);
const { contrast, textOn, brandStyle } = loaded.exports;

test('all selected button text colors meet normal-text contrast', () => {
    for (let level = 0; level <= 255; level++) {
        const value = level.toString(16).padStart(2, '0');
        const color = `#${value}${value}${value}`;
        assert.ok(contrast(color, textOn(color)) >= 4.5, color);
    }
    for (const color of ['#163d8c', '#f2b84c', '#74264f', '#73d8cb', '#ffff00', '#00ff00']) assert.ok(contrast(color, textOn(color)) >= 4.5);
});

test('clinic themes stay separate and a missing clinic preserves central branding', () => {
    assert.deepEqual(brandStyle(null), {});
    const first = brandStyle({ primary_color: '#163d8c', secondary_color: '#f2b84c' });
    const second = brandStyle({ primary_color: '#74264f', secondary_color: '#73d8cb' });
    assert.notEqual(first['--brand-primary'], second['--brand-primary']);
    assert.notEqual(first['--brand-secondary'], second['--brand-secondary']);
    assert.ok(contrast(first['--brand-ink'], '#ffffff') >= 4.5);
    assert.ok(contrast(second['--brand-accent-ink'], '#ffffff') >= 4.5);
});

test('invalid saved colors cannot inject styles and get safe defaults', () => {
    const style = brandStyle({ primary_color: 'red;display:none', secondary_color: 'url(https://example.invalid)' });
    assert.equal(style['--brand-primary'], '#0F766E');
    assert.equal(style['--brand-secondary'], '#14B8A6');
});

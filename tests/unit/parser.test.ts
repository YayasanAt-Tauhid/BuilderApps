import { describe, it, expect } from 'vitest';
import {
	parseGeneratedFiles,
	parseOutput,
	applyPatch,
	sanitizePath
} from '../../src/lib/server/ai/parser';

describe('parseGeneratedFiles (legacy)', () => {
	it('extracts delimited files', () => {
		const out = [
			'Here is your project:',
			'=== FILE: src/index.ts ===',
			'export const x = 1;',
			'=== END FILE ===',
			'=== FILE: README.md ===',
			'# Hello',
			'=== END FILE ==='
		].join('\n');
		const files = parseGeneratedFiles(out);
		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({ path: 'src/index.ts', content: 'export const x = 1;' });
		expect(files[1].path).toBe('README.md');
	});

	it('flushes an unterminated trailing block (truncated stream)', () => {
		const out = '=== FILE: a.txt ===\nhello';
		const files = parseGeneratedFiles(out);
		expect(files).toEqual([{ path: 'a.txt', content: 'hello' }]);
	});

	it('de-dupes by path, last write wins', () => {
		const out =
			'=== FILE: a.txt ===\nfirst\n=== END FILE ===\n=== FILE: a.txt ===\nsecond\n=== END FILE ===';
		const files = parseGeneratedFiles(out);
		expect(files).toEqual([{ path: 'a.txt', content: 'second' }]);
	});
});

describe('parseOutput — PATCH blocks', () => {
	it('parses a single-hunk patch', () => {
		const out = [
			'=== PATCH: src/app.css ===',
			'@@ ... @@',
			' body { margin: 0; }',
			'-color: red;',
			'+color: blue;',
			' .end {}',
			'=== END PATCH ==='
		].join('\n');
		const result = parseOutput(out);
		expect(result.files).toHaveLength(0);
		expect(result.patches).toHaveLength(1);
		expect(result.patches[0].path).toBe('src/app.css');
		const hunk = result.patches[0].hunks[0];
		// search = context + removed lines
		expect(hunk.search).toEqual(['body { margin: 0; }', 'color: red;', '.end {}']);
		// replace = context + added lines
		expect(hunk.replace).toEqual(['body { margin: 0; }', 'color: blue;', '.end {}']);
	});

	it('parses multiple hunks in one PATCH block', () => {
		const out = [
			'=== PATCH: index.html ===',
			'@@ ... @@',
			'-<title>Old</title>',
			'+<title>New</title>',
			'@@ ... @@',
			'-<p>old</p>',
			'+<p>new</p>',
			'=== END PATCH ==='
		].join('\n');
		const result = parseOutput(out);
		expect(result.patches[0].hunks).toHaveLength(2);
	});

	it('parses mixed FILE and PATCH blocks', () => {
		const out = [
			'=== FILE: README.md ===',
			'# App',
			'=== END FILE ===',
			'=== PATCH: src/app.css ===',
			'@@ ... @@',
			'-color: red;',
			'+color: blue;',
			'=== END PATCH ==='
		].join('\n');
		const result = parseOutput(out);
		expect(result.files).toHaveLength(1);
		expect(result.patches).toHaveLength(1);
	});
});

describe('applyPatch', () => {
	it('replaces a removed line with an added line (no context)', () => {
		const original = 'line1\ncolor: red;\nline3';
		const patch = {
			path: 'f',
			hunks: [{ search: ['color: red;'], replace: ['color: blue;'] }]
		};
		expect(applyPatch(original, patch)).toBe('line1\ncolor: blue;\nline3');
	});

	it('preserves context lines and replaces only the changed line', () => {
		const original = 'a\nb\nc\nd';
		const patch = {
			path: 'f',
			hunks: [{ search: ['a', 'b', 'c'], replace: ['a', 'B', 'c'] }]
		};
		expect(applyPatch(original, patch)).toBe('a\nB\nc\nd');
	});

	it('returns null when hunk search block is not found', () => {
		const patch = {
			path: 'f',
			hunks: [{ search: ['does not exist'], replace: ['x'] }]
		};
		expect(applyPatch('hello world', patch)).toBeNull();
	});

	it('applies a full round-trip from parseOutput to applyPatch', () => {
		const original = 'body { margin: 0; }\ncolor: red;\n.end {}';
		const diffOutput = [
			'=== PATCH: app.css ===',
			'@@ ... @@',
			' body { margin: 0; }',
			'-color: red;',
			'+color: blue;',
			' .end {}',
			'=== END PATCH ==='
		].join('\n');
		const { patches } = parseOutput(diffOutput);
		expect(patches).toHaveLength(1);
		const result = applyPatch(original, patches[0]);
		expect(result).toBe('body { margin: 0; }\ncolor: blue;\n.end {}');
	});
});

describe('sanitizePath', () => {
	it('strips traversal and absolute prefixes', () => {
		expect(sanitizePath('/etc/passwd')).toBe('etc/passwd');
		expect(sanitizePath('../../secret')).toBe('secret');
		expect(sanitizePath('a/./b/../c')).toBe('a/b/c');
		expect(sanitizePath('src\\routes\\x.ts')).toBe('src/routes/x.ts');
	});
});

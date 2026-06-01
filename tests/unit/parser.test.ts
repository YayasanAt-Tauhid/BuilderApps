import { describe, it, expect } from 'vitest';
import { parseGeneratedFiles, sanitizePath } from '../../src/lib/server/ai/parser';

describe('parseGeneratedFiles', () => {
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
		const { files } = parseGeneratedFiles(out);
		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({ path: 'src/index.ts', content: 'export const x = 1;' });
		expect(files[1].path).toBe('README.md');
	});

	it('flushes an unterminated trailing block (truncated stream)', () => {
		const out = '=== FILE: a.txt ===\nhello';
		const { files } = parseGeneratedFiles(out);
		expect(files).toEqual([{ path: 'a.txt', content: 'hello' }]);
	});

	it('de-dupes by path, last write wins', () => {
		const out =
			'=== FILE: a.txt ===\nfirst\n=== END FILE ===\n=== FILE: a.txt ===\nsecond\n=== END FILE ===';
		const { files } = parseGeneratedFiles(out);
		expect(files).toEqual([{ path: 'a.txt', content: 'second' }]);
	});

	it('parses DELETE markers', () => {
		const out =
			'=== DELETE: src/old.ts ===\n=== FILE: src/new.ts ===\ncontent\n=== END FILE ===';
		const { files, deletedPaths } = parseGeneratedFiles(out);
		expect(deletedPaths).toEqual(['src/old.ts']);
		expect(files).toEqual([{ path: 'src/new.ts', content: 'content' }]);
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

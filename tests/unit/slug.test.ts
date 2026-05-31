import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from '../../src/lib/utils/slug';

describe('slugify', () => {
	it('produces a url-safe slug', () => {
		expect(slugify('My Cool App!')).toBe('my-cool-app');
		expect(slugify('  Trim  Me  ')).toBe('trim-me');
	});

	it('falls back to "project" for empty input', () => {
		expect(slugify('!!!')).toBe('project');
		expect(slugify('')).toBe('project');
	});
});

describe('uniqueSlug', () => {
	it('appends a random suffix', () => {
		const s = uniqueSlug('My App');
		expect(s).toMatch(/^my-app-[a-z0-9]{1,6}$/);
		expect(uniqueSlug('My App')).not.toBe(uniqueSlug('My App'));
	});
});

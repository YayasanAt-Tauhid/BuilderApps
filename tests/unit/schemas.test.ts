import { describe, it, expect } from 'vitest';
import {
	registerSchema,
	loginSchema,
	createProjectSchema,
	createMessageSchema,
	parse
} from '../../src/lib/schemas';

describe('registerSchema', () => {
	it('accepts a valid registration and lowercases the email', () => {
		const r = parse(registerSchema, { email: 'User@Example.COM', password: 'supersecret' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.email).toBe('user@example.com');
	});

	it('rejects a short password', () => {
		const r = parse(registerSchema, { email: 'a@b.com', password: 'short' });
		expect(r.success).toBe(false);
	});

	it('rejects an invalid email', () => {
		const r = parse(registerSchema, { email: 'not-an-email', password: 'supersecret' });
		expect(r.success).toBe(false);
	});
});

describe('loginSchema', () => {
	it('requires a non-empty password', () => {
		expect(parse(loginSchema, { email: 'a@b.com', password: '' }).success).toBe(false);
		expect(parse(loginSchema, { email: 'a@b.com', password: 'x' }).success).toBe(true);
	});
});

describe('createProjectSchema', () => {
	it('requires a name', () => {
		expect(parse(createProjectSchema, { name: '' }).success).toBe(false);
		expect(parse(createProjectSchema, { name: 'My App' }).success).toBe(true);
	});
});

describe('createMessageSchema', () => {
	it('rejects empty content and caps length', () => {
		expect(parse(createMessageSchema, { content: '   ' }).success).toBe(false);
		expect(parse(createMessageSchema, { content: 'x'.repeat(8001) }).success).toBe(false);
		expect(parse(createMessageSchema, { content: 'build me a todo app' }).success).toBe(true);
	});
});

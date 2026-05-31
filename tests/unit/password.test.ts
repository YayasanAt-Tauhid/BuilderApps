import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/server/auth/password';

// Uses the Web Crypto API (globalThis.crypto.subtle), available in Node 22+.
describe('password hashing (PBKDF2 / Web Crypto)', () => {
	it('round-trips a correct password', async () => {
		const stored = await hashPassword('correct horse battery staple');
		expect(stored.startsWith('pbkdf2$')).toBe(true);
		expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
	});

	it('rejects a wrong password', async () => {
		const stored = await hashPassword('hunter2');
		expect(await verifyPassword(stored, 'hunter3')).toBe(false);
	});

	it('produces distinct hashes for the same password (random salt)', async () => {
		const a = await hashPassword('same');
		const b = await hashPassword('same');
		expect(a).not.toBe(b);
	});

	it('rejects a malformed stored value', async () => {
		expect(await verifyPassword('garbage', 'x')).toBe(false);
	});
});

import { encodeHexLowerCase } from '@oslojs/encoding';

// Password hashing via PBKDF2 over the Web Crypto API (crypto.subtle).
// Native bcrypt/argon2 binaries do not run on Workers; PBKDF2 is natively available.
// Optional future upgrade: argon2id via WASM. See PRD §12.1 / ASSUMPTION-8.

const ITERATIONS = 600_000;
const HASH = 'SHA-256';
const KEY_LEN_BITS = 256;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function derive(
	password: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number
): Promise<string> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations, hash: HASH },
		keyMaterial,
		KEY_LEN_BITS
	);
	return encodeHexLowerCase(new Uint8Array(bits));
}

/** Returns an encoded string: `pbkdf2$<iterations>$<saltHex>$<hashHex>`. Never logged. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${encodeHexLowerCase(salt)}$${hash}`;
}

/** Constant-time-ish verification. Re-derives with the stored salt + iterations. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;
	const salt = fromHex(parts[2]);
	const expected = parts[3];
	const actual = await derive(password, salt, iterations);
	return timingSafeEqual(expected, actual);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../src/lib/server/middleware/rate-limit';

// Integration test running inside the Workers runtime (workerd) with a real KV binding.
describe('rateLimit (against KV binding)', () => {
	it('allows up to the limit then blocks', async () => {
		const kv = env.KV;
		const id = `test-${crypto.randomUUID()}`;
		const opts = { limit: 3, windowSeconds: 60 };

		const r1 = await rateLimit(kv, 'test', id, opts);
		const r2 = await rateLimit(kv, 'test', id, opts);
		const r3 = await rateLimit(kv, 'test', id, opts);
		const r4 = await rateLimit(kv, 'test', id, opts);

		expect(r1.allowed).toBe(true);
		expect(r2.allowed).toBe(true);
		expect(r3.allowed).toBe(true);
		expect(r4.allowed).toBe(false);
		expect(r4.remaining).toBe(0);
	});
});

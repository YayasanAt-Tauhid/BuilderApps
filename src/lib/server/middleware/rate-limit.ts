import type { KVNamespace } from '@cloudflare/workers-types';

// Simple fixed-window rate limiter backed by KV (PRD §11.3 key format).
// Applied to /auth/* routes (PRD §5 M1/M2). Always sets an explicit TTL.

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	limit: number;
	resetSeconds: number;
}

export async function rateLimit(
	kv: KVNamespace,
	route: string,
	identifier: string,
	opts: { limit: number; windowSeconds: number }
): Promise<RateLimitResult> {
	const key = `ratelimit:${route}:${identifier}`;
	const current = await kv.get(key);
	const count = current ? parseInt(current, 10) : 0;

	if (count >= opts.limit) {
		return { allowed: false, remaining: 0, limit: opts.limit, resetSeconds: opts.windowSeconds };
	}

	// First hit in the window establishes the TTL; subsequent hits increment within it.
	await kv.put(key, String(count + 1), { expirationTtl: opts.windowSeconds });
	return {
		allowed: true,
		remaining: opts.limit - (count + 1),
		limit: opts.limit,
		resetSeconds: opts.windowSeconds
	};
}

/** Extract a best-effort client identifier from request headers. */
export function clientIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ??
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown'
	);
}

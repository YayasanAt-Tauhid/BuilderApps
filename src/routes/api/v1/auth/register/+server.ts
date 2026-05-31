import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, fail, errors } from '$lib/server/api';
import { getDb, getEnv } from '$lib/server/context';
import { registerSchema, parse } from '$lib/schemas';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, newUserId, SESSION_COOKIE } from '$lib/server/auth';
import { rateLimit, clientIp } from '$lib/server/middleware/rate-limit';

export const POST: RequestHandler = async (event) => {
	const env = getEnv(event);
	const rl = await rateLimit(env.KV, 'auth:register', clientIp(event.request), {
		limit: 5,
		windowSeconds: 600
	});
	if (!rl.allowed) return errors.rateLimited();

	const body = await event.request.json().catch(() => null);
	const result = parse(registerSchema, body);
	if (!result.success) return errors.validation();

	const db = getDb(event);
	const { email, password, displayName } = result.data;

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (existing.length > 0) {
		// Non-enumerating: same generic message regardless of cause (PRD §5 M1).
		return fail('registration_failed', 'Unable to create an account with those details.', 409);
	}

	const now = Date.now();
	const userId = newUserId();
	await db.insert(users).values({
		id: userId,
		email,
		passwordHash: await hashPassword(password),
		displayName: displayName ?? null,
		role: 'user',
		locale: 'en',
		theme: 'system',
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});

	const token = generateSessionToken();
	await createSession(db, env.KV, token, userId);
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 30
	});

	return ok({ id: userId, email, displayName: displayName ?? null }, undefined, 201);
};

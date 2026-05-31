import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, fail, errors } from '$lib/server/api';
import { getDb, getEnv } from '$lib/server/context';
import { loginSchema, parse } from '$lib/schemas';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, SESSION_COOKIE } from '$lib/server/auth';
import { rateLimit, clientIp } from '$lib/server/middleware/rate-limit';

export const POST: RequestHandler = async (event) => {
	const env = getEnv(event);
	const rl = await rateLimit(env.KV, 'auth:login', clientIp(event.request), {
		limit: 10,
		windowSeconds: 600
	});
	if (!rl.allowed) return errors.rateLimited();

	const body = await event.request.json().catch(() => null);
	const result = parse(loginSchema, body);
	if (!result.success) return errors.validation();

	const db = getDb(event);
	const { email, password } = result.data;

	const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
	const user = rows[0];

	// Generic error for both unknown email and bad password (no enumeration, PRD §5 M2).
	const invalid = () => fail('invalid_credentials', 'Invalid email or password.', 401);
	if (!user || user.deletedAt !== null) {
		// Still do work-equivalent hashing? Keep it simple: constant generic response.
		return invalid();
	}
	if (!(await verifyPassword(user.passwordHash, password))) return invalid();

	const token = generateSessionToken();
	await createSession(db, env.KV, token, user.id);
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 30
	});

	return ok({ id: user.id, email: user.email, displayName: user.displayName });
};

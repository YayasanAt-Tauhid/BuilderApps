import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/context';
import { loginSchema, parse } from '$lib/schemas';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, SESSION_COOKIE } from '$lib/server/auth';
import { rateLimit, clientIp } from '$lib/server/middleware/rate-limit';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const env = getEnv(event);
		const rl = await rateLimit(env.KV, 'auth:login', clientIp(event.request), {
			limit: 10,
			windowSeconds: 600
		});
		if (!rl.allowed) return fail(429, { error: 'Too many attempts. Please try again later.' });

		const form = await event.request.formData();
		const result = parse(loginSchema, {
			email: form.get('email'),
			password: form.get('password')
		});
		if (!result.success) return fail(400, { error: 'Invalid email or password.' });

		const db = getDb(event);
		const rows = await db.select().from(users).where(eq(users.email, result.data.email)).limit(1);
		const user = rows[0];
		if (
			!user ||
			user.deletedAt !== null ||
			!(await verifyPassword(user.passwordHash, result.data.password))
		) {
			return fail(401, { error: 'Invalid email or password.' });
		}

		const token = generateSessionToken();
		await createSession(db, env.KV, token, user.id);
		event.cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 30
		});

		throw redirect(303, '/dashboard');
	}
};

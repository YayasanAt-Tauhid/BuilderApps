import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/context';
import { registerSchema, parse } from '$lib/schemas';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, newUserId, SESSION_COOKIE } from '$lib/server/auth';
import { rateLimit, clientIp } from '$lib/server/middleware/rate-limit';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const env = getEnv(event);
		const rl = await rateLimit(env.KV, 'auth:register', clientIp(event.request), {
			limit: 5,
			windowSeconds: 600
		});
		if (!rl.allowed) return fail(429, { error: 'Too many attempts. Please try again later.' });

		const form = await event.request.formData();
		const result = parse(registerSchema, {
			email: form.get('email'),
			password: form.get('password'),
			displayName: form.get('displayName') || undefined
		});
		if (!result.success) {
			return fail(400, {
				error: 'Please enter a valid email and a password of at least 8 characters.'
			});
		}

		const db = getDb(event);
		const { email, password, displayName } = result.data;
		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		if (existing.length > 0) {
			return fail(409, { error: 'Unable to create an account with those details.' });
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

		throw redirect(303, '/dashboard');
	}
};

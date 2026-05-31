import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { getDb, getEnv } from '$lib/server/context';
import { invalidateSession, SESSION_COOKIE } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.sessionId) return errors.unauthorized();
	const env = getEnv(event);
	const db = getDb(event);
	await invalidateSession(db, env.KV, event.locals.sessionId);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return ok({ success: true });
};

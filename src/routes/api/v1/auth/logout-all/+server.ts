import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { getDb, getEnv, requireUser } from '$lib/server/context';
import { invalidateAllSessions, SESSION_COOKIE } from '$lib/server/auth';

// Logout all devices (PRD §12.2 — Should).
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return errors.unauthorized();
	const user = requireUser(event);
	const env = getEnv(event);
	const db = getDb(event);
	await invalidateAllSessions(db, env.KV, user.id);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return ok({ success: true });
};

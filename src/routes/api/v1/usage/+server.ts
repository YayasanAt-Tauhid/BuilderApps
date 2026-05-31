import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { getDb, requireUser } from '$lib/server/context';
import { getUsage } from '$lib/server/usage';

// Current user usage & quota (PRD §5 M8).
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return errors.unauthorized();
	const user = requireUser(event);
	const db = getDb(event);
	const usage = await getUsage(db, user.id);
	return ok(usage);
};

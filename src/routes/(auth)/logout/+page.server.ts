import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/context';
import { invalidateSession, SESSION_COOKIE } from '$lib/server/auth';

// Action-only route (PRD §6). Visiting it directly just bounces home.
export const load: PageServerLoad = async () => {
	throw redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.sessionId) {
			const env = getEnv(event);
			const db = getDb(event);
			await invalidateSession(db, env.KV, event.locals.sessionId);
		}
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
		throw redirect(303, '/');
	}
};

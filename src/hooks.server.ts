import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { createDb } from '$lib/server/db';
import { validateSessionToken, SESSION_COOKIE } from '$lib/server/auth';
import { applySecurityHeaders } from '$lib/server/middleware/security-headers';

// 1) Resolve the session from the cookie and populate locals (PRD §12).
const handleAuth: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;
	event.locals.sessionId = null;

	if (token && event.platform?.env) {
		const db = createDb(event.platform.env.DB);
		const { session, user } = await validateSessionToken(db, event.platform.env.KV, token);
		if (session && user) {
			event.locals.user = user;
			event.locals.sessionId = session.id;
		} else {
			// Stale/invalid token — clear the cookie.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	return resolve(event);
};

// 2) i18n: detect locale and inject lang + theme into the HTML shell.
const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		const theme = event.locals.user?.theme ?? 'system';
		const themeClass = theme === 'dark' ? 'dark' : '';
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%builderpro.theme%', themeClass)
		});
	});

// 3) Security headers on every response (PRD §16.4).
const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	return applySecurityHeaders(response);
};

export const handle = sequence(handleAuth, handleParaglide, handleSecurity);

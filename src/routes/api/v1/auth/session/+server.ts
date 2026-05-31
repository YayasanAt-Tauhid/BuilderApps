import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';

// Current session / silent re-auth check (PRD §12.2). The hook already validated the cookie.
export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) return errors.unauthorized();
	return ok({
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		role: user.role,
		locale: user.locale,
		theme: user.theme
	});
};

import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject } from '$lib/server/context';
import { projects, users } from '$lib/server/db/schema';
import { getAnonKey } from '$lib/server/supabase';

/** POST — link this project to a Supabase project ref. Body: { ref: string } */
export const POST: RequestHandler = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);

	const body = await event.request.json().catch(() => null);
	const ref = typeof body?.ref === 'string' ? body.ref.trim() : '';
	if (!ref) return errors.validation();

	// Fetch the user's Supabase access token.
	const [userRow] = await db
		.select({ supabaseAccessToken: users.supabaseAccessToken })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	if (!userRow?.supabaseAccessToken) return errors.forbidden();

	// Resolve the anon key for this project ref.
	const anonKey = await getAnonKey(userRow.supabaseAccessToken, ref);
	if (!anonKey) return errors.internal();

	const supabaseUrl = `https://${ref}.supabase.co`;

	await db
		.update(projects)
		.set({ supabaseProjectRef: ref, supabaseUrl, supabaseAnonKey: anonKey, updatedAt: Date.now() })
		.where(eq(projects.id, project.id));

	return ok({ ref, supabaseUrl });
};

/** DELETE — unlink Supabase from this project. */
export const DELETE: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);

	await db
		.update(projects)
		.set({ supabaseProjectRef: null, supabaseUrl: null, supabaseAnonKey: null, updatedAt: Date.now() })
		.where(eq(projects.id, project.id));

	return ok({ unlinked: true });
};

import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, requireUser } from '$lib/server/context';
import { updatePreferencesSchema, parse } from '$lib/schemas';
import { users } from '$lib/server/db/schema';
import { getUsage } from '$lib/server/usage';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const db = getDb(event);
	const usage = await getUsage(db, user.id);
	return { usage, preferences: { locale: user.locale, theme: user.theme } };
};

export const actions: Actions = {
	// Dark mode + locale preference (PRD Consistency Matrix: handled via a form action,
	// not a dedicated REST endpoint — by design).
	default: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const result = parse(updatePreferencesSchema, {
			locale: form.get('locale') || undefined,
			theme: form.get('theme') || undefined
		});
		if (!result.success) return fail(400, { error: 'Invalid preference.' });

		const db = getDb(event);
		await db
			.update(users)
			.set({
				...(result.data.locale ? { locale: result.data.locale } : {}),
				...(result.data.theme ? { theme: result.data.theme } : {}),
				updatedAt: Date.now()
			})
			.where(eq(users.id, user.id));
		return { success: true };
	}
};

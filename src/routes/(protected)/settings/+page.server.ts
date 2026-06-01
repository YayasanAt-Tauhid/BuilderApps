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

	const [usage, accountRow] = await Promise.all([
		getUsage(db, user.id),
		db
			.select({
				githubLogin: users.githubLogin,
				supabaseAccessToken: users.supabaseAccessToken,
				cloudflareAccessToken: users.cloudflareAccessToken
			})
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1)
	]);

	return {
		usage,
		preferences: { locale: user.locale, theme: user.theme },
		githubLogin: accountRow[0]?.githubLogin ?? null,
		supabaseConnected: !!accountRow[0]?.supabaseAccessToken,
		cloudflareConnected: !!accountRow[0]?.cloudflareAccessToken
	};
};

export const actions: Actions = {
	// Dark mode + locale preference (PRD Consistency Matrix: handled via a form action,
	// not a dedicated REST endpoint — by design).
	savePreferences: async (event) => {
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
	},

	disconnectGithub: async (event) => {
		const user = requireUser(event);
		const db = getDb(event);
		await db
			.update(users)
			.set({ githubAccessToken: null, githubLogin: null, updatedAt: Date.now() })
			.where(eq(users.id, user.id));
		return { success: true };
	},

	disconnectSupabase: async (event) => {
		const user = requireUser(event);
		const db = getDb(event);
		await db
			.update(users)
			.set({ supabaseAccessToken: null, supabaseRefreshToken: null, updatedAt: Date.now() })
			.where(eq(users.id, user.id));
		return { success: true };
	},

	disconnectCloudflare: async (event) => {
		const user = requireUser(event);
		const db = getDb(event);
		await db
			.update(users)
			.set({ cloudflareAccessToken: null, cloudflareRefreshToken: null, updatedAt: Date.now() })
			.where(eq(users.id, user.id));
		return { success: true };
	}
};

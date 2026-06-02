import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { exchangeCode } from '$lib/server/supabase';
import { users } from '$lib/server/db/schema';

const KV_STATE_PREFIX = 'supabase_oauth_state:';

export const GET: RequestHandler = async (event) => {
	const env = getEnv(event);
	const { searchParams } = new URL(event.request.url);
	const code = searchParams.get('code');
	const state = searchParams.get('state');
	const sbError = searchParams.get('error');

	if (sbError) throw redirect(302, '/settings?supabase_error=denied');
	if (!code || !state) throw redirect(302, '/settings?supabase_error=invalid');

	const userId = await env.KV.get(KV_STATE_PREFIX + state);
	if (!userId) throw redirect(302, '/settings?supabase_error=expired');
	await env.KV.delete(KV_STATE_PREFIX + state);

	if (!env.SUPABASE_CLIENT_ID || !env.SUPABASE_CLIENT_SECRET) {
		throw redirect(302, '/settings?supabase_error=config');
	}

	const redirectUri = `${env.APP_URL ?? ''}/api/v1/auth/supabase/callback`;
	const tokens = await exchangeCode(code, env.SUPABASE_CLIENT_ID, env.SUPABASE_CLIENT_SECRET, redirectUri);
	if (!tokens) throw redirect(302, '/settings?supabase_error=token');

	const db = getDb(event);
	await db
		.update(users)
		.set({
			supabaseAccessToken: tokens.accessToken,
			supabaseRefreshToken: tokens.refreshToken,
			updatedAt: Date.now()
		})
		.where(eq(users.id, userId));

	throw redirect(302, '/settings?supabase_connected=1');
};

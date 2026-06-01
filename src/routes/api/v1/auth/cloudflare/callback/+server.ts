import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { exchangeCode } from '$lib/server/cloudflare-oauth';
import { users } from '$lib/server/db/schema';

const KV_STATE_PREFIX = 'cf_oauth_state:';

export const GET: RequestHandler = async (event) => {
	const env = getEnv(event);
	const { searchParams } = new URL(event.request.url);
	const code = searchParams.get('code');
	const state = searchParams.get('state');
	const cfError = searchParams.get('error');

	if (cfError) throw redirect(302, '/settings?cf_error=denied');
	if (!code || !state) throw redirect(302, '/settings?cf_error=invalid');

	const userId = await env.KV.get(KV_STATE_PREFIX + state);
	if (!userId) throw redirect(302, '/settings?cf_error=expired');
	await env.KV.delete(KV_STATE_PREFIX + state);

	if (!env.CLOUDFLARE_CLIENT_ID || !env.CLOUDFLARE_CLIENT_SECRET) {
		throw redirect(302, '/settings?cf_error=config');
	}

	const redirectUri = `${env.APP_URL ?? ''}/api/v1/auth/cloudflare/callback`;
	const tokens = await exchangeCode(code, env.CLOUDFLARE_CLIENT_ID, env.CLOUDFLARE_CLIENT_SECRET, redirectUri);
	if (!tokens) throw redirect(302, '/settings?cf_error=token');

	const db = getDb(event);
	await db
		.update(users)
		.set({
			cloudflareAccessToken: tokens.accessToken,
			cloudflareRefreshToken: tokens.refreshToken,
			updatedAt: Date.now()
		})
		.where(eq(users.id, userId));

	throw redirect(302, '/settings?cf_connected=1');
};

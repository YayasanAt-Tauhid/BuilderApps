import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser, getEnv } from '$lib/server/context';
import { generateOAuthState } from '$lib/server/cloudflare-oauth';

const KV_STATE_PREFIX = 'cf_oauth_state:';
const STATE_TTL_SECONDS = 600;

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const env = getEnv(event);

	if (!env.CLOUDFLARE_CLIENT_ID) throw error(503, 'Cloudflare integration is not configured.');

	const state = generateOAuthState();
	await env.KV.put(KV_STATE_PREFIX + state, user.id, { expirationTtl: STATE_TTL_SECONDS });

	const redirectUri = `${env.APP_URL ?? ''}/api/v1/auth/cloudflare/callback`;
	const params = new URLSearchParams({
		client_id: env.CLOUDFLARE_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'account:read offline_access',
		state
	});

	throw redirect(302, `https://dash.cloudflare.com/oauth2/auth?${params.toString()}`);
};

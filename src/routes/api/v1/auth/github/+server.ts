import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser, getEnv } from '$lib/server/context';
import { generateOAuthState } from '$lib/server/github';

const KV_STATE_PREFIX = 'github_oauth_state:';
const STATE_TTL_SECONDS = 600;

// Redirect the authenticated user to GitHub's OAuth consent screen.
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const env = getEnv(event);

	if (!env.GITHUB_CLIENT_ID) throw error(503, 'GitHub integration is not configured.');

	const state = generateOAuthState();
	await env.KV.put(KV_STATE_PREFIX + state, user.id, { expirationTtl: STATE_TTL_SECONDS });

	const params = new URLSearchParams({
		client_id: env.GITHUB_CLIENT_ID,
		state,
		scope: 'repo'
	});

	throw redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
};

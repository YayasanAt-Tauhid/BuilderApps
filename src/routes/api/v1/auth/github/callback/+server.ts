import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { exchangeCode, getGithubUser } from '$lib/server/github';
import { users } from '$lib/server/db/schema';

const KV_STATE_PREFIX = 'github_oauth_state:';

// GitHub redirects here after the user grants (or denies) access.
export const GET: RequestHandler = async (event) => {
	const env = getEnv(event);
	const { searchParams } = new URL(event.request.url);
	const code = searchParams.get('code');
	const state = searchParams.get('state');
	const ghError = searchParams.get('error');

	// User denied access on GitHub's consent screen.
	if (ghError) throw redirect(302, '/settings?github_error=denied');

	if (!code || !state) throw redirect(302, '/settings?github_error=invalid');

	// Validate CSRF state stored in KV.
	const userId = await env.KV.get(KV_STATE_PREFIX + state);
	if (!userId) throw redirect(302, '/settings?github_error=expired');
	await env.KV.delete(KV_STATE_PREFIX + state);

	if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
		throw redirect(302, '/settings?github_error=config');
	}

	const accessToken = await exchangeCode(code, env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
	if (!accessToken) throw redirect(302, '/settings?github_error=token');

	const ghUser = await getGithubUser(accessToken);
	if (!ghUser) throw redirect(302, '/settings?github_error=user');

	const db = getDb(event);
	await db
		.update(users)
		.set({ githubAccessToken: accessToken, githubLogin: ghUser.login, updatedAt: Date.now() })
		.where(eq(users.id, userId));

	throw redirect(302, '/settings?github_connected=1');
};

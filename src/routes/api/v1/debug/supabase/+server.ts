import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireUser, getDb, getEnv } from '$lib/server/context';
import { users } from '$lib/server/db/schema';

// Temporary debug endpoint — remove after diagnosis
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const db = getDb(event);
	const env = getEnv(event);

	const [row] = await db
		.select({ supabaseAccessToken: users.supabaseAccessToken, supabaseRefreshToken: users.supabaseRefreshToken })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	if (!row?.supabaseAccessToken) {
		return json({ error: 'no_token', message: 'No Supabase access token stored for this user' });
	}

	// Call the Management API directly and return the raw response
	const res = await fetch('https://api.supabase.com/v1/projects', {
		headers: {
			Authorization: `Bearer ${row.supabaseAccessToken}`,
			'Content-Type': 'application/json'
		}
	});

	const body = await res.text();
	let parsed: unknown;
	try { parsed = JSON.parse(body); } catch { parsed = body; }

	return json({
		status: res.status,
		statusText: res.statusText,
		headers: Object.fromEntries(res.headers.entries()),
		body: parsed,
		tokenPrefix: row.supabaseAccessToken.slice(0, 20) + '...',
		hasRefreshToken: !!row.supabaseRefreshToken,
		clientIdConfigured: !!env.SUPABASE_CLIENT_ID,
		clientSecretConfigured: !!env.SUPABASE_CLIENT_SECRET
	});
};

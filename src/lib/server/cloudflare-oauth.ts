// Cloudflare OAuth 2.0 + API token management helpers.
// Mirrors the pattern in github.ts and supabase.ts.

const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_OAUTH_TOKEN = 'https://dash.cloudflare.com/oauth2/token';
const USER_AGENT = 'BuilderPro/1.0';

type CfResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function cfRequest<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown
): Promise<CfResult<T>> {
	const res = await fetch(`${CF_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {})
	});
	const json = (await res.json()) as { result?: T; success?: boolean; errors?: { message: string }[] };
	if (json.success && json.result !== undefined) return { ok: true, data: json.result as T };
	const msg = json.errors?.[0]?.message ?? res.statusText;
	return { ok: false, status: res.status, message: msg };
}

export function generateOAuthState(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function exchangeCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
	const res = await fetch(CF_OAUTH_TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri
		}).toString()
	});
	if (!res.ok) return null;
	const data = (await res.json()) as { access_token?: string; refresh_token?: string };
	if (!data.access_token) return null;
	return { accessToken: data.access_token, refreshToken: data.refresh_token ?? '' };
}

export async function refreshAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
	const res = await fetch(CF_OAUTH_TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret
		}).toString()
	});
	if (!res.ok) return null;
	const data = (await res.json()) as { access_token?: string; refresh_token?: string };
	if (!data.access_token) return null;
	return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
}

interface PermissionGroup {
	id: string;
	name: string;
}

/**
 * Create a scoped Cloudflare API token for Cloudflare Pages deployment.
 * Uses the OAuth access token to call POST /user/tokens, returning a
 * permanent token with Pages:Edit + Account:Read permissions.
 */
export async function createPagesDeployToken(
	oauthToken: string,
	projectSlug: string
): Promise<string | null> {
	// Fetch available permission groups to find Pages:Edit ID.
	const pgResult = await cfRequest<PermissionGroup[]>(oauthToken, 'GET', '/user/tokens/permission_groups');
	if (!pgResult.ok) return null;

	const pagesEdit = pgResult.data.find((pg) => pg.name === 'Cloudflare Pages:Edit');
	const accountRead = pgResult.data.find((pg) => pg.name === 'Account Settings:Read');
	if (!pagesEdit) return null;

	const policies = [
		{
			effect: 'allow',
			resources: { 'com.cloudflare.api.account.*': '*' },
			permission_groups: [
				{ id: pagesEdit.id },
				...(accountRead ? [{ id: accountRead.id }] : [])
			]
		}
	];

	const tokenResult = await cfRequest<{ value: string }>(oauthToken, 'POST', '/user/tokens', {
		name: `BuilderPro Deploy — ${projectSlug}`,
		policies
	});

	if (!tokenResult.ok) {
		console.error(`[cf-oauth] createPagesDeployToken failed: ${tokenResult.message}`);
		return null;
	}
	return tokenResult.data.value;
}

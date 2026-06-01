// Supabase Management API helpers — OAuth token exchange + project/schema fetching.
// Mirrors the pattern in github.ts.

const SUPABASE_API = 'https://api.supabase.com/v1';
const USER_AGENT = 'BuilderPro/1.0';

type SupabaseResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function supabaseRequest<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown
): Promise<SupabaseResult<T>> {
	const res = await fetch(`${SUPABASE_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {})
	});

	if (res.ok) {
		const data = res.status === 204 ? ({} as T) : ((await res.json()) as T);
		return { ok: true, data };
	}
	const err = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string };
	return { ok: false, status: res.status, message: err.message ?? 'Supabase API error' };
}

/** Generate a random OAuth state token (reuse same pattern as GitHub). */
export function generateOAuthState(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Exchange OAuth authorization code for access + refresh tokens. */
export async function exchangeCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
	const res = await fetch(`${SUPABASE_API}/oauth/token`, {
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

export interface SupabaseProject {
	id: string;   // project ref, e.g. "abcdefghij"
	name: string;
	region: string;
	status: string;
}

/** List all Supabase projects for the authenticated user. */
export async function listProjects(token: string): Promise<SupabaseProject[] | null> {
	const result = await supabaseRequest<SupabaseProject[]>(token, 'GET', '/projects');
	return result.ok ? result.data : null;
}

interface ApiKey {
	name: string;
	api_key: string;
}

/** Get the anon key for a project. */
export async function getAnonKey(token: string, ref: string): Promise<string | null> {
	const result = await supabaseRequest<ApiKey[]>(token, 'GET', `/projects/${ref}/api-keys`);
	if (!result.ok) return null;
	return result.data.find((k) => k.name === 'anon')?.api_key ?? null;
}

export interface ColumnInfo {
	name: string;
	type: string;
	nullable: boolean;
}

export interface TableSchema {
	name: string;
	schema: string;
	columns: ColumnInfo[];
}

/** Fetch table schemas for a project (public schema only). */
export async function getTableSchemas(token: string, ref: string): Promise<TableSchema[]> {
	const result = await supabaseRequest<TableSchema[]>(
		token,
		'GET',
		`/projects/${ref}/database/tables?included_schemas=public`
	);
	if (!result.ok) return [];
	return result.data.filter((t) => t.schema === 'public');
}

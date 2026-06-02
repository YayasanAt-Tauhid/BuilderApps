// Cloudflare Pages Direct Upload helper.
// Uses the CF REST API to create a Pages project (once) and push deployments.

const CF_API = 'https://api.cloudflare.com/client/v4';

const CONTENT_TYPES: Record<string, string> = {
	html: 'text/html; charset=utf-8',
	css: 'text/css',
	js: 'application/javascript',
	mjs: 'application/javascript',
	json: 'application/json',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	ico: 'image/x-icon',
	txt: 'text/plain',
	md: 'text/markdown',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf'
};

function fileContentType(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

async function sha256hex(content: string): Promise<string> {
	const data = new TextEncoder().encode(content);
	const buf = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Create the Pages project if it doesn't already exist. */
export async function ensurePagesProject(
	token: string,
	accountId: string,
	name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const check = await fetch(`${CF_API}/accounts/${accountId}/pages/projects/${name}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (check.ok) return { ok: true };
	if (check.status !== 404) {
		return { ok: false, error: `Unexpected status checking Pages project: ${check.status}` };
	}

	const create = await fetch(`${CF_API}/accounts/${accountId}/pages/projects`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, production_branch: 'main' })
	});
	if (!create.ok) {
		const text = await create.text();
		return {
			ok: false,
			error: `Failed to create Pages project: ${create.status} — ${text.slice(0, 150)}`
		};
	}
	return { ok: true };
}

export interface DeployResult {
	url: string;
	deploymentId: string;
}

/**
 * Deploy files to Cloudflare Pages via the direct-upload API.
 * Each unique file is uploaded once (deduplicated by content hash).
 * Returns the production Pages URL on success.
 */
export async function deployToPages(
	token: string,
	accountId: string,
	projectName: string,
	files: Map<string, string>
): Promise<DeployResult | { error: string }> {
	// Hash every file; deduplicate identical content.
	const manifest: Record<string, string> = {};
	const byHash = new Map<string, { content: string; type: string }>();

	for (const [path, content] of files) {
		const hash = await sha256hex(content);
		manifest[path] = hash;
		if (!byHash.has(hash)) byHash.set(hash, { content, type: fileContentType(path) });
	}

	// Build multipart form: manifest field + one field per unique hash.
	const form = new FormData();
	form.append('manifest', JSON.stringify(manifest));
	for (const [hash, { content, type }] of byHash) {
		form.append(hash, new Blob([content], { type }));
	}

	const res = await fetch(
		`${CF_API}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
		{ method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
	);

	const raw = await res.text();
	if (!res.ok) {
		console.error(`[cf-pages] deploy failed ${res.status}: ${raw.slice(0, 300)}`);
		return { error: `Cloudflare Pages deploy failed (${res.status}): ${raw.slice(0, 150)}` };
	}

	let json: { result?: { id?: string; url?: string; aliases?: string[]; subdomain?: string } };
	try {
		json = JSON.parse(raw);
	} catch {
		return { error: 'Invalid JSON response from Cloudflare API' };
	}

	const dep = json.result;
	if (!dep?.id) return { error: 'No deployment ID in Cloudflare response' };

	// Prefer the stable production alias over the deployment-specific URL.
	const url =
		dep.aliases?.[0] ??
		(dep.subdomain ? `https://${dep.subdomain}.pages.dev` : `https://${projectName}.pages.dev`);

	return { url, deploymentId: dep.id };
}

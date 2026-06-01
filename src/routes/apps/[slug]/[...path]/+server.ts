import { eq, isNull, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { projects } from '$lib/server/db/schema';

const MIME: Record<string, string> = {
	html: 'text/html; charset=utf-8',
	css: 'text/css; charset=utf-8',
	js: 'application/javascript; charset=utf-8',
	json: 'application/json; charset=utf-8',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml; charset=utf-8',
	ico: 'image/x-icon',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	txt: 'text/plain; charset=utf-8'
};

function mime(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	return MIME[ext] ?? 'application/octet-stream';
}

export const GET: RequestHandler = async (event) => {
	const { slug } = event.params;
	const rawPath = event.params.path ?? '';

	const env = getEnv(event);
	const db = getDb(event);

	const rows = await db
		.select({ id: projects.id, cfPagesUrl: projects.cfPagesUrl })
		.from(projects)
		.where(and(eq(projects.slug, slug), isNull(projects.deletedAt)))
		.limit(1);

	const project = rows[0];
	if (!project || !project.cfPagesUrl) {
		return new Response('Not found', { status: 404 });
	}

	// Resolve path: empty or trailing slash → index.html
	const filePath = !rawPath || rawPath.endsWith('/') ? `${rawPath}index.html` : rawPath;
	const r2Key = `published/${project.id}/${filePath}`;

	let obj = await env.BUCKET.get(r2Key);

	// SPA fallback: unknown path → serve index.html
	if (!obj && !filePath.includes('.')) {
		obj = await env.BUCKET.get(`published/${project.id}/index.html`);
	}

	if (!obj) {
		// Try root index.html as last resort
		obj = await env.BUCKET.get(`published/${project.id}/index.html`);
		if (!obj) return new Response('Not found', { status: 404 });
	}

	const body = await obj.arrayBuffer();
	return new Response(body, {
		headers: {
			'Content-Type': mime(filePath),
			'Cache-Control': 'public, max-age=300',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};

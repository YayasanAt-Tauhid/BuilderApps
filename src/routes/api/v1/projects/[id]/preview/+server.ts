import { eq, and, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';

// Sandboxed frontend preview (PRD §4 — Should). Serves the generated HTML entry point
// with local CSS/JS inlined, so a single-document preview renders with styling even though
// only one document is served. This is NOT full-stack execution (ASSUMPTION-2).

function isLocal(ref: string): boolean {
	return !/^([a-z]+:)?\/\//i.test(ref) && !ref.startsWith('data:') && !ref.startsWith('#');
}

/** Inline local <link rel=stylesheet> and <script src> using sibling files in the version. */
function inlineAssets(html: string, files: Map<string, string>): string {
	let out = html;

	// Resolve a referenced path to a stored file (by full path or basename).
	const find = (ref: string): string | undefined => {
		const clean = ref.replace(/^\.?\//, '').split(/[?#]/)[0];
		if (files.has(clean)) return files.get(clean);
		const base = clean.split('/').pop() ?? clean;
		for (const [p, c] of files) if (p === base || p.endsWith('/' + base)) return c;
		return undefined;
	};

	// <link ... rel="stylesheet" ... href="..."> (href may come before or after rel)
	out = out.replace(/<link\b[^>]*>/gi, (tag) => {
		if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
		const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
		if (!href || !isLocal(href)) return tag;
		const css = find(href);
		return css !== undefined ? `<style>\n${css}\n</style>` : tag;
	});

	// <script src="..."></script>
	out = out.replace(
		/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
		(tag, _a, src) => {
			if (!isLocal(src)) return tag;
			const js = find(src);
			return js !== undefined ? `<script>\n${js}\n</script>` : tag;
		}
	);

	return out;
}

export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('Preview');

	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	// Load text for the entry HTML plus any CSS/JS to inline (keep the blob set small).
	const files = new Map<string, string>();
	let entryPath: string | undefined;
	for (const r of rows) {
		const lower = r.path.toLowerCase();
		if (lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js')) {
			const text = await getFileText(env.BUCKET, r.r2Key);
			if (text !== null) files.set(r.path, text);
		}
		if (!entryPath && lower.endsWith('index.html')) entryPath = r.path;
		if (!entryPath && lower.endsWith('.html')) entryPath = r.path;
	}

	const rawHtml =
		(entryPath && files.get(entryPath)) ??
		'<!doctype html><html><body style="font-family:system-ui;padding:2rem">' +
			'<p>No HTML entry point to preview.</p></body></html>';

	const html = inlineAssets(rawHtml, files);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			// Sandboxed (no same-origin: cannot touch the app), but inline CSS/JS and CDN
			// assets are allowed so the generated page renders with styling.
			'Content-Security-Policy': [
				'sandbox allow-scripts allow-forms allow-popups',
				"default-src 'none'",
				"style-src 'unsafe-inline' https:",
				"script-src 'unsafe-inline' https:",
				'img-src data: https:',
				'font-src https: data:',
				'connect-src https:'
			].join('; ')
		}
	});
};

import { eq, and, sql, like } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';

// Sandboxed frontend preview (PRD §4 — Should). Serves a generated HTML entry point
// only; this is NOT full-stack execution (ASSUMPTION-2). Loaded inside a sandboxed iframe.
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('Preview');

	// Prefer an index.html entry point if the generated project ships one.
	const rows = await db
		.select({ r2Key: generatedFiles.r2Key, path: generatedFiles.path })
		.from(generatedFiles)
		.where(
			and(
				eq(generatedFiles.projectId, project.id),
				eq(generatedFiles.version, version),
				like(generatedFiles.path, '%index.html')
			)
		)
		.limit(1);

	const entry = rows[0];
	const html = entry
		? await getFileText(env.BUCKET, entry.r2Key)
		: '<!doctype html><html><body><p>No HTML entry point to preview.</p></body></html>';

	return new Response(html ?? '', {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			// Hardened: the preview cannot script the parent or call same-origin APIs.
			'Content-Security-Policy':
				"sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'",
			'X-Frame-Options': 'SAMEORIGIN'
		}
	});
};

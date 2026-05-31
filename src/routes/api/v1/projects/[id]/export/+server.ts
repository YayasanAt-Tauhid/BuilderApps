import { eq, and, sql } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';

// Download the latest file-version set as a .zip (PRD §5 M6). Owner-only.
// Large bundles can be deferred to the Queue (ASSUMPTION-5); for v1 we bundle inline.
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('Generated files');

	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	const entries: Record<string, Uint8Array> = {};
	for (const row of rows) {
		const content = await getFileText(env.BUCKET, row.r2Key);
		entries[row.path] = strToU8(content ?? '');
	}

	const zipped = zipSync(entries, { level: 6 });
	const filename = `${project.slug}-v${version}.zip`;
	// Copy into a fresh ArrayBuffer-backed view so the body type is unambiguous.
	const body = new Uint8Array(zipped);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Length': String(body.byteLength)
		}
	});
};

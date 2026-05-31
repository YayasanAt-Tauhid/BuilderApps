import { eq, and, sql, asc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok } from '$lib/server/api';
import { requireOwnedProject } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';

// List generated files for the latest version (PRD §5 M5). Metadata only; content is in R2.
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return ok([], { total: 0 });

	const rows = await db
		.select({
			id: generatedFiles.id,
			path: generatedFiles.path,
			version: generatedFiles.version,
			sizeBytes: generatedFiles.sizeBytes,
			contentHash: generatedFiles.contentHash
		})
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)))
		.orderBy(asc(generatedFiles.path));

	return ok(rows, { total: rows.length });
};

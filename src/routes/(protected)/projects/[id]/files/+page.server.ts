import { and, asc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireOwnedProject } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	const files =
		version === 0
			? []
			: await db
					.select({
						id: generatedFiles.id,
						path: generatedFiles.path,
						sizeBytes: generatedFiles.sizeBytes
					})
					.from(generatedFiles)
					.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)))
					.orderBy(asc(generatedFiles.path));

	return { project, version, files };
};

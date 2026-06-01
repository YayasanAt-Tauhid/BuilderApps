import { and, asc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireOwnedProject } from '$lib/server/context';
import { generatedFiles, users } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	const [files, githubRow] = await Promise.all([
		version === 0
			? Promise.resolve([])
			: db
					.select({
						id: generatedFiles.id,
						path: generatedFiles.path,
						sizeBytes: generatedFiles.sizeBytes
					})
					.from(generatedFiles)
					.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)))
					.orderBy(asc(generatedFiles.path)),
		db.select({ githubLogin: users.githubLogin }).from(users).where(eq(users.id, user.id)).limit(1)
	]);

	return { project, version, files, githubLogin: githubRow[0]?.githubLogin ?? null };
};

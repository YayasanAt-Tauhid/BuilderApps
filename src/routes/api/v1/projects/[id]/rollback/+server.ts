import { eq, sql, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generations, generatedFiles, projects } from '$lib/server/db/schema';
import { fileKey, putFile, getFileText } from '$lib/server/storage/r2';
import { ulid } from '$lib/utils/ulid';

export const POST: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const body = await event.request.json().catch(() => null);
	const targetVersion = Number(body?.version);
	if (!Number.isInteger(targetVersion) || targetVersion < 1) return errors.validation();

	// Verify the target version exists for this project.
	const targetFiles = await db
		.select()
		.from(generatedFiles)
		.where(
			and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, targetVersion))
		);
	if (targetFiles.length === 0) return errors.notFound();

	// Calculate the new version number.
	const [{ maxVersion }] = await db
		.select({ maxVersion: sql<number>`coalesce(max(${generations.version}), 0)` })
		.from(generations)
		.where(eq(generations.projectId, project.id));
	const newVersion = Number(maxVersion) + 1;

	const now = Date.now();
	const bucket = env.BUCKET;

	// Create a new generation record for the rollback.
	const generationId = ulid();
	await db.insert(generations).values({
		id: generationId,
		projectId: project.id,
		requestMessageId: ulid(), // synthetic — no user message for a rollback
		status: 'succeeded',
		version: newVersion,
		baseVersion: targetVersion, // lineage: restored from this version
		errorMessage: null,
		startedAt: now,
		finishedAt: now,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});

	// Copy each file from the target version to the new version in R2 + D1.
	await Promise.all(
		targetFiles.map(async (file) => {
			const content = await getFileText(bucket, file.r2Key);
			if (content === null) return; // skip if R2 object missing

			const newKey = fileKey(project.id, newVersion, file.path as string);
			await putFile(bucket, newKey, content);
			await db.insert(generatedFiles).values({
				id: ulid(),
				projectId: project.id,
				generationId,
				path: file.path,
				version: newVersion,
				r2Key: newKey,
				sizeBytes: file.sizeBytes,
				contentHash: file.contentHash,
				createdAt: now,
				updatedAt: now,
				deletedAt: null
			});
		})
	);

	await db
		.update(projects)
		.set({ status: 'ready', updatedAt: now })
		.where(eq(projects.id, project.id));

	return ok({ version: newVersion, restoredFrom: targetVersion, fileCount: targetFiles.length });
};

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireOwnedProject } from '$lib/server/context';
import { generatedFiles, generations, users } from '$lib/server/db/schema';
import { listProjects } from '$lib/server/supabase';

export const load: PageServerLoad = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const latestVersion = Number(latest);

	// Parse ?v= query param; fall back to latest.
	const requestedV = Number(event.url.searchParams.get('v') ?? latestVersion);
	const version = Number.isInteger(requestedV) && requestedV >= 1 ? requestedV : latestVersion;

	const [files, accountRow, history] = await Promise.all([
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
		db.select({ githubLogin: users.githubLogin, supabaseAccessToken: users.supabaseAccessToken })
			.from(users).where(eq(users.id, user.id)).limit(1),
		// All succeeded versions with file count, newest first.
		db
			.select({
				version: generations.version,
				finishedAt: generations.finishedAt,
				fileCount: sql<number>`count(${generatedFiles.id})`
			})
			.from(generations)
			.leftJoin(
				generatedFiles,
				and(
					eq(generatedFiles.generationId, generations.id),
					eq(generatedFiles.projectId, project.id)
				)
			)
			.where(and(eq(generations.projectId, project.id), eq(generations.status, 'succeeded')))
			.groupBy(generations.id)
			.orderBy(desc(generations.version))
	]);

	const githubLogin = accountRow[0]?.githubLogin ?? null;
	const supabaseToken = accountRow[0]?.supabaseAccessToken ?? null;

	// If user connected Supabase, list their projects so they can link one.
	const supabaseProjects = supabaseToken ? (await listProjects(supabaseToken)) ?? [] : [];

	return {
		project,
		version,
		latestVersion,
		files,
		history,
		githubLogin,
		supabaseProjects,
		supabaseConnected: !!supabaseToken
	};
};

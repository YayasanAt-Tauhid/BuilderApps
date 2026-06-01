import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles, generations, users } from '$lib/server/db/schema';
import { listProjects, refreshAccessToken } from '$lib/server/supabase';

export const load: PageServerLoad = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

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
		db.select({
				githubLogin: users.githubLogin,
				supabaseAccessToken: users.supabaseAccessToken,
				supabaseRefreshToken: users.supabaseRefreshToken
			}).from(users).where(eq(users.id, user.id)).limit(1),
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
	let supabaseToken = accountRow[0]?.supabaseAccessToken ?? null;
	const supabaseRefreshToken = accountRow[0]?.supabaseRefreshToken ?? null;

	let supabaseProjects: { id: string; name: string; region: string; status: string }[] = [];
	let supabaseTokenError: string | null = null;

	if (supabaseToken) {
		let projects = await listProjects(supabaseToken);

		// Try refresh if access token is expired/invalid.
		if (
			projects === null &&
			supabaseRefreshToken &&
			env.SUPABASE_CLIENT_ID &&
			env.SUPABASE_CLIENT_SECRET
		) {
			const refreshed = await refreshAccessToken(
				supabaseRefreshToken,
				env.SUPABASE_CLIENT_ID,
				env.SUPABASE_CLIENT_SECRET
			);
			if (refreshed) {
				supabaseToken = refreshed.accessToken;
				await db
					.update(users)
					.set({
						supabaseAccessToken: refreshed.accessToken,
						supabaseRefreshToken: refreshed.refreshToken,
						updatedAt: Date.now()
					})
					.where(eq(users.id, user.id));
				projects = await listProjects(supabaseToken);
			}
		}

		if (projects === null) {
			supabaseTokenError = 'token_error';
		} else {
			supabaseProjects = projects;
		}
	}

	return {
		project,
		version,
		latestVersion,
		files,
		history,
		githubLogin,
		supabaseProjects,
		supabaseConnected: !!supabaseToken,
		supabaseTokenError,
		cfPagesEnabled: !!(env.CLOUDFLARE_PAGES_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID)
	};
};

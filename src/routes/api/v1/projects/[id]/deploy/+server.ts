import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles, projects } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';

function isSvelteKitProject(paths: string[]): boolean {
	return paths.some(
		(p) => p.endsWith('.svelte') || p === 'svelte.config.js' || p.startsWith('src/routes/')
	);
}

export const POST: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	// Latest version
	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('No generated files to deploy');

	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	if (rows.length === 0) return errors.notFound('No files found');

	// SvelteKit projects: build runs in GitHub Actions → dist/ uploaded to R2 → served at /apps/{slug}/.
	if (isSvelteKitProject(rows.map((r) => r.path))) {
		const repoUrl = project.githubLastCommitSha
			? `https://github.com/${project.githubLastCommitSha.slice(0, 0)}${project.slug}`
			: null;
		const liveUrl = project.cfPagesUrl ?? null;
		return ok({
			sveltekit: true,
			message: liveUrl
				? 'Project is live. Push new changes via GitHub Sync to redeploy.'
				: 'Sync to GitHub first — GitHub Actions will build and deploy automatically to R2.',
			repoUrl,
			liveUrl,
			version
		});
	}

	// Plain HTML project — publish files to R2 under published/{projectId}/{path}
	await Promise.all(
		rows.map(async (row) => {
			const content = await getFileText(env.BUCKET, row.r2Key);
			if (content !== null) {
				await env.BUCKET.put(`published/${project.id}/${row.path}`, content);
			}
		})
	);

	const appUrl = env.APP_URL ?? 'https://builderpro.yayasan-attauhid-1.workers.dev';
	const url = `${appUrl}/apps/${project.slug}/`;

	await db
		.update(projects)
		.set({ cfPagesUrl: url, updatedAt: Date.now() })
		.where(eq(projects.id, project.id));

	return ok({ url, version });
};

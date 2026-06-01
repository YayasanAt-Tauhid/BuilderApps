import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles, projects } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';
import { ensurePagesProject, deployToPages } from '$lib/server/cloudflare-pages';

export const POST: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	if (!env.CLOUDFLARE_PAGES_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
		console.error('[deploy] CLOUDFLARE_PAGES_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not configured');
		return errors.internal();
	}

	// Latest version
	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('No generated files to deploy');

	// Load file metadata from DB then content from R2
	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	const files = new Map<string, string>();
	await Promise.all(
		rows.map(async (row) => {
			const content = await getFileText(env.BUCKET, row.r2Key);
			if (content !== null) files.set(row.path, content);
		})
	);

	if (files.size === 0) return errors.notFound('No files found in R2');

	// CF Pages project name: bp-{projectId lowercase}, stable + unique per project
	const pagesName = `bp-${project.id.toLowerCase()}`;
	const token = env.CLOUDFLARE_PAGES_API_TOKEN;
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;

	const ensureResult = await ensurePagesProject(token, accountId, pagesName);
	if (!ensureResult.ok) {
		console.error(`[deploy] ensurePagesProject: ${ensureResult.error}`);
		return errors.internal();
	}

	const result = await deployToPages(token, accountId, pagesName, files);
	if ('error' in result) {
		console.error(`[deploy] deployToPages: ${result.error}`);
		return errors.internal();
	}

	await db
		.update(projects)
		.set({ cfPagesUrl: result.url, updatedAt: Date.now() })
		.where(eq(projects.id, project.id));

	return ok({ url: result.url, deploymentId: result.deploymentId, version });
};

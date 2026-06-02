import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles, projects, users } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';
import { pushFilesToRepo, enableGithubPages, registerWebhook } from '$lib/server/github';

// Push the latest generated files to a GitHub repo named after the project slug.
export const POST: RequestHandler = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);

	// GitHub token lives in the users table (not in the session cache).
	const rows = await db
		.select({
			githubAccessToken: users.githubAccessToken,
			githubLogin: users.githubLogin
		})
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const { githubAccessToken, githubLogin } = rows[0] ?? {};
	if (!githubAccessToken || !githubLogin) {
		return errors.forbidden();
	}

	// Determine latest generated version.
	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('No generated files to sync.');

	const fileRows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	// Fetch content from R2.
	const env = getEnv(event);
	const fileContents = await Promise.all(
		fileRows.map(async (f) => ({
			path: f.path,
			content: (await getFileText(env.BUCKET, f.r2Key)) ?? ''
		}))
	);

	// Exclude .github/ — workflow files require the `workflow` OAuth scope.
	const pushableFiles = fileContents.filter((f) => !f.path.startsWith('.github/'));

	const result = await pushFilesToRepo(
		githubAccessToken,
		githubLogin,
		project.slug,
		pushableFiles,
		`BuilderPro: ${project.name} v${version}`
	);

	if ('error' in result) {
		console.error(`[github/sync] pushFilesToRepo failed: ${result.error}`);
		return errors.badRequest(result.error);
	}

	// Enable GitHub Pages and register webhook (if not already done).
	const [pages, webhookResult] = await Promise.all([
		enableGithubPages(githubAccessToken, githubLogin, project.slug, 'main'),
		project.githubWebhookId
			? Promise.resolve(null)
			: registerWebhook(
					githubAccessToken,
					githubLogin,
					project.slug,
					`${env.APP_URL ?? ''}/api/v1/webhooks/github`,
					env.GITHUB_WEBHOOK_SECRET ?? ''
				)
	]);

	const pagesUrl = 'pagesUrl' in pages ? pages.pagesUrl : null;
	const webhookId =
		webhookResult && 'id' in webhookResult ? webhookResult.id : project.githubWebhookId;

	await db
		.update(projects)
		.set({
			githubSyncedVersion: version,
			githubLastCommitSha: result.commitSha,
			...(pagesUrl ? { githubPagesUrl: pagesUrl } : {}),
			...(webhookId ? { githubWebhookId: webhookId } : {}),
			updatedAt: Date.now()
		})
		.where(eq(projects.id, project.id));

	return ok({ repoUrl: result.repoUrl, pagesUrl, syncedVersion: version, commitSha: result.commitSha });
};

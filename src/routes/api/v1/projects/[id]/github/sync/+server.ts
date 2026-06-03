import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles, projects, users } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';
import { pushFilesToRepo, registerWebhook, setRepoSecrets } from '$lib/server/github';
import { buildTemplateFiles } from '$lib/server/ai/templates';

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

	// Always inject the latest deploy.yml from template — overrides any stale version in R2.
	const latestTemplate = buildTemplateFiles(project.slug);
	const latestDeployYml = latestTemplate.get('.github/workflows/deploy.yml');
	if (latestDeployYml) {
		const idx = fileContents.findIndex((f) => f.path === '.github/workflows/deploy.yml');
		if (idx >= 0) fileContents[idx].content = latestDeployYml;
		else fileContents.push({ path: '.github/workflows/deploy.yml', content: latestDeployYml });
	}

	const result = await pushFilesToRepo(
		githubAccessToken,
		githubLogin,
		project.slug,
		fileContents,
		`BuilderPro: ${project.name} v${version}`
	);

	if ('error' in result) {
		console.error(`[github/sync] pushFilesToRepo failed: ${result.error}`);
		return errors.badRequest(result.error);
	}

	// Register webhook (if not already done). GitHub Pages is no longer used — R2 serves the dist.
	const webhookResult = project.githubWebhookId
		? null
		: await registerWebhook(
				githubAccessToken,
				githubLogin,
				project.slug,
				`${env.APP_URL ?? ''}/api/v1/webhooks/github`,
				env.GITHUB_WEBHOOK_SECRET ?? ''
			);

	const webhookId =
		webhookResult && 'id' in webhookResult ? webhookResult.id : project.githubWebhookId;

	// Auto-inject GitHub Actions secrets so the CI pipeline can upload dist/ to R2.
	const deploySecrets: Record<string, string> = {};
	if (env.CLOUDFLARE_ACCOUNT_ID) deploySecrets['CF_R2_ACCOUNT_ID'] = env.CLOUDFLARE_ACCOUNT_ID;
	if (env.R2_ACCESS_KEY_ID) deploySecrets['CF_R2_ACCESS_KEY_ID'] = env.R2_ACCESS_KEY_ID;
	if (env.R2_SECRET_ACCESS_KEY) deploySecrets['CF_R2_SECRET_ACCESS_KEY'] = env.R2_SECRET_ACCESS_KEY;
	if (env.R2_BUCKET_NAME) deploySecrets['CF_R2_BUCKET_NAME'] = env.R2_BUCKET_NAME;
	deploySecrets['PROJECT_ID'] = project.id;
	deploySecrets['PROJECT_SLUG'] = project.slug;
	if (env.APP_URL) deploySecrets['BUILDERPRO_WEBHOOK_URL'] = `${env.APP_URL}/api/v1/webhooks/build-complete`;
	if (env.BUILDERPRO_DEPLOY_SECRET) deploySecrets['BUILDERPRO_DEPLOY_SECRET'] = env.BUILDERPRO_DEPLOY_SECRET;
	if (project.supabaseUrl) deploySecrets['VITE_SUPABASE_URL'] = project.supabaseUrl;
	if (project.supabaseAnonKey) deploySecrets['VITE_SUPABASE_ANON_KEY'] = project.supabaseAnonKey;

	console.log('[github/sync] deploySecrets keys:', Object.keys(deploySecrets));
	console.log('[github/sync] env check:', {
		R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID ? `set(${env.R2_ACCESS_KEY_ID.length})` : 'MISSING',
		R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY ? `set(${env.R2_SECRET_ACCESS_KEY.length})` : 'MISSING',
		CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ? `set(${env.CLOUDFLARE_ACCOUNT_ID.length})` : 'MISSING',
		APP_URL: env.APP_URL || 'MISSING',
		BUILDERPRO_DEPLOY_SECRET: env.BUILDERPRO_DEPLOY_SECRET ? 'set' : 'MISSING',
	});

	const failedSecrets = Object.keys(deploySecrets).length > 0
		? await setRepoSecrets(githubAccessToken, githubLogin, project.slug, deploySecrets)
		: [];

	if (failedSecrets.length > 0) {
		console.warn(`[github/sync] Failed to set secrets: ${failedSecrets.join(', ')}`);
	}

	await db
		.update(projects)
		.set({
			githubSyncedVersion: version,
			githubLastCommitSha: result.commitSha,
			...(webhookId ? { githubWebhookId: webhookId } : {}),
			updatedAt: Date.now()
		})
		.where(eq(projects.id, project.id));

	return ok({
		repoUrl: result.repoUrl,
		syncedVersion: version,
		commitSha: result.commitSha,
		deploySecretsSet: failedSecrets.length === 0,
		failedSecrets
	});
};

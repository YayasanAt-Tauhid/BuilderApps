import { eq, and, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { projects, generations, generatedFiles, users } from '$lib/server/db/schema';
import { verifyWebhookSignature, fetchRepoFilesAtCommit } from '$lib/server/github';
import { fileKey, putFile, contentHash as computeHash } from '$lib/server/storage/r2';
import { ulid } from '$lib/utils/ulid';

interface PushPayload {
	ref: string;
	after: string;
	repository: { name: string; default_branch: string; owner: { login: string } };
}

export const POST: RequestHandler = async (event) => {
	const env = getEnv(event);
	const secret = env.GITHUB_WEBHOOK_SECRET;
	if (!secret) return new Response('Webhook not configured', { status: 500 });

	// Read raw body first (can only be consumed once) then verify signature.
	const body = await event.request.text();
	const signature = event.request.headers.get('X-Hub-Signature-256') ?? '';
	if (!(await verifyWebhookSignature(body, signature, secret))) {
		return new Response('Invalid signature', { status: 401 });
	}

	// Only handle push events.
	if (event.request.headers.get('X-GitHub-Event') !== 'push') {
		return new Response('OK', { status: 200 });
	}

	const payload = JSON.parse(body) as PushPayload;
	const { ref, after: commitSha, repository } = payload;

	// Only process pushes to the default branch.
	if (ref !== `refs/heads/${repository.default_branch}`) {
		return new Response('OK', { status: 200 });
	}

	const db = getDb(event);
	const ownerLogin = repository.owner.login;
	const repoSlug = repository.name;

	// Find the project by matching githubLogin + slug.
	const [row] = await db
		.select({
			id: projects.id,
			userId: projects.userId,
			name: projects.name,
			slug: projects.slug,
			githubLastCommitSha: projects.githubLastCommitSha,
			maxVersion: sql<number>`coalesce(max(${generations.version}), 0)`
		})
		.from(projects)
		.innerJoin(users, and(eq(users.id, projects.userId), eq(users.githubLogin, ownerLogin)))
		.leftJoin(generations, eq(generations.projectId, projects.id))
		.where(eq(projects.slug, repoSlug))
		.groupBy(projects.id)
		.limit(1);

	if (!row) return new Response('OK', { status: 200 });

	// Loop prevention: skip if this commit was pushed by BuilderPro itself.
	if (row.githubLastCommitSha === commitSha) return new Response('OK', { status: 200 });

	// Get the user's GitHub token to fetch file contents.
	const [userRow] = await db
		.select({ githubAccessToken: users.githubAccessToken })
		.from(users)
		.where(eq(users.id, row.userId))
		.limit(1);

	if (!userRow?.githubAccessToken) return new Response('OK', { status: 200 });

	// Fetch all files from GitHub at this commit.
	const files = await fetchRepoFilesAtCommit(
		userRow.githubAccessToken,
		ownerLogin,
		repoSlug,
		commitSha
	);
	if ('error' in files || files.length === 0) return new Response('OK', { status: 200 });

	const newVersion = Number(row.maxVersion) + 1;
	const now = Date.now();
	const generationId = ulid();

	// Create a synthetic generation record for this external push.
	await db.insert(generations).values({
		id: generationId,
		projectId: row.id,
		requestMessageId: ulid(),
		status: 'succeeded',
		version: newVersion,
		baseVersion: Number(row.maxVersion) > 0 ? Number(row.maxVersion) : null,
		errorMessage: null,
		startedAt: now,
		finishedAt: now,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});

	// Upload files to R2 and insert records.
	await Promise.all(
		files.map(async (f) => {
			const key = fileKey(row.id, newVersion, f.path);
			await putFile(env.BUCKET, key, f.content);
			const hash = await computeHash(f.content);
			await db.insert(generatedFiles).values({
				id: ulid(),
				projectId: row.id,
				generationId,
				path: f.path,
				version: newVersion,
				r2Key: key,
				sizeBytes: new TextEncoder().encode(f.content).length,
				contentHash: hash,
				createdAt: now,
				updatedAt: now,
				deletedAt: null
			});
		})
	);

	// Update project with new sync metadata.
	await db
		.update(projects)
		.set({
			status: 'ready',
			githubSyncedVersion: newVersion,
			githubLastCommitSha: commitSha,
			updatedAt: now
		})
		.where(eq(projects.id, row.id));

	return new Response('OK', { status: 200 });
};

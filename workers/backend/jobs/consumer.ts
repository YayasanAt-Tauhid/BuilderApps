import { and, eq, lt, isNotNull, inArray } from 'drizzle-orm';
import { zipSync as fflateZip, strToU8 } from 'fflate';
import { createDb } from '../../../src/lib/server/db';
import { projects, generatedFiles } from '../../../src/lib/server/db/schema';
import { getFileText, exportKey, putFile } from '../../../src/lib/server/storage/r2';
import type { Env } from '../../../src/lib/server/env';
import type { QueueJob } from '../../../src/lib/server/jobs/types';

// Queue consumer (PRD §11.4). Processes deferred/batch work enqueued by cron or the
// app worker's /export route. Failures throw → the Queue retries (max_retries).
export async function handleQueue(
	batch: MessageBatch<QueueJob>,
	env: Env,
	_ctx: ExecutionContext
): Promise<void> {
	const db = createDb(env.DB);
	for (const message of batch.messages) {
		try {
			await processJob(db, env, message.body);
			message.ack();
		} catch (err) {
			console.error('queue job failed', message.body.type, err);
			message.retry();
		}
	}
}

async function processJob(db: ReturnType<typeof createDb>, env: Env, job: QueueJob): Promise<void> {
	switch (job.type) {
		case 'cleanup_soft_deleted':
			await cleanupSoftDeleted(db, env, job.olderThanMs);
			return;
		case 'usage_rollover':
			// UsageRecords are keyed by period date; rollover is implicit. Reserved for
			// future aggregation/archival. No-op for v1.
			return;
		case 'export':
			await bundleExport(db, env, job.projectId, job.version);
			return;
	}
}

async function cleanupSoftDeleted(
	db: ReturnType<typeof createDb>,
	env: Env,
	olderThanMs: number
): Promise<void> {
	const cutoff = Date.now() - olderThanMs;
	const stale = await db
		.select({ id: projects.id })
		.from(projects)
		.where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff)));

	if (stale.length === 0) return;
	const projectIds = stale.map((p) => p.id);

	const files = await db
		.select({ id: generatedFiles.id, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(inArray(generatedFiles.projectId, projectIds));

	const keys = files.map((f) => f.r2Key);
	if (keys.length > 0) await env.BUCKET.delete(keys);

	await db.delete(generatedFiles).where(inArray(generatedFiles.projectId, projectIds));
	await db.delete(projects).where(inArray(projects.id, projectIds));
}

async function bundleExport(
	db: ReturnType<typeof createDb>,
	env: Env,
	projectId: string,
	version: number
): Promise<void> {
	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, projectId), eq(generatedFiles.version, version)));

	const entries: Record<string, Uint8Array> = {};
	for (const row of rows) {
		entries[row.path] = strToU8((await getFileText(env.BUCKET, row.r2Key)) ?? '');
	}
	const zipped = fflateZip(entries, { level: 6 });
	await putFile(env.BUCKET, exportKey(projectId, version), zipped, 'application/zip');
}

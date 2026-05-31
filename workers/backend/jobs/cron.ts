import type { Env } from '../../../src/lib/server/env';
import type { QueueJob } from '../../../src/lib/server/jobs/types';
import { periodDate } from '../../../src/lib/server/usage';

// Cron scheduled() handler (PRD §11.4): enqueues deferred work onto the Queue.
// The consumer (consumer.ts) executes it. No public endpoint (ASSUMPTION-5).
export async function handleScheduled(
	_controller: ScheduledController,
	env: Env,
	_ctx: ExecutionContext
): Promise<void> {
	const jobs: QueueJob[] = [
		// Purge soft-deleted projects + orphaned R2 objects older than 7 days.
		{ type: 'cleanup_soft_deleted', olderThanMs: 7 * 24 * 60 * 60 * 1000 },
		// Roll the usage accounting period forward.
		{ type: 'usage_rollover', periodDate: periodDate() }
	];
	await env.QUEUE.sendBatch(jobs.map((body) => ({ body })));
}

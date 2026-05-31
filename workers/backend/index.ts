import { RealtimeHub } from './realtime/hub';
import { handleQueue } from './jobs/consumer';
import { handleScheduled } from './jobs/cron';
import type { Env } from '../../src/lib/server/env';
import type { QueueJob } from '../../src/lib/server/jobs/types';

// Backend Worker entry point (PRD §11.0). Exports the Durable Object class and the
// queue + scheduled handlers. It serves no public HTTP traffic.
export { RealtimeHub };

export default {
	async fetch(): Promise<Response> {
		return new Response('builderpro-backend: no public HTTP surface.', { status: 404 });
	},
	queue(batch: MessageBatch<QueueJob>, env: Env, ctx: ExecutionContext): Promise<void> {
		return handleQueue(batch, env, ctx);
	},
	scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		return handleScheduled(controller, env, ctx);
	}
} satisfies ExportedHandler<Env, QueueJob>;

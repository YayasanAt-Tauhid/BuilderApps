import type {
	D1Database,
	KVNamespace,
	R2Bucket,
	Queue,
	DurableObjectNamespace,
	Fetcher
} from '@cloudflare/workers-types';
import type { SessionUser } from '$lib/server/auth';
import type { QueueJob } from '$lib/server/jobs/types';

declare global {
	namespace App {
		interface Error {
			code?: string;
		}

		interface Locals {
			user: SessionUser | null;
			sessionId: string | null;
		}

		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface PageData {}

		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

/** Cloudflare bindings shared by both workers (app + backend). See PRD §11.1. */
export interface Env {
	DB: D1Database;
	KV: KVNamespace;
	BUCKET: R2Bucket;
	QUEUE: Queue<QueueJob>;
	DO_REALTIME: DurableObjectNamespace;
	ASSETS: Fetcher;
	/** Backend worker only — the app worker does not hold this secret. */
	OPENROUTER_API_KEY?: string;
}

export {};

import type {
	D1Database,
	KVNamespace,
	R2Bucket,
	Queue,
	DurableObjectNamespace,
	Fetcher
} from '@cloudflare/workers-types';
import type { QueueJob } from './jobs/types';

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

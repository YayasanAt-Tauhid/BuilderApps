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
	/** GitHub OAuth App credentials (app worker — needed for the OAuth callback flow). */
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	/** Supabase OAuth App credentials (app worker). */
	SUPABASE_CLIENT_ID?: string;
	SUPABASE_CLIENT_SECRET?: string;
	/** Shared between app + backend workers for webhook signature verification. */
	GITHUB_WEBHOOK_SECRET?: string;
	/** Public base URL of the app worker, used to register webhook URLs. */
	APP_URL?: string;
	/** Cloudflare Pages deployment (app worker — for one-click deploy feature). */
	CLOUDFLARE_PAGES_API_TOKEN?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
}

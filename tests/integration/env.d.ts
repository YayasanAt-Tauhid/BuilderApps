/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types';

// Type the bindings exposed to integration tests via `cloudflare:test`.
declare namespace Cloudflare {
	interface Env {
		DB: D1Database;
		KV: KVNamespace;
		BUCKET: R2Bucket;
		QUEUE: Queue;
	}
}

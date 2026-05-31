import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export type DB = DrizzleD1Database<typeof schema>;

/**
 * Drizzle factory. Both workers call this with their `DB` binding.
 * Uses relative imports throughout so the backend bundler can resolve `src/lib/server/**`.
 */
export function createDb(d1: D1Database): DB {
	return drizzle(d1, { schema });
}

export { schema };

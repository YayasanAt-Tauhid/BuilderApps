import { eq, and, sql } from 'drizzle-orm';
import type { DB } from './db';
import { usageRecords } from './db/schema';
import { ulid } from '../utils/ulid';

// Per-user daily AI usage metering + quota enforcement (PRD §8 UsageRecord, ASSUMPTION-9).
// DAILY_TOKEN_QUOTA is a placeholder default (QUESTION-6) — the real monthly budget is a
// business input. Override via the env if needed at deploy time.
export const DAILY_TOKEN_QUOTA = 200_000; // input + output tokens per UTC day

export function periodDate(now: number = Date.now()): string {
	return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export interface UsageSummary {
	periodDate: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	requestCount: number;
	quota: number;
	remaining: number;
}

export async function getUsage(db: DB, userId: string, now = Date.now()): Promise<UsageSummary> {
	const date = periodDate(now);
	const rows = await db
		.select()
		.from(usageRecords)
		.where(and(eq(usageRecords.userId, userId), eq(usageRecords.periodDate, date)))
		.limit(1);

	const r = rows[0];
	const inputTokens = r?.inputTokens ?? 0;
	const outputTokens = r?.outputTokens ?? 0;
	const totalTokens = inputTokens + outputTokens;
	return {
		periodDate: date,
		inputTokens,
		outputTokens,
		totalTokens,
		requestCount: r?.requestCount ?? 0,
		quota: DAILY_TOKEN_QUOTA,
		remaining: Math.max(0, DAILY_TOKEN_QUOTA - totalTokens)
	};
}

/** True if the user still has quota headroom for the current period. */
export async function hasQuota(db: DB, userId: string, now = Date.now()): Promise<boolean> {
	const usage = await getUsage(db, userId, now);
	return usage.remaining > 0;
}

/** Upsert token usage for the user's current period. Called after a generation completes. */
export async function recordUsage(
	db: DB,
	userId: string,
	tokens: { input: number; output: number },
	now = Date.now()
): Promise<void> {
	const date = periodDate(now);
	await db
		.insert(usageRecords)
		.values({
			id: ulid(),
			userId,
			periodDate: date,
			inputTokens: tokens.input,
			outputTokens: tokens.output,
			requestCount: 1,
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		})
		.onConflictDoUpdate({
			target: [usageRecords.userId, usageRecords.periodDate],
			set: {
				inputTokens: sql`${usageRecords.inputTokens} + ${tokens.input}`,
				outputTokens: sql`${usageRecords.outputTokens} + ${tokens.output}`,
				requestCount: sql`${usageRecords.requestCount} + 1`,
				updatedAt: now
			}
		});
}

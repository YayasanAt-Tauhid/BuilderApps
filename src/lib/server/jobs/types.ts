// Shared QueueJob contract — imported by the app worker (producer) and the
// backend worker (consumer + cron). See PRD §11.4.

export type QueueJob =
	| { type: 'export'; projectId: string; userId: string; version: number }
	| { type: 'cleanup_soft_deleted'; olderThanMs: number }
	| { type: 'usage_rollover'; periodDate: string };

export type QueueJobType = QueueJob['type'];

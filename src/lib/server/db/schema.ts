import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// PRD §8 / §11.2 conventions:
//  - id = text (ULID), never autoincrement
//  - timestamps = integer (Unix ms), never ISO strings
//  - soft delete = nullable deletedAt
//  - every table has createdAt, updatedAt, deletedAt

const timestamps = {
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at')
};

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	displayName: text('display_name'),
	role: text('role', { enum: ['user', 'admin'] })
		.notNull()
		.default('user'),
	locale: text('locale').notNull().default('en'),
	theme: text('theme', { enum: ['system', 'light', 'dark'] })
		.notNull()
		.default('system'),
	githubAccessToken: text('github_access_token'),
	githubLogin: text('github_login'),
	...timestamps
});

export const sessions = sqliteTable('sessions', {
	// id = SHA-256 hash of the session token (source of truth in D1, cached in KV).
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: integer('expires_at').notNull(),
	...timestamps
});

export const projects = sqliteTable(
	'projects',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		description: text('description'),
		status: text('status', { enum: ['draft', 'generating', 'ready', 'error'] })
			.notNull()
			.default('draft'),
		githubPagesUrl: text('github_pages_url'),
		githubSyncedVersion: integer('github_synced_version'),
		githubLastCommitSha: text('github_last_commit_sha'),
		githubWebhookId: integer('github_webhook_id'),
		...timestamps
	},
	(t) => [uniqueIndex('projects_user_slug_idx').on(t.userId, t.slug)]
);

export const messages = sqliteTable(
	'messages',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id),
		role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
		content: text('content').notNull(),
		tokenCount: integer('token_count'),
		modelUsed: text('model_used'),
		generationId: text('generation_id'),
		...timestamps
	},
	(t) => [index('messages_project_idx').on(t.projectId)]
);

export const generations = sqliteTable(
	'generations',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id),
		requestMessageId: text('request_message_id').notNull(),
		status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] })
			.notNull()
			.default('queued'),
		version: integer('version').notNull(),
		errorMessage: text('error_message'),
		startedAt: integer('started_at'),
		finishedAt: integer('finished_at'),
		...timestamps
	},
	(t) => [index('generations_project_idx').on(t.projectId)]
);

export const generatedFiles = sqliteTable(
	'generated_files',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id),
		generationId: text('generation_id')
			.notNull()
			.references(() => generations.id),
		path: text('path').notNull(),
		version: integer('version').notNull(),
		r2Key: text('r2_key').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		contentHash: text('content_hash').notNull(),
		...timestamps
	},
	(t) => [index('generated_files_project_version_idx').on(t.projectId, t.version)]
);

export const usageRecords = sqliteTable(
	'usage_records',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		periodDate: text('period_date').notNull(), // YYYY-MM-DD (UTC)
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		requestCount: integer('request_count').notNull().default(0),
		...timestamps
	},
	(t) => [uniqueIndex('usage_user_period_idx').on(t.userId, t.periodDate)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Generation = typeof generations.$inferSelect;
export type GeneratedFile = typeof generatedFiles.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;

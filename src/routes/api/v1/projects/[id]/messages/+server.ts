import { eq, asc, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { createMessageSchema, parse } from '$lib/schemas';
import { messages, generations, projects, users } from '$lib/server/db/schema';
import { hasQuota } from '$lib/server/usage';
import { ulid } from '$lib/utils/ulid';
import { DEFAULT_MODEL } from '$lib/server/ai';
import { getTableSchemas } from '$lib/server/supabase';
import type { SupabaseContext } from '$lib/server/ai/prompts';

export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.projectId, project.id))
		.orderBy(asc(messages.createdAt));
	return ok(rows, { total: rows.length });
};

export const POST: RequestHandler = async (event) => {
	const { db, user, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const body = await event.request.json().catch(() => null);
	const result = parse(createMessageSchema, body);
	if (!result.success) return errors.validation();

	// Enforce the per-user daily quota BEFORE invoking the model (PRD §5 M4 / §8).
	if (!(await hasQuota(db, user.id))) return errors.quotaExceeded();

	const now = Date.now();

	// Persist the user prompt.
	const userMessage = {
		id: ulid(),
		projectId: project.id,
		role: 'user' as const,
		content: result.data.content,
		tokenCount: null,
		modelUsed: null,
		generationId: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.insert(messages).values(userMessage);

	// Next version = current max + 1.
	const [{ maxVersion }] = await db
		.select({ maxVersion: sql<number>`coalesce(max(${generations.version}), 0)` })
		.from(generations)
		.where(eq(generations.projectId, project.id));

	const generation = {
		id: ulid(),
		projectId: project.id,
		requestMessageId: userMessage.id,
		status: 'running' as const,
		version: Number(maxVersion) + 1,
		baseVersion: Number(maxVersion) > 0 ? Number(maxVersion) : null,
		errorMessage: null,
		startedAt: now,
		finishedAt: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.insert(generations).values(generation);
	await db.update(projects).set({ status: 'generating', updatedAt: now }).where(eq(projects.id, project.id));

	// Fetch Supabase context if this project is linked to a Supabase project.
	let supabaseCtx: SupabaseContext | undefined;
	if (project.supabaseUrl && project.supabaseAnonKey && project.supabaseProjectRef) {
		const [userRow] = await db
			.select({ supabaseAccessToken: users.supabaseAccessToken })
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		if (userRow?.supabaseAccessToken) {
			const tables = await getTableSchemas(userRow.supabaseAccessToken, project.supabaseProjectRef);
			supabaseCtx = {
				url: project.supabaseUrl,
				anonKey: project.supabaseAnonKey,
				tables: tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ name: c.name, type: c.type })) }))
			};
		}
	}

	// Kick the per-project Durable Object to run + stream the generation (PRD §11.4).
	const stub = env.DO_REALTIME.get(env.DO_REALTIME.idFromName(project.id));
	event.platform?.ctx.waitUntil(
		stub.fetch('https://do/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				generationId: generation.id,
				projectId: project.id,
				userId: user.id,
				version: generation.version,
				prevVersion: Number(maxVersion) > 0 ? Number(maxVersion) : null,
				prompt: result.data.content,
				model: DEFAULT_MODEL,
				...(supabaseCtx ? { supabase: supabaseCtx } : {})
			})
		})
	);

	return ok({ message: userMessage, generation }, undefined, 201);
};

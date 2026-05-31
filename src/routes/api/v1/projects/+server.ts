import { eq, and, isNull, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { getDb, requireUser } from '$lib/server/context';
import { createProjectSchema, parse } from '$lib/schemas';
import { projects } from '$lib/server/db/schema';
import { ulid } from '$lib/utils/ulid';
import { uniqueSlug } from '$lib/utils/slug';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return errors.unauthorized();
	const user = requireUser(event);
	const db = getDb(event);
	const rows = await db
		.select()
		.from(projects)
		.where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
		.orderBy(desc(projects.updatedAt));
	return ok(rows, { total: rows.length });
};

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return errors.unauthorized();
	const user = requireUser(event);

	const body = await event.request.json().catch(() => null);
	const result = parse(createProjectSchema, body);
	if (!result.success) return errors.validation();

	const db = getDb(event);
	const now = Date.now();
	const project = {
		id: ulid(),
		userId: user.id,
		name: result.data.name,
		slug: uniqueSlug(result.data.name),
		description: result.data.description ?? null,
		status: 'draft' as const,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.insert(projects).values(project);
	return ok(project, undefined, 201);
};

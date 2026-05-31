import { eq, and, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { getDb, requireUser } from '$lib/server/context';
import { generations, projects } from '$lib/server/db/schema';

// Generation status (PRD §9). Ownership is enforced via the project join.
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return errors.unauthorized();
	const user = requireUser(event);
	const db = getDb(event);

	const rows = await db
		.select({ generation: generations, ownerId: projects.userId })
		.from(generations)
		.innerJoin(projects, eq(generations.projectId, projects.id))
		.where(and(eq(generations.id, event.params.id), isNull(projects.deletedAt)))
		.limit(1);

	const row = rows[0];
	if (!row) return errors.notFound('Generation');
	if (row.ownerId !== user.id) return errors.forbidden();
	return ok(row.generation);
};

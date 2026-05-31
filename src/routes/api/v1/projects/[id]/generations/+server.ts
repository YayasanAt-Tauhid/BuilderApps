import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok } from '$lib/server/api';
import { requireOwnedProject } from '$lib/server/context';
import { generations } from '$lib/server/db/schema';

// Generation history (PRD §4 — Should).
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const rows = await db
		.select()
		.from(generations)
		.where(eq(generations.projectId, project.id))
		.orderBy(desc(generations.version));
	return ok(rows, { total: rows.length });
};

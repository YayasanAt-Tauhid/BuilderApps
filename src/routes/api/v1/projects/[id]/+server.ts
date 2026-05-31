import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { ok, errors } from '$lib/server/api';
import { requireOwnedProject } from '$lib/server/context';
import { updateProjectSchema, parse } from '$lib/schemas';
import { projects } from '$lib/server/db/schema';

export const GET: RequestHandler = async (event) => {
	const { project } = await requireOwnedProject(event, event.params.id);
	return ok(project);
};

export const PATCH: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);

	const body = await event.request.json().catch(() => null);
	const result = parse(updateProjectSchema, body);
	if (!result.success) return errors.validation();

	const now = Date.now();
	const patch = {
		...(result.data.name !== undefined ? { name: result.data.name } : {}),
		...(result.data.description !== undefined ? { description: result.data.description } : {}),
		updatedAt: now
	};
	await db.update(projects).set(patch).where(eq(projects.id, project.id));
	return ok({ ...project, ...patch });
};

export const DELETE: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const now = Date.now();
	// Soft delete (PRD §5 M3). Cron + Queue purge R2 content later (ASSUMPTION-5).
	await db
		.update(projects)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(projects.id, project.id));
	return ok({ success: true });
};

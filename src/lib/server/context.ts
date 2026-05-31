import { error } from '@sveltejs/kit';
import { eq, and, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import type { Env } from './env';
import { createDb, type DB } from './db';
import { projects, type Project } from './db/schema';
import type { SessionUser } from './auth';

// Shared helpers for API (+server.ts) and page (+page.server.ts) handlers.

export function getEnv(event: RequestEvent): Env {
	if (!event.platform?.env) {
		// Running outside the Workers runtime (e.g. `vite dev` without bindings).
		throw error(500, 'Platform bindings unavailable.');
	}
	return event.platform.env;
}

export function getDb(event: RequestEvent): DB {
	return createDb(getEnv(event).DB);
}

/** Throws 401 if there is no authenticated user. */
export function requireUser(event: RequestEvent): SessionUser {
	if (!event.locals.user) throw error(401, 'Authentication required.');
	return event.locals.user;
}

/** Loads a project the current user owns, or throws 403/404. Excludes soft-deleted rows. */
export async function requireOwnedProject(
	event: RequestEvent,
	projectId: string
): Promise<{ db: DB; user: SessionUser; project: Project }> {
	const user = requireUser(event);
	const db = getDb(event);
	const rows = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
		.limit(1);

	const project = rows[0];
	if (!project) throw error(404, 'Project not found.');
	if (project.userId !== user.id) throw error(403, 'You do not have access to this project.');
	return { db, user, project };
}

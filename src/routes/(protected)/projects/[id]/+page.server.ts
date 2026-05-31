import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireOwnedProject } from '$lib/server/context';
import { messages } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const chat = await db
		.select()
		.from(messages)
		.where(eq(messages.projectId, project.id))
		.orderBy(asc(messages.createdAt));
	return { project, messages: chat };
};

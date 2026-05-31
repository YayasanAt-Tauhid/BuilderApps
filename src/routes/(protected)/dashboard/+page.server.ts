import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, requireUser } from '$lib/server/context';
import { createProjectSchema, parse } from '$lib/schemas';
import { projects } from '$lib/server/db/schema';
import { ulid } from '$lib/utils/ulid';
import { uniqueSlug } from '$lib/utils/slug';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const db = getDb(event);
	const rows = await db
		.select()
		.from(projects)
		.where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
		.orderBy(desc(projects.updatedAt));
	return { projects: rows };
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const result = parse(createProjectSchema, {
			name: form.get('name'),
			description: form.get('description') || undefined
		});
		if (!result.success) return fail(400, { error: 'A project name is required.' });

		const db = getDb(event);
		const now = Date.now();
		const id = ulid();
		await db.insert(projects).values({
			id,
			userId: user.id,
			name: result.data.name,
			slug: uniqueSlug(result.data.name),
			description: result.data.description ?? null,
			status: 'draft',
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		});
		throw redirect(303, `/projects/${id}`);
	},

	delete: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing project id.' });

		const db = getDb(event);
		const now = Date.now();
		// Soft delete, owner-scoped.
		await db
			.update(projects)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(projects.id, id), eq(projects.userId, user.id)));
		return { success: true };
	}
};

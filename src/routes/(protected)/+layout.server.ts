import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Auth guard for the entire (protected) group (PRD §6 / §14.3).
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) throw redirect(303, '/login');
	return { user: event.locals.user };
};

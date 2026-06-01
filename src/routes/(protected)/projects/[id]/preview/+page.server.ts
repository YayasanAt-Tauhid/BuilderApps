import type { PageServerLoad } from './$types';
import { requireOwnedProject } from '$lib/server/context';

export const load: PageServerLoad = async (event) => {
	const { project } = await requireOwnedProject(event, event.params.id);
	return { project };
};

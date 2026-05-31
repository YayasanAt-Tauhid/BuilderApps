import type { RequestHandler } from './$types';
import { requireOwnedProject, getEnv } from '$lib/server/context';

// Upgrade to WebSocket; the app worker just forwards the upgrade to the project's
// Durable Object (idFromName(projectId)) in the backend worker (PRD §11.0 / §11.4).
export const GET: RequestHandler = async (event) => {
	if (event.request.headers.get('Upgrade') !== 'websocket') {
		return new Response('Expected a WebSocket upgrade.', { status: 426 });
	}

	// Authorization: only the owner may connect to the project's hub.
	const { project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const stub = env.DO_REALTIME.get(env.DO_REALTIME.idFromName(project.id));
	// Rewrite to the DO's internal route while preserving the Upgrade headers.
	const doRequest = new Request(`https://do/ws?projectId=${project.id}`, event.request);

	// The DO stub speaks the Workers Request/Response types; SvelteKit speaks DOM types.
	// The forward is runtime-correct — bridge the two type universes explicitly.
	const forward = stub.fetch as unknown as (req: Request) => Promise<Response>;
	return forward(doRequest);
};

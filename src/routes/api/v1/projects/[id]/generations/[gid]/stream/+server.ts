import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generations } from '$lib/server/db/schema';

// Live generation stream (Server-Sent Events). The app worker proxies the per-project
// Durable Object's `/subscribe` stream. SSE works through SvelteKit/adapter-cloudflare
// (unlike WebSocket upgrades). Owner-only.
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const rows = await db
		.select()
		.from(generations)
		.where(eq(generations.id, event.params.gid))
		.limit(1);
	const gen = rows[0];
	if (!gen || gen.projectId !== project.id) return errors.notFound('Generation');

	const stub = env.DO_REALTIME.get(env.DO_REALTIME.idFromName(project.id));
	// Bridge the Workers/DOM type universes (runtime-correct forward of the stream body).
	const doFetch = stub.fetch as unknown as (req: Request) => Promise<Response>;
	const doResp = await doFetch(new Request(`https://do/subscribe?gid=${gen.id}`));

	return new Response(doResp.body as unknown as ReadableStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};

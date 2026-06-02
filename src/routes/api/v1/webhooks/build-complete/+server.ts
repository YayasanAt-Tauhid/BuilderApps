import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getEnv, getDb } from '$lib/server/context';
import { projects } from '$lib/server/db/schema';

// Called by GitHub Actions after dist/ is uploaded to R2.
// Sets cfPagesUrl so the /apps/{slug}/ route can serve the built site.
export const POST: RequestHandler = async (event) => {
	const env = getEnv(event);
	const secret = env.BUILDERPRO_DEPLOY_SECRET;
	if (!secret) return new Response('Not configured', { status: 500 });

	const auth = event.request.headers.get('Authorization') ?? '';
	if (auth !== `Bearer ${secret}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	let body: { projectId?: string };
	try {
		body = (await event.request.json()) as { projectId?: string };
	} catch {
		return new Response('Bad request', { status: 400 });
	}

	const { projectId } = body;
	if (!projectId) return new Response('Missing projectId', { status: 400 });

	const db = getDb(event);

	const [project] = await db
		.select({ id: projects.id, slug: projects.slug })
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1);

	if (!project) return new Response('Not found', { status: 404 });

	const appUrl = env.APP_URL ?? '';
	const cfPagesUrl = `${appUrl}/apps/${project.slug}/`;

	await db
		.update(projects)
		.set({ cfPagesUrl, status: 'ready', updatedAt: Date.now() })
		.where(eq(projects.id, project.id));

	return new Response('OK', { status: 200 });
};

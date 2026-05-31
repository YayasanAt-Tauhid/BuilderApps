import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';
import { getFileStream } from '$lib/server/storage/r2';

// Stream a single file's content from R2 (PRD §5 M5). Owner-only.
export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const rows = await db
		.select()
		.from(generatedFiles)
		.where(eq(generatedFiles.id, event.params.fileId))
		.limit(1);

	const file = rows[0];
	if (!file || file.projectId !== project.id) return errors.notFound('File');

	const obj = await getFileStream(env.BUCKET, file.r2Key);
	if (!obj) return errors.notFound('File content');

	return new Response(obj.body as unknown as ReadableStream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Content-Length': String(file.sizeBytes),
			'Cache-Control': 'private, max-age=60',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};

import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import { streamChat, estimateTokens, DEFAULT_MODEL } from '../../../src/lib/server/ai';
import { parseGeneratedFiles, sanitizePath } from '../../../src/lib/server/ai/parser';
import { fileKey, putFile, getFileText, contentHash } from '../../../src/lib/server/storage/r2';
import { recordUsage } from '../../../src/lib/server/usage';
import { ulid } from '../../../src/lib/utils/ulid';
import type { Env } from '../../../src/lib/server/env';

interface StartJob {
	generationId: string;
	projectId: string;
	userId: string;
	version: number;
	prompt: string;
	model?: string;
}

/** Used for the initial (create) generation — generate a complete project. */
const CREATE_SYSTEM_PROMPT = `You are BuilderPro, an expert full-stack engineer. Given a description,
generate a complete, runnable project. Output ONLY files, each delimited exactly like this:

=== FILE: relative/path/to/file.ext ===
<file contents>
=== END FILE ===

Rules:
- Use forward slashes in paths; never use absolute paths or "..".
- Emit every file the project needs.
- For a previewable frontend, make index.html self-contained: put CSS in an inline <style>
  tag and JS in an inline <script> tag inside index.html (avoid external local files), so it
  renders correctly in a sandboxed preview. A CDN (e.g. Tailwind Play CDN) is acceptable.
- Do not wrap files in markdown code fences. Brief prose between blocks is allowed but ignored.`;

/**
 * Used for follow-up (update) generations.
 * The current project file tree is shown; the model outputs ONLY the files that change.
 */
const UPDATE_SYSTEM_PROMPT = `You are BuilderPro, an expert full-stack engineer updating an existing project.

The current project files are listed in the user message. Output ONLY the files that need to be
ADDED or MODIFIED — files you do not output will remain exactly as they are. Use this exact format:

=== FILE: relative/path/to/file.ext ===
<new complete file contents>
=== END FILE ===

To delete a file:
=== DELETE: relative/path/to/file.ext ===

Rules:
- Use forward slashes; no absolute paths or "..".
- Write the complete, final file content — not diffs or partial snippets.
- For index.html: keep CSS in an inline <style> tag and JS in an inline <script> tag.
- Do not wrap files in markdown code fences. Brief prose between blocks is allowed but ignored.`;

/** Max total bytes of existing file content to include in an update prompt. */
const MAX_CONTEXT_BYTES = 80_000;

const enc = new TextEncoder();

interface Live {
	buffer: string;
	writers: Set<WritableStreamDefaultWriter<Uint8Array>>;
	finished: boolean;
	result?: {
		status: 'succeeded' | 'failed';
		version: number;
		fileCount?: number;
		message?: string;
	};
}

interface FileMeta {
	path: string;
	r2Key: string;
	sizeBytes: number;
	hash: string;
}

interface FileRecord {
	path: string;
	content: string | null; // null = reuse existing r2Key (no upload needed)
	r2Key: string | null;
	sizeBytes: number;
	hash: string;
}

/**
 * Per-project generation runner + live SSE relay (PRD §11.4).
 * SQLite-backed Durable Object. The app worker triggers `/start` (fire-and-forget via
 * waitUntil, so generation always completes + persists) and clients attach to `/subscribe`
 * to receive live token events over Server-Sent Events.
 *
 * For follow-up messages the generator builds a lightweight update context (existing file
 * tree + content up to MAX_CONTEXT_BYTES) and asks the model to output ONLY the files that
 * changed, then merges the result with the unchanged files from the previous version.
 */
export class RealtimeHub {
	private live = new Map<string, Live>();

	constructor(
		private state: DurableObjectState,
		private env: Env
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/start') return this.handleStart(request);
		if (url.pathname === '/subscribe') return this.handleSubscribe(url);
		return new Response('Not found', { status: 404 });
	}

	private sse(eventName: string, data: unknown): Uint8Array {
		return enc.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
	}

	private writeAll(live: Live, chunk: Uint8Array): void {
		for (const w of live.writers) {
			w.write(chunk).catch(() => live.writers.delete(w));
		}
	}

	private async handleStart(request: Request): Promise<Response> {
		const job = (await request.json()) as StartJob;
		if (!this.live.has(job.generationId)) {
			this.live.set(job.generationId, { buffer: '', writers: new Set(), finished: false });
			// Awaited so the DO stays alive for the whole run (caller used waitUntil).
			await this.runGeneration(job);
		}
		return new Response('ok');
	}

	private async handleSubscribe(url: URL): Promise<Response> {
		const gid = url.searchParams.get('gid') ?? '';
		const headers = {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		};

		// Wait briefly for /start to register the generation (it runs near-simultaneously).
		let live = this.live.get(gid);
		for (let i = 0; i < 20 && !live; i++) {
			await new Promise((r) => setTimeout(r, 150));
			live = this.live.get(gid);
		}

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();

		if (!live) {
			// Generation not active here (already finished + cleaned up, or never started).
			writer.write(this.sse('fallback', { gid })).catch(() => {});
			writer.close().catch(() => {});
			return new Response(readable, { headers });
		}

		// Replay what has streamed so far.
		if (live.buffer) writer.write(this.sse('token', { content: live.buffer })).catch(() => {});

		if (live.finished && live.result) {
			const name = live.result.status === 'succeeded' ? 'done' : 'failed';
			writer.write(this.sse(name, live.result)).catch(() => {});
			writer.close().catch(() => {});
		} else {
			live.writers.add(writer);
		}
		return new Response(readable, { headers });
	}

	/**
	 * Load file metadata from D1 and content from R2 for the update context.
	 * Content is fetched lazily and capped at MAX_CONTEXT_BYTES total to avoid
	 * sending a huge prompt for large projects.
	 */
	private async loadPrevFiles(
		db: ReturnType<typeof createDb>,
		projectId: string,
		version: number
	): Promise<{ meta: FileMeta[]; contentByPath: Map<string, string> }> {
		const rows = await db
			.select()
			.from(generatedFiles)
			.where(
				and(
					eq(generatedFiles.projectId, projectId),
					eq(generatedFiles.version, version),
					isNull(generatedFiles.deletedAt)
				)
			);

		const meta: FileMeta[] = rows.map((r) => ({
			path: r.path,
			r2Key: r.r2Key,
			sizeBytes: r.sizeBytes,
			hash: r.contentHash
		}));

		// Sort smallest-first so we include as many files as possible within budget.
		const sorted = [...meta].sort((a, b) => a.sizeBytes - b.sizeBytes);
		const contentByPath = new Map<string, string>();
		let budget = MAX_CONTEXT_BYTES;

		for (const f of sorted) {
			if (budget <= 0) break;
			if (f.sizeBytes > budget) continue;
			const content = await getFileText(this.env.BUCKET, f.r2Key);
			if (content !== null) {
				contentByPath.set(f.path, content);
				budget -= f.sizeBytes;
			}
		}

		return { meta, contentByPath };
	}

	private async runGeneration(job: StartJob): Promise<void> {
		const live = this.live.get(job.generationId)!;
		const db = createDb(this.env.DB);

		if (!this.env.OPENROUTER_API_KEY) {
			await this.fail(db, job, live, 'AI service is not configured.');
			return;
		}

		try {
			const isUpdate = job.version > 1;
			let prevMeta: FileMeta[] = [];
			let systemPrompt: string;
			let userContent: string;

			if (isUpdate) {
				const { meta, contentByPath } = await this.loadPrevFiles(
					db,
					job.projectId,
					job.version - 1
				);
				prevMeta = meta;

				// Build update context: file tree with content where it fits in budget.
				const fileLines = meta.map((f) => {
					const content = contentByPath.get(f.path);
					if (content !== undefined) {
						return `=== FILE: ${f.path} ===\n${content}\n=== END FILE ===`;
					}
					return `=== FILE: ${f.path} === (${Math.round(f.sizeBytes / 1024)} KB — too large to include)`;
				});

				systemPrompt = UPDATE_SYSTEM_PROMPT;
				userContent =
					`CURRENT PROJECT FILES:\n\n${fileLines.join('\n\n')}\n\nUSER REQUEST:\n${job.prompt}`;
			} else {
				systemPrompt = CREATE_SYSTEM_PROMPT;
				userContent = job.prompt;
			}

			// Stream tokens to the client as they arrive — this drives the live file-list UI.
			let full = '';
			for await (const delta of streamChat({
				apiKey: this.env.OPENROUTER_API_KEY,
				model: job.model ?? DEFAULT_MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userContent }
				]
			})) {
				if (delta.done) break;
				full += delta.content;
				live.buffer += delta.content;
				this.writeAll(live, this.sse('token', { content: delta.content }));
			}

			const { files: newFiles, deletedPaths } = parseGeneratedFiles(full);
			const ts = Date.now();

			// Build the final file set for this version.
			// Unchanged files from the previous version reuse their R2 key — no re-upload.
			const filesToStore: FileRecord[] = [];

			if (isUpdate) {
				const newByPath = new Map(newFiles.map((f) => [f.path, f]));
				const deletedSet = new Set(deletedPaths);

				for (const meta of prevMeta) {
					if (deletedSet.has(meta.path) || newByPath.has(meta.path)) continue;
					filesToStore.push({
						path: meta.path,
						content: null,
						r2Key: meta.r2Key,
						sizeBytes: meta.sizeBytes,
						hash: meta.hash
					});
				}
			}

			for (const f of newFiles) {
				filesToStore.push({
					path: f.path,
					content: f.content,
					r2Key: null,
					sizeBytes: enc.encode(f.content).byteLength,
					hash: contentHash(f.content)
				});
			}

			for (const file of filesToStore) {
				let key: string;
				if (file.content !== null) {
					key = fileKey(job.projectId, job.version, file.path);
					await putFile(this.env.BUCKET, key, file.content);
				} else {
					key = file.r2Key!;
				}
				await db.insert(generatedFiles).values({
					id: ulid(),
					projectId: job.projectId,
					generationId: job.generationId,
					path: file.path,
					version: job.version,
					r2Key: key,
					sizeBytes: file.sizeBytes,
					contentHash: file.hash,
					createdAt: ts,
					updatedAt: ts,
					deletedAt: null
				});
			}

			await db.insert(messages).values({
				id: ulid(),
				projectId: job.projectId,
				role: 'assistant',
				content: full,
				tokenCount: estimateTokens(full),
				modelUsed: job.model ?? DEFAULT_MODEL,
				generationId: job.generationId,
				createdAt: ts,
				updatedAt: ts,
				deletedAt: null
			});

			await recordUsage(db, job.userId, {
				input: estimateTokens(userContent) + estimateTokens(systemPrompt),
				output: estimateTokens(full)
			});

			await db
				.update(generations)
				.set({ status: 'succeeded', finishedAt: ts, updatedAt: ts })
				.where(eq(generations.id, job.generationId));
			await db
				.update(projects)
				.set({ status: 'ready', updatedAt: ts })
				.where(eq(projects.id, job.projectId));

			live.result = { status: 'succeeded', version: job.version, fileCount: filesToStore.length };
			live.finished = true;
			this.writeAll(live, this.sse('done', live.result));
			for (const w of live.writers) w.close().catch(() => {});
			this.scheduleCleanup(job.generationId);
		} catch (err) {
			// User-safe message only — never leak provider internals or PII (PRD §5 M4).
			console.error('generation failed', err);
			await this.fail(db, job, live, 'Generation failed. Please try again.');
		}
	}

	private async fail(
		db: ReturnType<typeof createDb>,
		job: StartJob,
		live: Live,
		message: string
	): Promise<void> {
		const ts = Date.now();
		await db
			.update(generations)
			.set({ status: 'failed', errorMessage: message, finishedAt: ts, updatedAt: ts })
			.where(eq(generations.id, job.generationId));
		await db
			.update(projects)
			.set({ status: 'error', updatedAt: ts })
			.where(eq(projects.id, job.projectId));

		live.result = { status: 'failed', version: job.version, message };
		live.finished = true;
		this.writeAll(live, this.sse('failed', live.result));
		for (const w of live.writers) w.close().catch(() => {});
		this.scheduleCleanup(job.generationId);
	}

	private scheduleCleanup(gid: string): void {
		setTimeout(() => this.live.delete(gid), 60_000);
	}
}

// sanitizePath re-export keeps imports clean for callers that need it.
export { sanitizePath };

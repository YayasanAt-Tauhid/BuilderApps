import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import { streamChat, estimateTokens, DEFAULT_MODEL } from '../../../src/lib/server/ai';
import { parseGeneratedFiles } from '../../../src/lib/server/ai/parser';
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

/** Used for the initial (create) generation. */
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

/** Used for follow-up (update) generations. The current files are included in the user message. */
const UPDATE_SYSTEM_PROMPT = `You are BuilderPro, an expert full-stack engineer. You are updating an existing project.

The current project files are shown in the user message. Make ONLY the changes the user requests.

Output ONLY the files that need to be ADDED or MODIFIED, using this exact format:

=== FILE: relative/path/to/file.ext ===
<new file contents>
=== END FILE ===

To delete a file, emit:
=== DELETE: relative/path/to/file.ext ===

Rules:
- Files you do not mention will remain unchanged.
- Use forward slashes; no absolute paths or "..".
- For index.html: keep CSS in an inline <style> tag and JS in an inline <script> tag.
- No markdown code fences. Brief prose between blocks is allowed but ignored.`;

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

interface ExistingFile {
	path: string;
	content: string;
	r2Key: string;
	sizeBytes: number;
	hash: string;
}

/**
 * Per-project generation runner + live SSE relay (PRD §11.4).
 * SQLite-backed Durable Object. The app worker triggers `/start` (fire-and-forget via
 * waitUntil, so generation always completes + persists) and clients attach to `/subscribe`
 * to receive live token events over Server-Sent Events.
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
			// Generation not active here (already finished + cleaned up, or never started):
			// tell the client to fall back to polling.
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

	/** Load all files from the previous generation version to use as context for updates. */
	private async loadExistingFiles(
		db: ReturnType<typeof createDb>,
		projectId: string,
		version: number
	): Promise<ExistingFile[]> {
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

		const result: ExistingFile[] = [];
		for (const row of rows) {
			const content = await getFileText(this.env.BUCKET, row.r2Key);
			if (content !== null) {
				result.push({
					path: row.path,
					content,
					r2Key: row.r2Key,
					sizeBytes: row.sizeBytes,
					hash: row.contentHash
				});
			}
		}
		return result;
	}

	private async runGeneration(job: StartJob): Promise<void> {
		const live = this.live.get(job.generationId)!;
		const db = createDb(this.env.DB);

		if (!this.env.OPENROUTER_API_KEY) {
			await this.fail(db, job, live, 'AI service is not configured.');
			return;
		}

		try {
			// For follow-up generations load existing files so the model sees the current state.
			const isUpdate = job.version > 1;
			let existingFiles: ExistingFile[] = [];
			if (isUpdate) {
				existingFiles = await this.loadExistingFiles(db, job.projectId, job.version - 1);
			}

			const systemPrompt =
				isUpdate && existingFiles.length > 0 ? UPDATE_SYSTEM_PROMPT : CREATE_SYSTEM_PROMPT;

			let userContent: string;
			if (isUpdate && existingFiles.length > 0) {
				const fileBlocks = existingFiles
					.map((f) => `=== FILE: ${f.path} ===\n${f.content}\n=== END FILE ===`)
					.join('\n\n');
				userContent = `CURRENT PROJECT FILES:\n\n${fileBlocks}\n\nUSER REQUEST:\n${job.prompt}`;
			} else {
				userContent = job.prompt;
			}

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

			// For updates: merge the model's output with the existing file set.
			// - Files the model returned: new or modified (need R2 upload).
			// - Files the model omitted: carry forward unchanged (reuse existing R2 key).
			// - Files in deletedPaths: removed from the project.
			type FileRecord = {
				path: string;
				content: string | null; // null = reuse existing r2Key, no upload needed
				r2Key: string | null; // null = compute new key after upload
				sizeBytes: number;
				hash: string;
			};

			let filesToStore: FileRecord[];

			if (isUpdate && existingFiles.length > 0) {
				const newByPath = new Map(newFiles.map((f) => [f.path, f]));
				const deletedSet = new Set(deletedPaths);
				const merged = new Map<string, FileRecord>();

				for (const ef of existingFiles) {
					if (deletedSet.has(ef.path)) continue;
					const updated = newByPath.get(ef.path);
					if (updated) {
						// Modified — upload new content
						merged.set(ef.path, {
							path: ef.path,
							content: updated.content,
							r2Key: null,
							sizeBytes: enc.encode(updated.content).byteLength,
							hash: contentHash(updated.content)
						});
					} else {
						// Unchanged — reuse existing R2 object, no upload
						merged.set(ef.path, {
							path: ef.path,
							content: null,
							r2Key: ef.r2Key,
							sizeBytes: ef.sizeBytes,
							hash: ef.hash
						});
					}
				}

				// Newly added files (paths not in the previous version)
				for (const nf of newFiles) {
					if (!merged.has(nf.path)) {
						merged.set(nf.path, {
							path: nf.path,
							content: nf.content,
							r2Key: null,
							sizeBytes: enc.encode(nf.content).byteLength,
							hash: contentHash(nf.content)
						});
					}
				}

				filesToStore = [...merged.values()];
			} else {
				filesToStore = newFiles.map((f) => ({
					path: f.path,
					content: f.content,
					r2Key: null,
					sizeBytes: enc.encode(f.content).byteLength,
					hash: contentHash(f.content)
				}));
			}

			for (const file of filesToStore) {
				let key: string;
				if (file.content !== null) {
					// New or modified: upload to R2 under the current version
					key = fileKey(job.projectId, job.version, file.path);
					await putFile(this.env.BUCKET, key, file.content);
				} else {
					// Unchanged: point to the existing R2 object
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

			live.result = {
				status: 'succeeded',
				version: job.version,
				fileCount: filesToStore.length
			};
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

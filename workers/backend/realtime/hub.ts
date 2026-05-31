import { eq, asc, and } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import { streamChat, estimateTokens, DEFAULT_MODEL } from '../../../src/lib/server/ai';
import { parseOutput, applyPatch } from '../../../src/lib/server/ai/parser';
import { buildEditPrompt, PROMPT_NEW } from '../../../src/lib/server/ai/prompts';
import { fileKey, putFile, getFileText, contentHash } from '../../../src/lib/server/storage/r2';
import { recordUsage } from '../../../src/lib/server/usage';
import { ulid } from '../../../src/lib/utils/ulid';
import type { Env } from '../../../src/lib/server/env';

interface StartJob {
	generationId: string;
	projectId: string;
	userId: string;
	version: number;
	/** null = first generation; otherwise the version to use as edit base. */
	prevVersion: number | null;
	prompt: string;
	model?: string;
}

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

/**
 * Per-project generation runner + live SSE relay (PRD §11.4).
 * SQLite-backed Durable Object. The app worker triggers /start (fire-and-forget via
 * waitUntil) and clients attach to /subscribe for live token events.
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
		for (const w of live.writers) w.write(chunk).catch(() => live.writers.delete(w));
	}

	private async handleStart(request: Request): Promise<Response> {
		const job = (await request.json()) as StartJob;
		if (!this.live.has(job.generationId)) {
			this.live.set(job.generationId, { buffer: '', writers: new Set(), finished: false });
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

		let live = this.live.get(gid);
		for (let i = 0; i < 20 && !live; i++) {
			await new Promise((r) => setTimeout(r, 150));
			live = this.live.get(gid);
		}

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();

		if (!live) {
			writer.write(this.sse('fallback', { gid })).catch(() => {});
			writer.close().catch(() => {});
			return new Response(readable, { headers });
		}

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

	private async runGeneration(job: StartJob): Promise<void> {
		const live = this.live.get(job.generationId)!;
		const db = createDb(this.env.DB);

		if (!this.env.OPENROUTER_API_KEY) {
			await this.fail(db, job, live, 'AI service is not configured.');
			return;
		}

		try {
			const isEdit = job.prevVersion !== null;

			// ── 1. Load existing files for edit mode ──────────────────────────────
			const existingFiles = new Map<string, string>();
			if (isEdit) {
				const prevRows = await db
					.select()
					.from(generatedFiles)
					.where(
						and(
							eq(generatedFiles.projectId, job.projectId),
							eq(generatedFiles.version, job.prevVersion!)
						)
					);
				await Promise.all(
					prevRows.map(async (row) => {
						const text = await getFileText(this.env.BUCKET, row.r2Key);
						if (text !== null) existingFiles.set(row.path as string, text);
					})
				);
			}

			// ── 2. Load conversation history (last 20 messages, skip current) ──────
			const history = await db
				.select()
				.from(messages)
				.where(eq(messages.projectId, job.projectId))
				.orderBy(asc(messages.createdAt));
			const historyMsgs = history
				.slice(0, -1) // exclude the user message we just inserted
				.slice(-20)
				.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

			// ── 3. Choose system prompt ───────────────────────────────────────────
			const systemPrompt = isEdit ? buildEditPrompt(existingFiles) : PROMPT_NEW;

			// ── 4. Stream generation ──────────────────────────────────────────────
			let full = '';
			for await (const delta of streamChat({
				apiKey: this.env.OPENROUTER_API_KEY,
				model: job.model ?? DEFAULT_MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					...historyMsgs,
					{ role: 'user', content: job.prompt }
				]
			})) {
				if (delta.done) break;
				full += delta.content;
				live.buffer += delta.content;
				this.writeAll(live, this.sse('token', { content: delta.content }));
			}

			// ── 5. Parse FILE + PATCH blocks ──────────────────────────────────────
			const { files: newFiles, patches } = parseOutput(full);
			const finalFiles = new Map(existingFiles);

			for (const f of newFiles) finalFiles.set(f.path, f.content);

			// Apply patches; collect failures for one fallback retry.
			const failedPaths: string[] = [];
			for (const patch of patches) {
				const base = finalFiles.get(patch.path) ?? '';
				const patched = applyPatch(base, patch);
				if (patched !== null) {
					finalFiles.set(patch.path, patched);
				} else {
					console.warn(`[hub] patch hunk not found: ${patch.path}`);
					failedPaths.push(patch.path);
				}
			}

			// ── 6. Fallback: retry failed files with full-rewrite prompt ──────────
			if (failedPaths.length > 0) {
				const retryPrompt =
					`Rewrite these files in full (previous unified diff could not be applied):\n` +
					failedPaths.join('\n') +
					`\n\nOriginal request: ${job.prompt}`;
				let retryFull = '';
				for await (const delta of streamChat({
					apiKey: this.env.OPENROUTER_API_KEY,
					model: job.model ?? DEFAULT_MODEL,
					messages: [
						{ role: 'system', content: PROMPT_NEW },
						{ role: 'user', content: retryPrompt }
					]
				})) {
					if (delta.done) break;
					retryFull += delta.content;
				}
				const { files: retryFiles } = parseOutput(retryFull);
				for (const f of retryFiles) finalFiles.set(f.path, f.content);
			}

			// ── 7. Persist to R2 + D1 ─────────────────────────────────────────────
			const ts = Date.now();
			for (const [path, content] of finalFiles) {
				const key = fileKey(job.projectId, job.version, path);
				await putFile(this.env.BUCKET, key, content);
				await db.insert(generatedFiles).values({
					id: ulid(),
					projectId: job.projectId,
					generationId: job.generationId,
					path,
					version: job.version,
					r2Key: key,
					sizeBytes: enc.encode(content).byteLength,
					contentHash: contentHash(content),
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
				input: estimateTokens(job.prompt) + estimateTokens(systemPrompt),
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

			live.result = { status: 'succeeded', version: job.version, fileCount: finalFiles.size };
			live.finished = true;
			this.writeAll(live, this.sse('done', live.result));
			for (const w of live.writers) w.close().catch(() => {});
			this.scheduleCleanup(job.generationId);
		} catch (err) {
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

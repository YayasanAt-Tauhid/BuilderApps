import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import {
	chatWithTools,
	estimateTokens,
	DEFAULT_MODEL,
	type ToolDefinition,
	type AgentMessage
} from '../../../src/lib/server/ai';
import { sanitizePath } from '../../../src/lib/server/ai/parser';
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

const AGENT_SYSTEM_PROMPT = `You are BuilderPro, an expert full-stack engineer. You have tools to read and write project files.

For a NEW project (empty file list): write every file needed for a complete, runnable app.
For an UPDATE: call list_files first, read only the files you need, then write only the files that changed. Never rewrite a file that doesn't need to change.

Rules for files you write:
- Use forward slashes; no absolute paths or "..".
- For index.html: keep CSS in an inline <style> tag and JS in an inline <script> tag (no external local files); a CDN (e.g. Tailwind Play CDN) is acceptable.
- Write the complete, final file content — not diffs or partial snippets.`;

const FILE_TOOLS: ToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'list_files',
			description: 'List all files currently in the project.',
			parameters: { type: 'object', properties: {}, required: [] }
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_file',
			description: 'Read the full content of a project file.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative file path' }
				},
				required: ['path']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'write_file',
			description: 'Create or overwrite a file with complete new content.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative file path' },
					content: { type: 'string', description: 'Complete file content' }
				},
				required: ['path', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_file',
			description: 'Delete a file from the project.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative file path' }
				},
				required: ['path']
			}
		}
	}
];

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

// Lightweight metadata loaded from D1 — no R2 content fetch until the model asks.
interface FileMeta {
	path: string;
	r2Key: string;
	sizeBytes: number;
	hash: string;
}

// Record to persist at the end of a generation.
interface FileRecord {
	path: string;
	content: string | null; // null = reuse existing r2Key (no upload)
	r2Key: string | null; // null = compute new key after upload
	sizeBytes: number;
	hash: string;
}

/**
 * Per-project generation runner + live SSE relay (PRD §11.4).
 * SQLite-backed Durable Object. The app worker triggers `/start` (fire-and-forget via
 * waitUntil, so generation always completes + persists) and clients attach to `/subscribe`
 * to receive live token events over Server-Sent Events.
 *
 * Generation uses an agentic tool-use loop so the model only reads the files it needs
 * and writes only the files that change — token cost is proportional to the edit, not
 * the total project size.
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

	private async runGeneration(job: StartJob): Promise<void> {
		const live = this.live.get(job.generationId)!;
		const db = createDb(this.env.DB);

		if (!this.env.OPENROUTER_API_KEY) {
			await this.fail(db, job, live, 'AI service is not configured.');
			return;
		}

		try {
			// Load file metadata from D1 only (no R2 reads yet — content is fetched lazily).
			const prevMeta = new Map<string, FileMeta>();
			if (job.version > 1) {
				const rows = await db
					.select()
					.from(generatedFiles)
					.where(
						and(
							eq(generatedFiles.projectId, job.projectId),
							eq(generatedFiles.version, job.version - 1),
							isNull(generatedFiles.deletedAt)
						)
					);
				for (const row of rows) {
					prevMeta.set(row.path, {
						path: row.path,
						r2Key: row.r2Key,
						sizeBytes: row.sizeBytes,
						hash: row.contentHash
					});
				}
			}

			// In-session content cache (files read or written this run).
			const vfsContent = new Map<string, string>();
			// Files written by the model in this generation (path → new content).
			const writtenFiles = new Map<string, string>();
			// Files explicitly deleted by the model.
			const deletedPaths = new Set<string>();
			// Fragments assembled into the assistant message stored in D1.
			const contentParts: string[] = [];

			const agentMessages: AgentMessage[] = [
				{ role: 'system', content: AGENT_SYSTEM_PROMPT },
				{ role: 'user', content: job.prompt }
			];

			// Agentic tool-use loop — each iteration is one model round-trip.
			const MAX_ITERS = 20;

			for (let iter = 0; iter < MAX_ITERS; iter++) {
				const response = await chatWithTools({
					apiKey: this.env.OPENROUTER_API_KEY,
					model: job.model ?? DEFAULT_MODEL,
					messages: agentMessages,
					tools: FILE_TOOLS
				});

				agentMessages.push(response);
				if (response.content) contentParts.push(response.content);

				if (!response.tool_calls?.length) break; // no more tools → done

				const toolResults: AgentMessage[] = [];

				for (const tc of response.tool_calls) {
					let args: Record<string, unknown>;
					try {
						args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
					} catch {
						args = {};
					}

					let result: string;

					switch (tc.function.name) {
						case 'list_files': {
							// Return the effective current file list (prev + written − deleted).
							const currentPaths = [
								...[...prevMeta.keys()].filter(
									(p) => !deletedPaths.has(p) && !writtenFiles.has(p)
								),
								...writtenFiles.keys()
							];
							result = JSON.stringify(currentPaths.map((p) => ({ path: p })));
							break;
						}

						case 'read_file': {
							const path = sanitizePath(String(args.path ?? ''));
							if (vfsContent.has(path)) {
								// Already loaded or written this session.
								result = vfsContent.get(path)!;
							} else {
								const meta = prevMeta.get(path);
								if (meta) {
									// Lazy load from R2 only when the model actually asks.
									const content = await getFileText(this.env.BUCKET, meta.r2Key);
									if (content !== null) {
										vfsContent.set(path, content);
										result = content;
									} else {
										result = JSON.stringify({ error: 'File content unavailable' });
									}
								} else {
									result = JSON.stringify({ error: `File not found: ${path}` });
								}
							}
							break;
						}

						case 'write_file': {
							const path = sanitizePath(String(args.path ?? ''));
							const content = String(args.content ?? '');
							if (!path) {
								result = JSON.stringify({ error: 'Invalid path' });
								break;
							}
							writtenFiles.set(path, content);
							vfsContent.set(path, content);
							deletedPaths.delete(path); // un-delete if path is reused

							// Emit file block in the delimiter format the client already parses.
							const block = `=== FILE: ${path} ===\n${content}\n=== END FILE ===\n`;
							live.buffer += block;
							this.writeAll(live, this.sse('token', { content: block }));
							contentParts.push(block);

							result = JSON.stringify({ ok: true });
							break;
						}

						case 'delete_file': {
							const path = sanitizePath(String(args.path ?? ''));
							deletedPaths.add(path);
							vfsContent.delete(path);
							writtenFiles.delete(path);
							result = JSON.stringify({ ok: true });
							break;
						}

						default:
							result = JSON.stringify({ error: 'Unknown tool' });
					}

					toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
				}

				agentMessages.push(...toolResults);
			}

			const ts = Date.now();
			const assistantContent = contentParts.join('\n');

			// Build the final file set for this version:
			//  - Unchanged files from the previous version (reuse R2 key — no upload).
			//  - New / modified files (upload to R2 under the new version key).
			//  - Deleted files are simply omitted.
			const filesToStore: FileRecord[] = [];

			for (const [path, meta] of prevMeta) {
				if (deletedPaths.has(path) || writtenFiles.has(path)) continue;
				filesToStore.push({
					path,
					content: null,
					r2Key: meta.r2Key,
					sizeBytes: meta.sizeBytes,
					hash: meta.hash
				});
			}

			for (const [path, content] of writtenFiles) {
				filesToStore.push({
					path,
					content,
					r2Key: null,
					sizeBytes: enc.encode(content).byteLength,
					hash: contentHash(content)
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

			// Token estimates: input = system + user + all tool results; output = written content.
			const inputTokens =
				estimateTokens(AGENT_SYSTEM_PROMPT) +
				estimateTokens(job.prompt) +
				agentMessages
					.filter((m) => m.role === 'tool')
					.reduce((n, m) => n + estimateTokens('content' in m ? String(m.content) : ''), 0);
			const outputTokens = estimateTokens(assistantContent);

			await db.insert(messages).values({
				id: ulid(),
				projectId: job.projectId,
				role: 'assistant',
				content: assistantContent,
				tokenCount: outputTokens,
				modelUsed: job.model ?? DEFAULT_MODEL,
				generationId: job.generationId,
				createdAt: ts,
				updatedAt: ts,
				deletedAt: null
			});

			await recordUsage(db, job.userId, { input: inputTokens, output: outputTokens });

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

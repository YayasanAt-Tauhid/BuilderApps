import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import {
	streamWithTools,
	estimateTokens,
	DEFAULT_MODEL,
	type ToolDefinition,
	type AgentMessage,
	type ToolCall
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
For an UPDATE: call list_files first, read only the files you need, then write only the files that changed. Never rewrite files that don't need to change.

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
				properties: { path: { type: 'string', description: 'Relative file path' } },
				required: ['path']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'write_file',
			description: 'Create or overwrite a file. Content streams live to the user.',
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
				properties: { path: { type: 'string', description: 'Relative file path' } },
				required: ['path']
			}
		}
	}
];

const enc = new TextEncoder();

// ── WriteFileContentStreamer ───────────────────────────────────────────────────
//
// Incrementally extracts `path` and `content` from a streaming JSON arguments
// string like {"path":"index.html","content":"<!DOCTYPE html>..."}.
// Handles JSON string escapes (\n \t \r \" \\ \/ \uXXXX) so the streamed
// characters match the actual file content.

class WriteFileContentStreamer {
	private phase: 'find_path' | 'find_content' | 'in_content' | 'done' = 'find_path';
	private searchBuf = '';
	private escapeNext = false;
	private unicodeNeeded = 0;
	private unicodeBuf = '';

	extractedPath: string | null = null;
	fullContent = '';

	/**
	 * Feed the next argument fragment. Returns content characters to stream to
	 * the client (decoded, not JSON-escaped). Empty string = nothing to emit yet.
	 */
	process(chunk: string): string {
		if (this.phase === 'done') return '';

		if (this.phase === 'find_path') {
			this.searchBuf += chunk;
			// "path" always comes first in the schema, so it appears early.
			const m = this.searchBuf.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
			if (m) {
				try {
					this.extractedPath = JSON.parse(`"${m[1]}"`);
				} catch {
					this.extractedPath = m[1];
				}
				this.phase = 'find_content';
				// Recurse with text after the matched path value.
				const after = this.searchBuf.slice(
					this.searchBuf.indexOf(m[0]) + m[0].length
				);
				this.searchBuf = '';
				return this.process(after);
			}
			// Slide window — keep enough chars for boundary detection.
			if (this.searchBuf.length > 256) this.searchBuf = this.searchBuf.slice(-64);
			return '';
		}

		if (this.phase === 'find_content') {
			this.searchBuf += chunk;
			const marker = '"content":"';
			const idx = this.searchBuf.indexOf(marker);
			if (idx !== -1) {
				this.phase = 'in_content';
				const rest = this.searchBuf.slice(idx + marker.length);
				this.searchBuf = '';
				return this.streamContent(rest);
			}
			if (this.searchBuf.length > marker.length + 64)
				this.searchBuf = this.searchBuf.slice(-(marker.length + 16));
			return '';
		}

		return this.streamContent(chunk);
	}

	private streamContent(chars: string): string {
		let out = '';
		for (const ch of chars) {
			if (this.phase === 'done') break;

			// Accumulate \uXXXX unicode escapes
			if (this.unicodeNeeded > 0) {
				this.unicodeBuf += ch;
				this.unicodeNeeded--;
				if (this.unicodeNeeded === 0) {
					const cp = parseInt(this.unicodeBuf, 16);
					const decoded = isNaN(cp) ? '' : String.fromCharCode(cp);
					out += decoded;
					this.fullContent += decoded;
					this.unicodeBuf = '';
				}
				continue;
			}

			if (this.escapeNext) {
				this.escapeNext = false;
				let decoded: string;
				switch (ch) {
					case 'n':
						decoded = '\n';
						break;
					case 't':
						decoded = '\t';
						break;
					case 'r':
						decoded = '\r';
						break;
					case '"':
						decoded = '"';
						break;
					case '\\':
						decoded = '\\';
						break;
					case '/':
						decoded = '/';
						break;
					case 'u':
						this.unicodeNeeded = 4;
						this.unicodeBuf = '';
						decoded = '';
						break;
					default:
						decoded = ch;
				}
				if (decoded) {
					out += decoded;
					this.fullContent += decoded;
				}
				continue;
			}

			if (ch === '\\') {
				this.escapeNext = true;
				continue;
			}
			if (ch === '"') {
				// Closing quote of the content string — we're done.
				this.phase = 'done';
				break;
			}
			out += ch;
			this.fullContent += ch;
		}
		return out;
	}

	get isDone(): boolean {
		return this.phase === 'done';
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
	content: string | null; // null = reuse existing r2Key
	r2Key: string | null;
	sizeBytes: number;
	hash: string;
}

/** Pending tool call assembled from streaming argument deltas. */
interface PendingTool {
	id: string;
	name: string;
	argsRaw: string;
	// write_file specific
	streamer?: WriteFileContentStreamer;
	headerEmitted: boolean;
	endEmitted: boolean;
}

// ── RealtimeHub ───────────────────────────────────────────────────────────────

/**
 * Per-project generation runner + live SSE relay (PRD §11.4).
 * SQLite-backed Durable Object. The app worker triggers `/start` (fire-and-forget via
 * waitUntil) and clients attach to `/subscribe` for live token events.
 *
 * Generation uses a streaming tool-use agentic loop so:
 * - The model only reads the files it needs (token-efficient)
 * - write_file content is streamed character-by-character to the client
 *   in =FILE= delimiter format, so the live file-list spinner works exactly
 *   as it did with the text-streaming approach.
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

	private emit(live: Live, text: string): void {
		live.buffer += text;
		this.writeAll(live, this.sse('token', { content: text }));
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
			// Load file metadata from D1 — content fetched lazily via read_file tool.
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
				for (const r of rows) {
					prevMeta.set(r.path, {
						path: r.path,
						r2Key: r.r2Key,
						sizeBytes: r.sizeBytes,
						hash: r.contentHash
					});
				}
			}

			// In-session VFS: caches content for files read or written this run.
			const vfsContent = new Map<string, string>();
			const writtenFiles = new Map<string, string>(); // path → new content
			const deletedPaths = new Set<string>();
			const contentParts: string[] = []; // assembled for the D1 assistant message

			const agentMessages: AgentMessage[] = [
				{ role: 'system', content: AGENT_SYSTEM_PROMPT },
				{ role: 'user', content: job.prompt }
			];

			// ── Streaming agentic loop ────────────────────────────────────────
			const MAX_ITERS = 20;

			for (let iter = 0; iter < MAX_ITERS; iter++) {
				const pending = new Map<number, PendingTool>();
				let textBuffer = ''; // model's prose for this turn
				let finishReason = '';

				for await (const event of streamWithTools({
					apiKey: this.env.OPENROUTER_API_KEY,
					model: job.model ?? DEFAULT_MODEL,
					messages: agentMessages,
					tools: FILE_TOOLS
				})) {
					switch (event.type) {
						case 'content':
							// Model prose (thinking / explanation) — stream to client.
							textBuffer += event.delta;
							this.emit(live, event.delta);
							break;

						case 'tool_call': {
							const { index, id, name, args } = event.delta;
							if (!pending.has(index)) {
								pending.set(index, {
									id: id ?? '',
									name: name ?? '',
									argsRaw: '',
									headerEmitted: false,
									endEmitted: false
								});
							}
							const ptc = pending.get(index)!;
							if (id) ptc.id = id;
							if (name) ptc.name = name;

							if (args && ptc.name === 'write_file') {
								ptc.argsRaw += args;

								// Initialise streamer once the name is confirmed.
								if (!ptc.streamer) ptc.streamer = new WriteFileContentStreamer();

								const delta = ptc.streamer.process(args);

								// Emit FILE header as soon as we know the path.
								if (!ptc.headerEmitted && ptc.streamer.extractedPath) {
									const path = sanitizePath(ptc.streamer.extractedPath);
									if (path) {
										ptc.headerEmitted = true;
										this.emit(live, `=== FILE: ${path} ===\n`);
									}
								}

								// Stream content characters — spinner stays on until END FILE.
								if (delta) this.emit(live, delta);

								// Emit END FILE when the content string closes.
								if (ptc.streamer.isDone && !ptc.endEmitted) {
									ptc.endEmitted = true;
									this.emit(live, '\n=== END FILE ===\n');
									// Add the complete block to contentParts for D1 storage.
									const path = sanitizePath(ptc.streamer.extractedPath ?? '');
									if (path) {
										contentParts.push(
											`=== FILE: ${path} ===\n${ptc.streamer.fullContent}\n=== END FILE ===`
										);
									}
								}
							} else if (args) {
								ptc.argsRaw += args;
							}
							break;
						}

						case 'finish':
							finishReason = event.reason;
							break;

						case 'done':
							break;
					}
				}

				if (textBuffer) contentParts.push(textBuffer);

				// No tool calls in this turn → model is done.
				if (finishReason !== 'tool_calls' || pending.size === 0) break;

				// ── Execute tool calls ────────────────────────────────────────
				const toolResults: AgentMessage[] = [];
				const sortedPending = [...pending.entries()].sort(([a], [b]) => a - b);

				for (const [, ptc] of sortedPending) {
					let result: string;

					switch (ptc.name) {
						case 'list_files': {
							const current = [
								...[...prevMeta.keys()].filter(
									(p) => !deletedPaths.has(p) && !writtenFiles.has(p)
								),
								...writtenFiles.keys()
							].map((p) => ({ path: p }));
							result = JSON.stringify(current);
							break;
						}

						case 'read_file': {
							let args: { path?: string } = {};
							try {
								args = JSON.parse(ptc.argsRaw) as { path?: string };
							} catch { /* ignore */ }
							const path = sanitizePath(String(args.path ?? ''));
							if (vfsContent.has(path)) {
								result = vfsContent.get(path)!;
							} else {
								const meta = prevMeta.get(path);
								if (meta) {
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
							// Content was already streamed; extract final values from streamer.
							const streamer = ptc.streamer;
							if (streamer) {
								const path = sanitizePath(streamer.extractedPath ?? '');
								if (path) {
									writtenFiles.set(path, streamer.fullContent);
									vfsContent.set(path, streamer.fullContent);
									deletedPaths.delete(path);
								}
							} else {
								// Fallback: parse argsRaw if streamer wasn't used.
								try {
									const a = JSON.parse(ptc.argsRaw) as { path?: string; content?: string };
									const path = sanitizePath(String(a.path ?? ''));
									const content = String(a.content ?? '');
									if (path) {
										writtenFiles.set(path, content);
										vfsContent.set(path, content);
										deletedPaths.delete(path);
										// Emit block to client (streamer wasn't active).
										const block = `=== FILE: ${path} ===\n${content}\n=== END FILE ===\n`;
										this.emit(live, block);
										contentParts.push(
											`=== FILE: ${path} ===\n${content}\n=== END FILE ===`
										);
									}
								} catch { /* ignore */ }
							}
							result = JSON.stringify({ ok: true });
							break;
						}

						case 'delete_file': {
							let args: { path?: string } = {};
							try {
								args = JSON.parse(ptc.argsRaw) as { path?: string };
							} catch { /* ignore */ }
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

					toolResults.push({ role: 'tool', tool_call_id: ptc.id, content: result });
				}

				// Append assistant turn (with tool_calls) + results to message history.
				const assistantTurn: AgentMessage = {
					role: 'assistant',
					content: textBuffer || null,
					tool_calls: sortedPending.map(([, ptc]) => ({
						id: ptc.id,
						type: 'function',
						function: { name: ptc.name, arguments: ptc.argsRaw }
					} satisfies ToolCall))
				};
				agentMessages.push(assistantTurn);
				agentMessages.push(...toolResults);
			}

			// ── Persist results ───────────────────────────────────────────────
			const ts = Date.now();
			const assistantContent = contentParts.join('\n');

			// Build final file set: carry-forward unchanged + add written.
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

			const inputTokens =
				estimateTokens(AGENT_SYSTEM_PROMPT) +
				estimateTokens(job.prompt) +
				agentMessages
					.filter((m) => m.role === 'tool')
					.reduce((n, m) => n + estimateTokens('content' in m ? String(m.content) : ''), 0);

			await db.insert(messages).values({
				id: ulid(),
				projectId: job.projectId,
				role: 'assistant',
				content: assistantContent,
				tokenCount: estimateTokens(assistantContent),
				modelUsed: job.model ?? DEFAULT_MODEL,
				generationId: job.generationId,
				createdAt: ts,
				updatedAt: ts,
				deletedAt: null
			});

			await recordUsage(db, job.userId, {
				input: inputTokens,
				output: estimateTokens(assistantContent)
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

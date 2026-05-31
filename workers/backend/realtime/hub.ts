import { eq } from 'drizzle-orm';
import { createDb } from '../../../src/lib/server/db';
import { generations, generatedFiles, messages, projects } from '../../../src/lib/server/db/schema';
import { streamChat, estimateTokens, DEFAULT_MODEL } from '../../../src/lib/server/ai';
import { parseGeneratedFiles } from '../../../src/lib/server/ai/parser';
import { fileKey, putFile, contentHash } from '../../../src/lib/server/storage/r2';
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

const SYSTEM_PROMPT = `You are BuilderPro, an expert full-stack engineer. Given a description,
generate a complete, runnable project. Output ONLY files, each delimited exactly like this:

=== FILE: relative/path/to/file.ext ===
<file contents>
=== END FILE ===

Rules:
- Use forward slashes in paths; never use absolute paths or "..".
- Emit every file the project needs (source, config, README).
- Do not wrap files in markdown code fences. Brief prose between blocks is allowed but ignored.`;

/**
 * Per-project WebSocket hub + generation runner (PRD §11.4).
 * SQLite-backed Durable Object (free-tier eligible). One instance per projectId.
 */
export class RealtimeHub {
	private sessions = new Set<WebSocket>();

	constructor(
		private state: DurableObjectState,
		private env: Env
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/ws') return this.handleWebSocket();
		if (url.pathname === '/start') return this.handleStart(request);
		return new Response('Not found', { status: 404 });
	}

	private handleWebSocket(): Response {
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();
		this.sessions.add(server);
		server.addEventListener('close', () => this.sessions.delete(server));
		server.addEventListener('error', () => this.sessions.delete(server));
		return new Response(null, { status: 101, webSocket: client });
	}

	private broadcast(event: Record<string, unknown>): void {
		const payload = JSON.stringify(event);
		for (const ws of this.sessions) {
			try {
				ws.send(payload);
			} catch {
				this.sessions.delete(ws);
			}
		}
	}

	private async handleStart(request: Request): Promise<Response> {
		const job = (await request.json()) as StartJob;
		// Keep the DO alive for the whole generation; the app worker called us via waitUntil.
		await this.runGeneration(job);
		return new Response('ok');
	}

	private async runGeneration(job: StartJob): Promise<void> {
		const db = createDb(this.env.DB);
		const now = () => Date.now();

		if (!this.env.OPENROUTER_API_KEY) {
			await this.failGeneration(db, job, 'AI service is not configured.');
			return;
		}

		try {
			this.broadcast({ type: 'status', status: 'running', generationId: job.generationId });

			let full = '';
			for await (const delta of streamChat({
				apiKey: this.env.OPENROUTER_API_KEY,
				model: job.model ?? DEFAULT_MODEL,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: job.prompt }
				]
			})) {
				if (delta.done) break;
				full += delta.content;
				this.broadcast({ type: 'token', content: delta.content });
			}

			const files = parseGeneratedFiles(full);
			const ts = now();

			for (const file of files) {
				const key = fileKey(job.projectId, job.version, file.path);
				await putFile(this.env.BUCKET, key, file.content);
				await db.insert(generatedFiles).values({
					id: ulid(),
					projectId: job.projectId,
					generationId: job.generationId,
					path: file.path,
					version: job.version,
					r2Key: key,
					sizeBytes: new TextEncoder().encode(file.content).byteLength,
					contentHash: contentHash(file.content),
					createdAt: ts,
					updatedAt: ts,
					deletedAt: null
				});
			}

			// Persist the assistant reply (full text shown in chat).
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
				input: estimateTokens(job.prompt) + estimateTokens(SYSTEM_PROMPT),
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

			this.broadcast({
				type: 'done',
				generationId: job.generationId,
				version: job.version,
				fileCount: files.length
			});
		} catch (err) {
			// User-safe message only — never leak provider internals or PII (PRD §5 M4).
			console.error('generation failed', err);
			await this.failGeneration(db, job, 'Generation failed. Please try again.');
		}
	}

	private async failGeneration(
		db: ReturnType<typeof createDb>,
		job: StartJob,
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
		this.broadcast({ type: 'error', generationId: job.generationId, message });
	}
}

// Minimal SSE reader for the OpenAI-compatible streaming format used by OpenRouter.
// No SDK — we parse `data: {json}\n\n` frames directly (PRD §10.1).

export interface ChatDelta {
	content: string;
	done: boolean;
}

interface OpenAIStreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
			tool_calls?: Array<{
				index: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}>;
		};
		finish_reason?: string | null;
	}>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Async-iterates content deltas from an OpenAI-compatible SSE response body.
 * Yields `{ content, done }`. The terminal `[DONE]` sentinel ends the stream.
 */
export async function* parseSSE(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<ChatDelta, void, unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let nl: number;
			while ((nl = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (!line.startsWith('data:')) continue;

				const payload = line.slice(5).trim();
				if (payload === '[DONE]') {
					yield { content: '', done: true };
					return;
				}

				let chunk: OpenAIStreamChunk;
				try {
					chunk = JSON.parse(payload) as OpenAIStreamChunk;
				} catch {
					continue; // skip malformed keep-alive / partial frames
				}
				const content = chunk.choices?.[0]?.delta?.content;
				if (content) yield { content, done: false };
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// ── Streaming tool-call events ────────────────────────────────────────────────

export interface ToolCallDelta {
	index: number;
	id?: string;
	name?: string;
	args?: string; // incremental JSON argument fragment
}

/**
 * Richer event stream for tool-use completions (stream: true + tools).
 * Consumers accumulate tool_call deltas and execute when finish='tool_calls'.
 */
export type AgentStreamEvent =
	| { type: 'content'; delta: string }
	| { type: 'tool_call'; delta: ToolCallDelta }
	| { type: 'finish'; reason: string }
	| { type: 'done' };

export async function* parseSSEWithTools(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<AgentStreamEvent, void, unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let nl: number;
			while ((nl = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (!line.startsWith('data:')) continue;

				const payload = line.slice(5).trim();
				if (payload === '[DONE]') {
					yield { type: 'done' };
					return;
				}

				let chunk: OpenAIStreamChunk;
				try {
					chunk = JSON.parse(payload) as OpenAIStreamChunk;
				} catch {
					continue;
				}

				const choice = chunk.choices?.[0];
				if (!choice) continue;

				if (choice.delta?.content) {
					yield { type: 'content', delta: choice.delta.content };
				}

				if (choice.delta?.tool_calls) {
					for (const tc of choice.delta.tool_calls) {
						yield {
							type: 'tool_call',
							delta: {
								index: tc.index,
								id: tc.id,
								name: tc.function?.name,
								args: tc.function?.arguments
							}
						};
					}
				}

				if (choice.finish_reason) {
					yield { type: 'finish', reason: choice.finish_reason };
				}
			}
		}
		yield { type: 'done' };
	} finally {
		reader.releaseLock();
	}
}

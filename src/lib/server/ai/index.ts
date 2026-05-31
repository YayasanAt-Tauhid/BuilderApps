import { parseSSE, type ChatDelta } from './stream';

// OpenRouter client (OpenAI-compatible). Called from the backend worker / Durable Object.
// No SDK — plain fetch keeps the Worker bundle small and avoids Node-only code (PRD §10.1).

export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface GenerateOptions {
	apiKey: string;
	messages: ChatMessage[];
	model?: string;
	signal?: AbortSignal;
}

export class OpenRouterError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'OpenRouterError';
	}
}

/**
 * Opens a streaming chat completion and yields content deltas as they arrive.
 * The caller (RealtimeHub DO) relays these over WebSocket and accumulates the full text.
 */
export async function* streamChat(opts: GenerateOptions): AsyncGenerator<ChatDelta, void, unknown> {
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			'Content-Type': 'application/json',
			// Optional OpenRouter attribution headers.
			'HTTP-Referer': 'https://builderpro.app',
			'X-Title': 'BuilderPro'
		},
		body: JSON.stringify({
			model: opts.model ?? DEFAULT_MODEL,
			messages: opts.messages,
			stream: true
		}),
		signal: opts.signal
	});

	if (!res.ok || !res.body) {
		// Read a bounded amount of the error body; never surface raw provider internals to users.
		const detail = await res.text().catch(() => '');
		throw new OpenRouterError(
			`OpenRouter request failed (${res.status}): ${detail.slice(0, 200)}`,
			res.status
		);
	}

	yield* parseSSE(res.body);
}

/** Rough token estimate (~4 chars/token) for metering when the API omits usage. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// ── Tool-use / agentic API ────────────────────────────────────────────────────

export interface ToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

/**
 * Union of all message shapes accepted by the tool-use loop.
 * Matches the OpenAI function-calling wire format (used by OpenRouter).
 */
export type AgentMessage =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string };

/**
 * Single non-streaming round-trip that supports function/tool calls.
 * Returns the assistant turn, which may contain tool_calls for the caller to execute.
 */
export async function chatWithTools(opts: {
	apiKey: string;
	model: string;
	messages: AgentMessage[];
	tools: ToolDefinition[];
	signal?: AbortSignal;
}): Promise<{ role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }> {
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://builderpro.app',
			'X-Title': 'BuilderPro'
		},
		body: JSON.stringify({
			model: opts.model,
			messages: opts.messages,
			tools: opts.tools,
			stream: false
		}),
		signal: opts.signal
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new OpenRouterError(
			`OpenRouter request failed (${res.status}): ${detail.slice(0, 200)}`,
			res.status
		);
	}

	const data = (await res.json()) as {
		choices: Array<{
			message: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] };
		}>;
	};

	return data.choices[0].message;
}

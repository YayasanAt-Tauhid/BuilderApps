import { parseSSE, parseSSEWithTools, type ChatDelta, type AgentStreamEvent } from './stream';

export type { AgentStreamEvent, ToolCallDelta } from './stream';

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
	maxTokens?: number;
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

export async function* streamChat(opts: GenerateOptions): AsyncGenerator<ChatDelta, void, unknown> {
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://builderpro.app',
			'X-Title': 'BuilderPro'
		},
		body: JSON.stringify({
			model: opts.model ?? DEFAULT_MODEL,
			messages: opts.messages,
			max_tokens: opts.maxTokens ?? 16000,
			stream: true
		}),
		signal: opts.signal
	});

	if (!res.ok || !res.body) {
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
 * Union of all message shapes accepted by the agentic loop.
 * Matches the OpenAI function-calling wire format used by OpenRouter.
 */
export type AgentMessage =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string };

/**
 * Streaming chat completion with tool-use support.
 * Yields AgentStreamEvents: content deltas, tool_call argument fragments,
 * finish reason, and a terminal done event.
 * The caller accumulates tool_call deltas and executes tools on finish='tool_calls'.
 */
export async function* streamWithTools(opts: {
	apiKey: string;
	model: string;
	messages: AgentMessage[];
	tools: ToolDefinition[];
	signal?: AbortSignal;
}): AsyncGenerator<AgentStreamEvent, void, unknown> {
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
			tool_choice: 'auto',
			stream: true
		}),
		signal: opts.signal
	});

	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => '');
		throw new OpenRouterError(
			`OpenRouter request failed (${res.status}): ${detail.slice(0, 200)}`,
			res.status
		);
	}

	yield* parseSSEWithTools(res.body);
}

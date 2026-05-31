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

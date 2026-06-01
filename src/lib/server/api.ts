import { json } from '@sveltejs/kit';

// Standard API response envelope (PRD §9).

export interface ApiSuccess<T> {
	data: T;
	meta?: { page?: number; total?: number };
}

export interface ApiError {
	error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, meta?: ApiSuccess<T>['meta'], status = 200): Response {
	const body: ApiSuccess<T> = meta ? { data, meta } : { data };
	return json(body, { status });
}

export function fail(code: string, message: string, status = 400, details?: unknown): Response {
	const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
	return json(body, { status });
}

// Common error helpers — user-safe messages only, never leak internals/PII (PRD §5 M4).
export const errors = {
	unauthorized: () => fail('unauthorized', 'Authentication required.', 401),
	forbidden: () => fail('forbidden', 'You do not have access to this resource.', 403),
	notFound: (what = 'Resource') => fail('not_found', `${what} not found.`, 404),
	validation: (details?: unknown) => fail('validation_error', 'Invalid input.', 422, details),
	rateLimited: () => fail('rate_limited', 'Too many requests. Please slow down.', 429),
	quotaExceeded: () => fail('quota_exceeded', 'You have reached your AI usage limit.', 429),
	conflict: (message = 'Conflict.') => fail('conflict', message, 409),
	badRequest: (message = 'Bad request.') => fail('bad_request', message, 400),
	internal: () => fail('internal_error', 'Something went wrong. Please try again.', 500)
};

// Applied in hooks.server.ts to every response (PRD §5 M1 cookie flags + general hardening).

export function applySecurityHeaders(response: Response): Response {
	const h = response.headers;
	h.set('X-Content-Type-Options', 'nosniff');
	h.set('X-Frame-Options', 'DENY');
	h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
	h.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data:",
			"connect-src 'self' wss: https:",
			// Generated frontend preview runs in a sandboxed iframe (PRD §4 Should).
			"frame-src 'self' blob:",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'"
		].join('; ')
	);
	return response;
}

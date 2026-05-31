// Applied in hooks.server.ts to every response (PRD §5 M1 cookie flags + general hardening).

export function applySecurityHeaders(response: Response): Response {
	const h = response.headers;
	h.set('X-Content-Type-Options', 'nosniff');
	// SAMEORIGIN (not DENY) so the app can frame its own sandboxed preview iframe.
	h.set('X-Frame-Options', 'SAMEORIGIN');
	h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
	// NOTE: the Content-Security-Policy is emitted by SvelteKit itself (see
	// svelte.config.js `kit.csp`), which hashes its inline bootstrap script. We must
	// NOT set a competing CSP here — a second policy would also block that inline
	// script (and would clobber the sandboxed preview route's own CSP).
	return response;
}

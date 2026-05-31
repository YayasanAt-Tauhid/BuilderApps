// Minimal worker entry for the integration-test runtime. Tests import the shared
// library directly (with real bindings via `cloudflare:test`); this default export
// just satisfies the pool's requirement for a worker `main`.
export default {
	async fetch(): Promise<Response> {
		return new Response('test worker');
	}
};

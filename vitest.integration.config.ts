import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Integration tests — run inside the Workers runtime (workerd) via Miniflare,
// so D1/KV/R2 bindings are available. See PRD §14.2.
export default defineWorkersConfig({
	test: {
		name: 'integration',
		include: ['tests/integration/**/*.{test,spec}.ts'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					compatibilityDate: '2026-05-30',
					compatibilityFlags: ['nodejs_compat']
				}
			}
		}
	}
});

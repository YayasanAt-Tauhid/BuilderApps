import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Integration tests — run inside the Workers runtime (workerd) via Miniflare,
// so D1/KV/R2 bindings are available. See PRD §14.2.
// (vitest-pool-workers v0.16.x / vitest 4 uses the `cloudflareTest` plugin rather
//  than the older `defineWorkersConfig` helper — resolves the §10.3 ⚠️ flag.)
export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.test.jsonc' },
			miniflare: {
				compatibilityDate: '2026-05-30',
				compatibilityFlags: ['nodejs_compat']
			}
		})
	],
	test: {
		name: 'integration',
		include: ['tests/integration/**/*.{test,spec}.ts']
	}
});

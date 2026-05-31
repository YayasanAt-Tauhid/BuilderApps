import { defineConfig } from 'vitest/config';

// Unit tests — plain node environment (pure functions, schemas, quota logic).
export default defineConfig({
	test: {
		name: 'unit',
		include: ['tests/unit/**/*.{test,spec}.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/paraglide/**', 'src/lib/components/**'],
			thresholds: {
				lines: 80
			}
		}
	}
});

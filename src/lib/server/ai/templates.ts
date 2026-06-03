// src/lib/server/ai/templates.ts
// Boilerplate files pre-injected for every new SvelteKit+Supabase project.
// These are identical across all projects (or parameterized by slug only).
// Pre-injecting them saves ~1000 tokens per first-generation AI call.

export function buildTemplateFiles(slug: string): Map<string, string> {
	const files = new Map<string, string>();

	files.set(
		'package.json',
		JSON.stringify(
			{
				name: slug,
				private: true,
				type: 'module',
				scripts: {
					prepare: 'svelte-kit sync || echo ""',
					dev: 'vite dev',
					build: 'vite build',
					preview: 'vite preview'
				},
				dependencies: {
					'@supabase/supabase-js': '^2.0.0'
				},
				devDependencies: {
					'@sveltejs/adapter-static': '^3.0.0',
					'@sveltejs/kit': '^2.0.0',
					'@sveltejs/vite-plugin-svelte': '^5.0.0',
					'@tailwindcss/vite': '^4.0.0',
					svelte: '^5.0.0',
					tailwindcss: '^4.0.0',
					typescript: '^5.0.0',
					vite: '^6.0.0'
				}
			},
			null,
			2
		)
	);

	// adapter-static: outputs to dist/ — served directly from Cloudflare R2.
	// fallback: 'index.html' enables SPA-style client-side routing.
	files.set(
		'svelte.config.js',
		`import adapter from '@sveltejs/adapter-static';
export default {
  kit: {
    adapter: adapter({ pages: 'dist', assets: 'dist', fallback: 'index.html' })
  }
};
`
	);

	files.set(
		'vite.config.ts',
		`import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [tailwindcss(), sveltekit()] });
`
	);

	files.set('tsconfig.json', `{ "extends": "./.svelte-kit/tsconfig.json" }\n`);

	files.set(
		'src/app.html',
		`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="%sveltekit.assets%/favicon.png" />
  %sveltekit.head%
</head>
<body data-sveltekit-preload-data="hover">%sveltekit.body%</body>
</html>
`
	);

	files.set('src/app.css', `@import 'tailwindcss';\n`);

	files.set(
		'src/routes/+layout.svelte',
		`<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>
{@render children()}
`
	);

	files.set(
		'.env.example',
		`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
`
	);

	// pnpm 11 blocks build scripts by default — explicitly allow esbuild (needed by vite).
	files.set(
		'pnpm-workspace.yaml',
		`onlyBuiltDependencies:
  - esbuild
`
	);

	// GitHub Actions workflow: build → upload dist/ to R2 → notify BuilderPro.
	// Secrets are auto-injected by BuilderPro when the project is synced to GitHub.
	files.set(
		'.github/workflows/deploy.yml',
		`name: Build & Deploy to R2

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: \${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: \${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Upload dist to Cloudflare R2
        run: |
          aws s3 sync dist/ "s3://\${CF_R2_BUCKET}/published/\${PROJECT_ID}/" \\
            --endpoint-url "https://\${CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \\
            --delete --no-progress
        env:
          AWS_ACCESS_KEY_ID: \${{ secrets.CF_R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: \${{ secrets.CF_R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          CF_R2_ACCOUNT_ID: \${{ secrets.CF_R2_ACCOUNT_ID }}
          CF_R2_BUCKET: \${{ secrets.CF_R2_BUCKET_NAME }}
          PROJECT_ID: \${{ secrets.PROJECT_ID }}

      - name: Notify BuilderPro
        if: success()
        run: |
          curl -fsS -X POST "\${BUILDERPRO_WEBHOOK_URL}" \\
            -H "Authorization: Bearer \${BUILDERPRO_DEPLOY_SECRET}" \\
            -H "Content-Type: application/json" \\
            -d "{\\"projectId\\":\\"\${PROJECT_ID}\\"}"
        env:
          BUILDERPRO_WEBHOOK_URL: \${{ secrets.BUILDERPRO_WEBHOOK_URL }}
          BUILDERPRO_DEPLOY_SECRET: \${{ secrets.BUILDERPRO_DEPLOY_SECRET }}
          PROJECT_ID: \${{ secrets.PROJECT_ID }}
`
	);

	return files;
}

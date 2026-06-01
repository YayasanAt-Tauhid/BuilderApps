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
				scripts: {
					dev: 'vite dev',
					build: 'vite build',
					preview: 'vite preview'
				},
				dependencies: {
					'@supabase/supabase-js': '^2.0.0'
				},
				devDependencies: {
					'@sveltejs/adapter-cloudflare': '^5.0.0',
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

	files.set(
		'svelte.config.js',
		`import adapter from '@sveltejs/adapter-cloudflare';
export default { kit: { adapter: adapter() } };
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

	files.set(
		'wrangler.toml',
		`name = "${slug}"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".svelte-kit/cloudflare"
`
	);

	files.set(
		'.github/workflows/deploy.yml',
		`name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CF_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - name: Apply Supabase migrations
        run: npx supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
        continue-on-error: true
      - run: pnpm build
        env:
          VITE_SUPABASE_URL: \${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: \${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - name: Deploy to Cloudflare Pages
        if: \${{ env.CF_TOKEN != '' }}
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ env.CF_TOKEN }}
          command: pages deploy .svelte-kit/cloudflare --project-name=${slug}
        env:
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`
	);

	return files;
}

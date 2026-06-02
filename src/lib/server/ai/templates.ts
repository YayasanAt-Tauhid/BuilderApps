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

	return files;
}

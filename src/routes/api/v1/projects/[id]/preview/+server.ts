import { eq, and, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { errors } from '$lib/server/api';
import { requireOwnedProject, getEnv } from '$lib/server/context';
import { generatedFiles } from '$lib/server/db/schema';
import { getFileText } from '$lib/server/storage/r2';

function isLocal(ref: string): boolean {
	return !/^([a-z]+:)?\/\//i.test(ref) && !ref.startsWith('data:') && !ref.startsWith('#');
}

/** Inline local <link rel=stylesheet> and <script src> using sibling files in the version. */
function inlineAssets(html: string, files: Map<string, string>): string {
	let out = html;

	const find = (ref: string): string | undefined => {
		const clean = ref.replace(/^\.?\//, '').split(/[?#]/)[0];
		if (files.has(clean)) return files.get(clean);
		const base = clean.split('/').pop() ?? clean;
		for (const [p, c] of files) if (p === base || p.endsWith('/' + base)) return c;
		return undefined;
	};

	out = out.replace(/<link\b[^>]*>/gi, (tag) => {
		if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
		const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
		if (!href || !isLocal(href)) return tag;
		const css = find(href);
		return css !== undefined ? `<style>\n${css}\n</style>` : tag;
	});

	out = out.replace(
		/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
		(tag, _a, src) => {
			if (!isLocal(src)) return tag;
			const js = find(src);
			return js !== undefined ? `<script>\n${js}\n</script>` : tag;
		}
	);

	return out;
}

/** Detect if this looks like a SvelteKit project (has .svelte files or svelte.config.js). */
function isSvelteKitProject(paths: string[]): boolean {
	return paths.some(
		(p) => p.endsWith('.svelte') || p === 'svelte.config.js' || p.startsWith('src/routes/')
	);
}

/** Generate a preview page that explains the project needs a build step. */
function buildkitNotice(projectName: string): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Preview — ${projectName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;max-width:480px;width:100%;box-shadow:0 4px 24px #0001}
    h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
    p{color:#64748b;font-size:.9rem;line-height:1.6;margin-bottom:1rem}
    code{background:#f1f5f9;padding:.2em .4em;border-radius:.3em;font-size:.85em;font-family:monospace}
    .steps{list-style:none;counter-reset:s}
    .steps li{counter-increment:s;padding:.5rem 0 .5rem 2.5rem;position:relative;border-top:1px solid #f1f5f9;font-size:.875rem;color:#475569}
    .steps li::before{content:counter(s);position:absolute;left:0;top:.5rem;width:1.5rem;height:1.5rem;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700}
    .badge{display:inline-flex;align-items:center;gap:.4rem;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:.5rem;padding:.4rem .8rem;font-size:.8rem;font-weight:600;margin-top:.5rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>🏗️ SvelteKit Project — Build Required</h1>
    <p>This project is a full <strong>SvelteKit + TypeScript</strong> application. It needs to be compiled before it can run in the browser.</p>
    <ol class="steps">
      <li>Push the generated files to <strong>GitHub</strong> using the "Push to GitHub" button</li>
      <li>Add <code>CLOUDFLARE_API_TOKEN</code> as a GitHub Actions secret in your repo settings</li>
      <li>The included <code>.github/workflows/deploy.yml</code> will automatically build and deploy to <strong>Cloudflare Pages</strong></li>
      <li>Your live URL will appear in the GitHub Actions logs and Cloudflare dashboard</li>
    </ol>
    <p style="margin-top:1rem">Or to run locally:</p>
    <p><code>pnpm install &amp;&amp; pnpm dev</code></p>
    <div class="badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
      Includes wrangler.toml + GitHub Actions workflow
    </div>
  </div>
</body>
</html>`;
}

export const GET: RequestHandler = async (event) => {
	const { db, project } = await requireOwnedProject(event, event.params.id);
	const env = getEnv(event);

	const [{ latest }] = await db
		.select({ latest: sql<number>`coalesce(max(${generatedFiles.version}), 0)` })
		.from(generatedFiles)
		.where(eq(generatedFiles.projectId, project.id));

	const version = Number(latest);
	if (version === 0) return errors.notFound('Preview');

	const rows = await db
		.select({ path: generatedFiles.path, r2Key: generatedFiles.r2Key })
		.from(generatedFiles)
		.where(and(eq(generatedFiles.projectId, project.id), eq(generatedFiles.version, version)));

	const allPaths = rows.map((r) => r.path);

	// SvelteKit project → show build-required notice (can't serve .svelte source directly).
	if (isSvelteKitProject(allPaths)) {
		return new Response(buildkitNotice(project.name), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store',
				'Content-Security-Policy': [
					'sandbox allow-scripts',
					"default-src 'none'",
					"style-src 'unsafe-inline'",
					"script-src 'none'"
				].join('; ')
			}
		});
	}

	// Legacy plain HTML project — inline assets and serve sandboxed.
	const files = new Map<string, string>();
	let entryPath: string | undefined;
	for (const r of rows) {
		const lower = r.path.toLowerCase();
		if (lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js')) {
			const text = await getFileText(env.BUCKET, r.r2Key);
			if (text !== null) files.set(r.path, text);
		}
		if (!entryPath && lower.endsWith('index.html')) entryPath = r.path;
		if (!entryPath && lower.endsWith('.html')) entryPath = r.path;
	}

	const rawHtml =
		(entryPath && files.get(entryPath)) ??
		'<!doctype html><html><body style="font-family:system-ui;padding:2rem">' +
			'<p>No HTML entry point to preview.</p></body></html>';

	const html = inlineAssets(rawHtml, files);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			'Content-Security-Policy': [
				'sandbox allow-scripts allow-forms allow-popups',
				"default-src 'none'",
				"style-src 'unsafe-inline' https:",
				"script-src 'unsafe-inline' https:",
				'img-src data: https:',
				'font-src https: data:',
				'connect-src https:'
			].join('; ')
		}
	});
};

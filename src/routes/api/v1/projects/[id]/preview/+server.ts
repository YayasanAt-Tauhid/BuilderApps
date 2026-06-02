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
    body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:1.25rem;padding:2rem;max-width:520px;width:100%;box-shadow:0 4px 32px #0001}
    .logo{font-size:2rem;margin-bottom:.75rem}
    h1{font-size:1.15rem;font-weight:700;margin-bottom:.25rem}
    .sub{color:#64748b;font-size:.875rem;margin-bottom:1.5rem}
    .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:.75rem;padding:1rem;margin-bottom:.75rem}
    .section h2{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6366f1;margin-bottom:.5rem}
    .steps{list-style:none;counter-reset:s;margin:0}
    .steps li{counter-increment:s;padding:.4rem 0 .4rem 2rem;position:relative;font-size:.85rem;color:#475569;border-top:1px solid #f1f5f9}
    .steps li:first-child{border-top:none}
    .steps li::before{content:counter(s);position:absolute;left:0;top:.35rem;width:1.35rem;height:1.35rem;border-radius:50%;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700}
    code{background:#f1f5f9;padding:.15em .4em;border-radius:.3em;font-size:.8em;font-family:monospace;color:#0f172a}
    .tag{display:inline-flex;align-items:center;gap:.3rem;border-radius:.4rem;padding:.25rem .6rem;font-size:.75rem;font-weight:600}
    .green{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
    .blue{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
    .tags{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏗️</div>
    <h1>${projectName} — SvelteKit + Supabase</h1>
    <p class="sub">This project uses a full-stack framework and needs to be compiled before it can run. Follow the steps below to deploy.</p>

    <div class="section">
      <h2>1 — Setup Supabase</h2>
      <ol class="steps">
        <li>Buka <strong>supabase.com</strong> → buat project baru</li>
        <li>Salin <code>Project URL</code> dan <code>anon public key</code> dari Settings → API</li>
        <li>Buat tabel yang dibutuhkan di <strong>Table Editor</strong> (sesuai struktur di kode)</li>
        <li>Tambahkan sebagai GitHub Secrets: <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code></li>
      </ol>
    </div>

    <div class="section">
      <h2>2 — Deploy ke Cloudflare Pages</h2>
      <ol class="steps">
        <li>Klik <strong>Push to GitHub</strong> di halaman Files</li>
        <li>Di GitHub repo → Settings → Secrets, tambahkan: <code>CLOUDFLARE_API_TOKEN</code>, <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code></li>
        <li>GitHub Actions akan otomatis build + deploy ke Cloudflare Pages</li>
        <li>URL live muncul di tab Actions dan Cloudflare dashboard</li>
      </ol>
    </div>

    <div class="section">
      <h2>3 — Jalankan lokal</h2>
      <ol class="steps">
        <li>Salin <code>.env.example</code> → <code>.env</code> lalu isi dengan kredensial Supabase</li>
        <li>Jalankan: <code>pnpm install &amp;&amp; pnpm dev</code></li>
      </ol>
    </div>

    <div class="tags">
      <span class="tag green">✓ SvelteKit + TypeScript</span>
      <span class="tag green">✓ Supabase Database</span>
      <span class="tag blue">⚡ Cloudflare Pages</span>
      <span class="tag blue">🚀 GitHub Actions CI/CD</span>
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

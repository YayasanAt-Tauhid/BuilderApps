<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.app_name()} — {m.tagline()}</title>
</svelte:head>

<!-- Hero -->
<section class="flex flex-col items-center gap-8 py-20 text-center">
	<div
		class="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground"
	>
		<span class="size-1.5 rounded-full bg-primary"></span>
		Powered by DeepSeek + Cloudflare Workers
	</div>

	<h1
		class="max-w-3xl text-5xl font-extrabold tracking-tight sm:text-6xl"
		style="background: linear-gradient(135deg, var(--foreground) 0%, var(--primary) 60%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
	>
		{m.tagline()}
	</h1>

	<p class="max-w-xl text-lg text-muted-foreground">
		Describe your idea in plain language. BuilderPro streams a full-stack codebase back to you in
		real time — browse it, preview the frontend, and export as a zip.
	</p>

	<div class="flex flex-wrap justify-center gap-3">
		<a
			href="/register"
			class="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 hover:shadow-primary/40"
		>
			Start building for free →
		</a>
		<a
			href="/login"
			class="rounded-xl border bg-card px-6 py-3 font-semibold transition hover:bg-muted"
		>
			Sign in
		</a>
	</div>
</section>

<!-- Features grid -->
<section class="mx-auto mb-20 grid max-w-4xl gap-4 sm:grid-cols-3">
	{#each [
		{ icon: '⚡', title: 'Real-time streaming', desc: 'Watch your app being built token by token, live in the browser.' },
		{ icon: '🗂️', title: 'Full file browser', desc: 'Browse every generated file, compare versions, and restore older builds.' },
		{ icon: '🔗', title: 'One-click deploy', desc: 'Publish to a live URL or push directly to your GitHub repo.' }
	] as f}
		<div class="rounded-2xl border bg-card p-6 transition hover:border-primary/40 hover:shadow-sm">
			<div class="mb-3 text-3xl">{f.icon}</div>
			<h3 class="mb-1 font-semibold">{f.title}</h3>
			<p class="text-sm text-muted-foreground">{f.desc}</p>
		</div>
	{/each}
</section>

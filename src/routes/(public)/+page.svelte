<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.app_name()} — {m.tagline()}</title>
</svelte:head>

<section class="flex flex-col items-center gap-6 py-16 text-center">
	<h1 class="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
		{m.tagline()}
	</h1>
	<p class="max-w-xl text-lg text-muted-foreground">
		Describe your idea in plain language. BuilderPro streams a full-stack codebase back to you in
		real time — browse it, preview the frontend, and export it as a zip.
	</p>
	<div class="flex gap-3">
		<a
			href="/register"
			class="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90"
		>
			Get started
		</a>
		<a href="/about" class="rounded-md border px-5 py-2.5 font-medium hover:bg-muted">
			Learn more
		</a>
	</div>
</section>

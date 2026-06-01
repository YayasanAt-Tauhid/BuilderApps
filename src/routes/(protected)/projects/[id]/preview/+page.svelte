<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const projectId = $derived(page.params.id);
	const pagesUrl = $derived(data.project.githubPagesUrl);
	const cacheBust = Date.now();
</script>

<svelte:head><title>{m.project_preview()} — {data.project.name}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center gap-2">
	<a href="/projects/{projectId}" class="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted" aria-label="Back">
		<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 12H5M12 5l-7 7 7 7"/>
		</svg>
	</a>
	<h1 class="text-lg font-bold sm:text-xl">{m.project_preview()}</h1>

	{#if pagesUrl}
		<span class="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
			<span class="size-1.5 rounded-full bg-green-500"></span>
			Live
		</span>
		<a href={pagesUrl} target="_blank" rel="noopener noreferrer"
			class="ml-auto rounded-lg border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted">
			↗ Open
		</a>
	{/if}
</div>

{#if pagesUrl}
	<iframe
		title="Preview"
		src="{pagesUrl}?t={cacheBust}"
		class="h-[calc(100dvh-12rem)] min-h-64 w-full rounded-2xl border bg-white shadow-sm sm:h-[75vh]"
	></iframe>
{:else}
	<div class="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-20 text-center">
		<div class="text-4xl">🚀</div>
		<div>
			<p class="font-medium">Belum ada preview</p>
			<p class="mt-1 text-sm text-muted-foreground">Push ke GitHub untuk deploy dan lihat live preview.</p>
		</div>
		<a href="/projects/{projectId}/files"
			class="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-80">
			Push ke GitHub
		</a>
	</div>
{/if}

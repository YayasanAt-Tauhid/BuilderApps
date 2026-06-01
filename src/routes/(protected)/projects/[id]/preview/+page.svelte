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
			GitHub Pages
		</span>
		<a href={pagesUrl} target="_blank" rel="noopener noreferrer"
			class="ml-auto rounded-lg border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted">
			↗ Open
		</a>
	{:else}
		<span class="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
			<span class="size-1.5 rounded-full bg-muted-foreground/50"></span>
			Sandboxed
		</span>
	{/if}
</div>

{#if !pagesUrl}
	<p class="mb-3 text-sm text-muted-foreground">
		Sandboxed preview — frontend only.
		<a href="/projects/{projectId}/files" class="text-primary underline">Push to GitHub</a> for a live URL.
	</p>
{/if}

<iframe
	title="Preview"
	src={pagesUrl ? `${pagesUrl}?t=${cacheBust}` : `/api/v1/projects/${projectId}/preview?t=${cacheBust}`}
	sandbox={pagesUrl ? undefined : 'allow-scripts'}
	class="h-[calc(100dvh-12rem)] min-h-64 w-full rounded-2xl border bg-white shadow-sm sm:h-[75vh]"
></iframe>

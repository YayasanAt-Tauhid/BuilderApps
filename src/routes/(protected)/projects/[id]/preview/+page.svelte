<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const projectId = $derived(page.params.id);
	const pagesUrl = $derived(data.project.githubPagesUrl);
	// Bust iframe cache on every page load so restore/generate shows fresh content.
	const cacheBust = Date.now();
</script>

<svelte:head><title>{m.project_preview()}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a href="/projects/{projectId}" class="text-sm text-muted-foreground hover:text-primary">← Back</a>
	<h1 class="text-xl font-bold">{m.project_preview()}</h1>

	{#if pagesUrl}
		<span class="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
			<span class="size-1.5 rounded-full bg-green-500"></span>
			GitHub Pages
		</span>
		<a
			href={pagesUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto text-sm text-muted-foreground hover:text-primary"
		>
			↗ Open in new tab
		</a>
	{:else}
		<span class="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
			<span class="size-1.5 rounded-full bg-muted-foreground/50"></span>
			Internal preview
		</span>
	{/if}
</div>

{#if pagesUrl}
	<p class="mb-3 text-sm text-muted-foreground">
		Live preview via GitHub Pages — may take a minute to build after the first sync.
	</p>
	<iframe
		title="GitHub Pages preview"
		src="{pagesUrl}?t={cacheBust}"
		class="h-[70vh] w-full rounded-lg border bg-white"
	></iframe>
{:else}
	<p class="mb-3 text-sm text-muted-foreground">
		Sandboxed preview of the generated frontend only (not full-stack execution).
		<a href="/projects/{projectId}/files" class="underline hover:text-primary">Sync to GitHub</a> to get a live shareable preview.
	</p>
	<iframe
		title="Frontend preview"
		src="/api/v1/projects/{projectId}/preview?t={cacheBust}"
		sandbox="allow-scripts"
		class="h-[70vh] w-full rounded-lg border bg-white"
	></iframe>
{/if}

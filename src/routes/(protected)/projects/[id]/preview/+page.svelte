<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const projectId = $derived(page.params.id);
	const pagesUrl = $derived(data.project.githubPagesUrl);
</script>

<svelte:head><title>{m.project_preview()}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a href="/projects/{projectId}" class="text-sm text-muted-foreground hover:text-primary">← Back</a>
	<h1 class="text-xl font-bold">{m.project_preview()}</h1>
	{#if pagesUrl}
		<a
			href={pagesUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto text-sm text-muted-foreground hover:text-primary"
		>
			↗ Open in new tab
		</a>
	{/if}
</div>

{#if pagesUrl}
	<p class="mb-3 text-sm text-muted-foreground">
		Live preview via GitHub Pages — may take a minute to build after the first sync.
	</p>
	<iframe
		title="GitHub Pages preview"
		src={pagesUrl}
		class="h-[70vh] w-full rounded-lg border bg-white"
	></iframe>
{:else}
	<p class="mb-3 text-sm text-muted-foreground">
		Sandboxed preview of the generated frontend only (not full-stack execution).
		<a href="/projects/{projectId}/files" class="hover:text-primary underline">Connect GitHub</a> to get a live shareable preview.
	</p>
	<iframe
		title="Frontend preview"
		src="/api/v1/projects/{projectId}/preview"
		sandbox="allow-scripts"
		class="h-[70vh] w-full rounded-lg border bg-white"
	></iframe>
{/if}

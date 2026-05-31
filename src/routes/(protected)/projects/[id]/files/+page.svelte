<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selected = $state<{ id: string; path: string } | null>(null);
	let content = $state('');
	let loadingFile = $state(false);

	async function open(file: { id: string; path: string }) {
		selected = file;
		loadingFile = true;
		content = '';
		const res = await fetch(`/api/v1/projects/${data.project.id}/files/${file.id}`);
		content = res.ok ? await res.text() : 'Failed to load file.';
		loadingFile = false;
	}
</script>

<svelte:head><title>{m.project_files()} — {data.project.name}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a href="/projects/{data.project.id}" class="text-sm text-muted-foreground hover:text-primary"
		>← Back</a
	>
	<h1 class="text-xl font-bold">{m.project_files()}</h1>
	{#if data.version > 0}
		<span class="rounded-full bg-muted px-2 py-0.5 text-xs">v{data.version}</span>
	{/if}
</div>

{#if data.files.length === 0}
	<p class="text-muted-foreground">No files generated yet.</p>
{:else}
	<div class="grid gap-4 md:grid-cols-[280px_1fr]">
		<ul class="rounded-lg border bg-card p-2 text-sm">
			{#each data.files as file (file.id)}
				<li>
					<button
						onclick={() => open(file)}
						class="flex w-full justify-between rounded px-2 py-1.5 text-left font-mono text-xs hover:bg-muted {selected?.id ===
						file.id
							? 'bg-muted'
							: ''}"
					>
						<span class="truncate">{file.path}</span>
						<span class="ml-2 shrink-0 text-muted-foreground">{file.sizeBytes}B</span>
					</button>
				</li>
			{/each}
		</ul>
		<div class="rounded-lg border bg-card p-4">
			{#if !selected}
				<p class="text-sm text-muted-foreground">Select a file to view its contents.</p>
			{:else if loadingFile}
				<p class="text-sm text-muted-foreground">Loading…</p>
			{:else}
				<p class="mb-2 font-mono text-xs text-muted-foreground">{selected.path}</p>
				<pre
					class="max-h-[70vh] overflow-auto rounded bg-muted p-3 font-mono text-xs">{content}</pre>
			{/if}
		</div>
	</div>
{/if}

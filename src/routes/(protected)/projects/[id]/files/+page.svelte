<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selected = $state<{ id: string; path: string } | null>(null);
	let content = $state('');
	let loadingFile = $state(false);

	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	// Tracks the Pages URL after a successful sync (persisted in DB via server data).
	let pagesUrl = $state(data.project.githubPagesUrl ?? null);

	const repoUrl = $derived(
		data.githubLogin ? `https://github.com/${data.githubLogin}/${data.project.slug}` : null
	);

	async function open(file: { id: string; path: string }) {
		selected = file;
		loadingFile = true;
		content = '';
		const res = await fetch(`/api/v1/projects/${data.project.id}/files/${file.id}`);
		content = res.ok ? await res.text() : 'Failed to load file.';
		loadingFile = false;
	}

	async function pushToGithub() {
		syncing = true;
		syncError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/github/sync`, {
				method: 'POST'
			});
			if (res.ok) {
				const json = (await res.json()) as { data: { repoUrl: string; pagesUrl: string | null } };
				pagesUrl = json.data.pagesUrl ?? pagesUrl;
			} else {
				const json = (await res.json()) as { error?: { message?: string } };
				syncError = json.error?.message ?? 'Sync failed.';
			}
		} catch {
			syncError = 'Network error.';
		} finally {
			syncing = false;
		}
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

	<div class="ml-auto flex items-center gap-2">
		{#if data.files.length > 0}
			<a
				href="/api/v1/projects/{data.project.id}/export"
				class="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
			>
				Export ZIP
			</a>
		{/if}

		{#if data.githubLogin && data.files.length > 0}
			{#if pagesUrl && repoUrl}
				<!-- Already synced: show repo link + re-sync button -->
				<a
					href={repoUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
				>
					<span class="size-2 rounded-full bg-green-500"></span>
					GitHub synced
				</a>
				<button
					onclick={pushToGithub}
					disabled={syncing}
					class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
				>
					{syncing ? 'Re-syncing…' : 'Re-sync'}
				</button>
			{:else}
				<!-- Not synced yet -->
				<button
					onclick={pushToGithub}
					disabled={syncing}
					class="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
						/>
					</svg>
					{syncing ? 'Pushing…' : 'Push to GitHub'}
				</button>
			{/if}
		{:else if !data.githubLogin && data.files.length > 0}
			<a
				href="/settings"
				class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
				title="Connect GitHub in Settings to enable this"
			>
				Push to GitHub
			</a>
		{/if}
	</div>
</div>

{#if syncError}
	<div
		class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		{syncError}
	</div>
{/if}

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

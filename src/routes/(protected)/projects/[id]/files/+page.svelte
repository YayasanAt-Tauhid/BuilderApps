<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selected = $state<{ id: string; path: string } | null>(null);
	let content = $state('');
	let loadingFile = $state(false);

	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	let pagesUrl = $state(data.project.githubPagesUrl ?? null);
	let syncedVersion = $state(data.project.githubSyncedVersion ?? null);
	let commitSha = $state(data.project.githubLastCommitSha ?? null);

	let restoring = $state<number | null>(null);
	let restoreError = $state<string | null>(null);

	const repoUrl = $derived(
		data.githubLogin ? `https://github.com/${data.githubLogin}/${data.project.slug}` : null
	);
	const commitUrl = $derived(repoUrl && commitSha ? `${repoUrl}/commit/${commitSha}` : null);
	const versionInSync = $derived(syncedVersion !== null && syncedVersion === data.version);
	const isViewingLatest = $derived(data.version === data.latestVersion);

	function formatDate(ms: number | null) {
		if (!ms) return '—';
		return new Date(ms).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

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
				const json = (await res.json()) as {
					data: { repoUrl: string; pagesUrl: string | null; syncedVersion: number; commitSha: string };
				};
				pagesUrl = json.data.pagesUrl ?? pagesUrl;
				syncedVersion = json.data.syncedVersion;
				commitSha = json.data.commitSha;
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

	async function restore(targetVersion: number) {
		restoring = targetVersion;
		restoreError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/rollback`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ version: targetVersion })
			});
			if (res.ok) {
				const json = (await res.json()) as { data: { version: number } };
				// Navigate to the new version (which is now latest).
				goto(`/projects/${data.project.id}/files?v=${json.data.version}`);
			} else {
				const json = (await res.json()) as { error?: { message?: string } };
				restoreError = json.error?.message ?? 'Restore failed.';
			}
		} catch {
			restoreError = 'Network error.';
		} finally {
			restoring = null;
		}
	}
</script>

<svelte:head><title>{m.project_files()} — {data.project.name}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a href="/projects/{data.project.id}" class="text-sm text-muted-foreground hover:text-primary"
		>← Back</a
	>
	<h1 class="text-xl font-bold">{m.project_files()}</h1>

	{#if data.latestVersion > 0}
		{#if commitUrl && versionInSync && isViewingLatest}
			<a
				href={commitUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 hover:underline dark:text-green-400"
				title="View commit on GitHub"
			>
				v{data.version} ↗
			</a>
		{:else if syncedVersion !== null && !versionInSync && isViewingLatest}
			<span class="rounded-full bg-muted px-2 py-0.5 text-xs">v{data.version}</span>
			<span class="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700 dark:text-yellow-400">
				GitHub: v{syncedVersion}
			</span>
		{:else}
			<span class="rounded-full bg-muted px-2 py-0.5 text-xs">
				{isViewingLatest ? `v${data.version}` : `Viewing v${data.version}`}
			</span>
		{/if}

		{#if !isViewingLatest}
			<a
				href="/projects/{data.project.id}/files"
				class="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
			>
				← Back to latest (v{data.latestVersion})
			</a>
		{/if}
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

		{#if data.githubLogin && data.files.length > 0 && isViewingLatest}
			{#if pagesUrl && repoUrl && versionInSync}
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
		{:else if !data.githubLogin && data.files.length > 0 && isViewingLatest}
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
	<div class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
		{syncError}
	</div>
{/if}
{#if restoreError}
	<div class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
		{restoreError}
	</div>
{/if}

{#if data.latestVersion === 0}
	<p class="text-muted-foreground">No files generated yet.</p>
{:else}
	<div class="grid gap-4 lg:grid-cols-[200px_280px_1fr]">
		<!-- Version history -->
		<div class="rounded-lg border bg-card p-2 text-sm">
			<p class="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">History</p>
			<ul class="space-y-0.5">
				{#each data.history as h (h.version)}
					<li>
						<div class="group flex items-center gap-1 rounded px-2 py-1.5 {data.version === h.version ? 'bg-muted' : 'hover:bg-muted/60'}">
							<a
								href="/projects/{data.project.id}/files?v={h.version}"
								class="min-w-0 flex-1"
							>
								<div class="flex items-center gap-1.5">
									<span class="font-medium">v{h.version}</span>
									{#if h.version === data.latestVersion}
										<span class="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">latest</span>
									{/if}
									{#if syncedVersion === h.version}
										<span class="size-1.5 rounded-full bg-green-500" title="On GitHub"></span>
									{/if}
								</div>
								<div class="text-[11px] text-muted-foreground">{formatDate(h.finishedAt)}</div>
								<div class="text-[11px] text-muted-foreground">{h.fileCount} files</div>
							</a>
							{#if h.version !== data.latestVersion}
								<button
									onclick={() => restore(h.version)}
									disabled={restoring === h.version}
									class="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
									title="Restore this version as new latest"
								>
									{restoring === h.version ? '…' : 'Restore'}
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<!-- File list -->
		<ul class="rounded-lg border bg-card p-2 text-sm">
			{#each data.files as file (file.id)}
				<li>
					<button
						onclick={() => open(file)}
						class="flex w-full justify-between rounded px-2 py-1.5 text-left font-mono text-xs hover:bg-muted {selected?.id === file.id ? 'bg-muted' : ''}"
					>
						<span class="truncate">{file.path}</span>
						<span class="ml-2 shrink-0 text-muted-foreground">{file.sizeBytes}B</span>
					</button>
				</li>
			{/each}
			{#if data.files.length === 0}
				<li class="px-2 py-2 text-xs text-muted-foreground">No files in this version.</li>
			{/if}
		</ul>

		<!-- File viewer -->
		<div class="rounded-lg border bg-card p-4">
			{#if !selected}
				<p class="text-sm text-muted-foreground">Select a file to view its contents.</p>
			{:else if loadingFile}
				<p class="text-sm text-muted-foreground">Loading…</p>
			{:else}
				<p class="mb-2 font-mono text-xs text-muted-foreground">{selected.path}</p>
				<pre class="max-h-[70vh] overflow-auto rounded bg-muted p-3 font-mono text-xs">{content}</pre>
			{/if}
		</div>
	</div>
{/if}

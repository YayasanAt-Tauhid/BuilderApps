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

	let supabaseLinking = $state(false);
	let supabaseLinkError = $state<string | null>(null);
	let supabaseRef = $state(data.project.supabaseProjectRef ?? null);
	let supabaseUrl = $state(data.project.supabaseUrl ?? null);

	let deploying = $state(false);
	let deployError = $state<string | null>(null);
	let cfPagesUrl = $state(data.project.cfPagesUrl ?? null);

	// Mobile tab: 'history' | 'files' | 'viewer'
	let mobileTab = $state<'history' | 'files' | 'viewer'>('files');

	async function linkSupabase(ref: string) {
		supabaseLinking = true;
		supabaseLinkError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/supabase`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ref })
			});
			if (res.ok) {
				const json = (await res.json()) as { data: { ref: string; supabaseUrl: string } };
				supabaseRef = json.data.ref;
				supabaseUrl = json.data.supabaseUrl;
			} else {
				const json = (await res.json()) as { error?: { message?: string } };
				supabaseLinkError = json.error?.message ?? 'Failed to link Supabase project.';
			}
		} catch {
			supabaseLinkError = 'Network error.';
		} finally {
			supabaseLinking = false;
		}
	}

	async function unlinkSupabase() {
		supabaseLinking = true;
		supabaseLinkError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/supabase`, { method: 'DELETE' });
			if (res.ok) {
				supabaseRef = null;
				supabaseUrl = null;
			}
		} catch {
			supabaseLinkError = 'Network error.';
		} finally {
			supabaseLinking = false;
		}
	}

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

	async function deployToCloudflare() {
		deploying = true;
		deployError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/deploy`, { method: 'POST' });
			if (res.ok) {
				const json = (await res.json()) as { data: { url: string } };
				cfPagesUrl = json.data.url;
			} else {
				const json = (await res.json()) as { error?: { message?: string } };
				deployError = json.error?.message ?? 'Deploy failed.';
			}
		} catch {
			deployError = 'Network error.';
		} finally {
			deploying = false;
		}
	}

	async function open(file: { id: string; path: string }) {
		selected = file;
		loadingFile = true;
		content = '';
		mobileTab = 'viewer';
		const res = await fetch(`/api/v1/projects/${data.project.id}/files/${file.id}`);
		content = res.ok ? await res.text() : 'Failed to load file.';
		loadingFile = false;
	}

	async function pushToGithub() {
		syncing = true;
		syncError = null;
		try {
			const res = await fetch(`/api/v1/projects/${data.project.id}/github/sync`, { method: 'POST' });
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

<!-- Header row -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<a href="/projects/{data.project.id}" class="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted" aria-label="Back">
		<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 12H5M12 5l-7 7 7 7"/>
		</svg>
	</a>
	<h1 class="text-lg font-bold sm:text-xl">{m.project_files()}</h1>

	{#if data.latestVersion > 0}
		{#if commitUrl && versionInSync && isViewingLatest}
			<a href={commitUrl} target="_blank" rel="noopener noreferrer"
				class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 hover:underline dark:text-green-400">
				v{data.version} ↗
			</a>
		{:else}
			<span class="rounded-full bg-muted px-2 py-0.5 text-xs">
				{isViewingLatest ? `v${data.version}` : `v${data.version} (archived)`}
			</span>
		{/if}
		{#if !isViewingLatest}
			<a href="/projects/{data.project.id}/files"
				class="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
				← latest (v{data.latestVersion})
			</a>
		{/if}
	{/if}

	<!-- Action buttons — scroll horizontally on mobile -->
	<div class="ml-auto flex items-center gap-1.5 overflow-x-auto">
		{#if data.files.length > 0}
			<a href="/api/v1/projects/{data.project.id}/export"
				class="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition hover:bg-muted sm:px-3 sm:text-sm">
				ZIP
			</a>
		{/if}

		{#if data.githubLogin && data.files.length > 0 && isViewingLatest}
			{#if pagesUrl && repoUrl}
				<a href={repoUrl} target="_blank" rel="noopener noreferrer"
					class="shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition hover:bg-muted sm:px-3 sm:text-sm">
					<span class="size-1.5 rounded-full {versionInSync ? 'bg-green-500' : 'bg-yellow-500'}"></span>
					<span class="hidden sm:inline">GitHub</span>
				</a>
				<button onclick={pushToGithub} disabled={syncing}
					class="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50 sm:px-3 sm:text-sm">
					{syncing ? '…' : 'Push'}
				</button>
			{:else}
				<button onclick={pushToGithub} disabled={syncing}
					class="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50 sm:px-3 sm:text-sm">
					<svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
					</svg>
					{syncing ? '…' : 'Push'}
				</button>
			{/if}
		{:else if !data.githubLogin && data.files.length > 0 && isViewingLatest}
			<a href="/settings" class="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted sm:px-3 sm:text-sm" title="Connect GitHub in Settings">
				GitHub
			</a>
		{/if}

		{#if data.cfPagesEnabled && data.files.length > 0 && isViewingLatest}
			{#if cfPagesUrl}
				<a href={cfPagesUrl} target="_blank" rel="noopener noreferrer"
					class="shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition hover:bg-muted sm:px-3 sm:text-sm">
					<span class="size-1.5 rounded-full bg-orange-500"></span>
					Live
				</a>
			{/if}
			<button onclick={deployToCloudflare} disabled={deploying}
				class="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-orange-600 disabled:opacity-50 sm:px-3 sm:text-sm">
				{#if deploying}
					<span class="size-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
				{/if}
				{deploying ? '…' : cfPagesUrl ? 'Redeploy' : 'Deploy'}
			</button>
		{/if}
	</div>
</div>

<!-- Error banners -->
{#each [deployError, syncError, restoreError].filter(Boolean) as err}
	<div class="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
		{err}
	</div>
{/each}

<!-- Supabase banner -->
{#if data.supabaseConnected}
	<div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
		<svg class="size-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
		</svg>
		{#if supabaseRef}
			<span class="text-muted-foreground">Supabase:</span>
			<span class="font-medium">{supabaseUrl}</span>
			<button onclick={unlinkSupabase} disabled={supabaseLinking}
				class="ml-auto rounded-lg border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50">
				Unlink
			</button>
		{:else if data.supabaseTokenError}
			<span class="text-xs text-destructive">
				Session expired — <a href="/api/v1/auth/supabase" class="underline">reconnect Supabase</a>
			</span>
		{:else if data.supabaseProjects.length > 0}
			<span class="text-muted-foreground">Link project:</span>
			<select class="rounded-lg border bg-background px-2 py-1 text-xs" onchange={(e) => {
				const val = (e.target as HTMLSelectElement).value;
				if (val) linkSupabase(val);
			}} disabled={supabaseLinking}>
				<option value="">Select…</option>
				{#each data.supabaseProjects as p}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		{:else}
			<span class="text-xs text-muted-foreground">
				No Supabase projects — <a href="https://supabase.com/dashboard/new" target="_blank" rel="noopener" class="underline">create one</a>.
			</span>
		{/if}
		{#if supabaseLinkError}
			<span class="text-xs text-destructive">{supabaseLinkError}</span>
		{/if}
	</div>
{/if}

{#if data.latestVersion === 0}
	<div class="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
		<div class="text-4xl">📂</div>
		<p class="font-medium text-muted-foreground">No files generated yet.</p>
		<a href="/projects/{data.project.id}" class="text-sm text-primary hover:underline">← Go generate some</a>
	</div>
{:else}
	<!-- Mobile tab bar -->
	<div class="mb-3 flex rounded-xl border bg-muted/50 p-1 text-sm lg:hidden">
		{#each [['history', 'History'], ['files', 'Files'], ['viewer', 'Viewer']] as [tab, label]}
			<button
				onclick={() => (mobileTab = tab as 'history' | 'files' | 'viewer')}
				class="flex-1 rounded-lg py-2 text-center text-xs font-medium transition {mobileTab === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			>
				{label}
			</button>
		{/each}
	</div>

	<!-- Desktop: 3-col grid. Mobile: one tab at a time -->
	<div class="grid gap-4 lg:grid-cols-[200px_280px_1fr]">
		<!-- Version history -->
		<div class="rounded-xl border bg-card p-2 text-sm {mobileTab !== 'history' ? 'hidden lg:block' : ''}">
			<p class="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
			<ul class="space-y-0.5">
				{#each data.history as h (h.version)}
					<li>
						<div class="group flex items-center gap-1 rounded-lg px-2 py-2 {data.version === h.version ? 'bg-muted' : 'hover:bg-muted/60'}">
							<a href="/projects/{data.project.id}/files?v={h.version}" class="min-w-0 flex-1">
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
									class="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
									title="Restore this version"
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
		<ul class="rounded-xl border bg-card p-2 text-sm {mobileTab !== 'files' ? 'hidden lg:block' : ''}">
			{#each data.files as file (file.id)}
				<li>
					<button
						onclick={() => open(file)}
						class="flex w-full justify-between rounded-lg px-2 py-2 text-left font-mono text-xs transition hover:bg-muted {selected?.id === file.id ? 'bg-muted' : ''}"
					>
						<span class="min-w-0 truncate">{file.path}</span>
						<span class="ml-2 shrink-0 text-muted-foreground">{file.sizeBytes}B</span>
					</button>
				</li>
			{/each}
			{#if data.files.length === 0}
				<li class="px-2 py-2 text-xs text-muted-foreground">No files in this version.</li>
			{/if}
		</ul>

		<!-- File viewer -->
		<div class="rounded-xl border bg-card p-4 {mobileTab !== 'viewer' ? 'hidden lg:block' : ''}">
			{#if !selected}
				<div class="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
					<svg xmlns="http://www.w3.org/2000/svg" class="size-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
					</svg>
					<p class="text-sm">Select a file to view</p>
				</div>
			{:else if loadingFile}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<span class="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
					Loading…
				</div>
			{:else}
				<div class="mb-2 flex items-center justify-between">
					<p class="font-mono text-xs text-muted-foreground">{selected.path}</p>
				</div>
				<pre class="max-h-[60vh] overflow-auto rounded-xl bg-muted p-3 font-mono text-xs leading-relaxed sm:max-h-[70vh]">{content}</pre>
			{/if}
		</div>
	</div>
{/if}

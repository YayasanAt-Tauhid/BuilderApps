<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let creating = $state(false);

	const statusColor: Record<string, string> = {
		active: 'bg-green-500/15 text-green-700 dark:text-green-400',
		idle: 'bg-muted text-muted-foreground',
		error: 'bg-destructive/15 text-destructive'
	};
</script>

<svelte:head><title>{m.dashboard_title()} — {m.app_name()}</title></svelte:head>

<!-- Page header -->
<div class="mb-8 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold">{m.dashboard_title()}</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">
			{data.projects.length} project{data.projects.length === 1 ? '' : 's'}
		</p>
	</div>
</div>

<!-- Create form -->
<form
	method="POST"
	action="?/create"
	use:enhance={() => {
		creating = true;
		return async ({ update }) => {
			await update();
			creating = false;
		};
	}}
	class="mb-8 flex gap-2"
>
	<input
		name="name"
		placeholder="Name your app — e.g. 'Todo list with auth'"
		required
		class="flex-1 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
	/>
	<button
		type="submit"
		disabled={creating}
		class="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
	>
		{creating ? '…' : '+ ' + m.dashboard_new_project()}
	</button>
</form>

{#if form?.error}
	<div class="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
		{form.error}
	</div>
{/if}

<!-- Projects grid -->
{#if data.projects.length === 0}
	<div class="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card py-16 text-center">
		<div class="text-5xl">🛠️</div>
		<div>
			<p class="font-semibold">No projects yet</p>
			<p class="mt-1 text-sm text-muted-foreground">Create your first app above to get started.</p>
		</div>
	</div>
{:else}
	<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.projects as project (project.id)}
			<li
				class="group relative flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
			>
				<!-- Status badge -->
				<div class="mb-3 flex items-start justify-between">
					<span
						class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusColor[project.status] ?? statusColor.idle}"
					>
						{project.status}
					</span>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={project.id} />
						<button
							type="submit"
							class="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
							title="Delete project"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
							</svg>
						</button>
					</form>
				</div>

				<!-- Project name -->
				<a
					href="/projects/{project.id}"
					class="mb-1 font-semibold leading-snug transition hover:text-primary"
				>
					{project.name}
				</a>

				{#if project.description}
					<p class="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
				{/if}

				<!-- Quick links -->
				<div class="mt-4 flex gap-2 border-t pt-3 text-xs text-muted-foreground">
					<a href="/projects/{project.id}" class="transition hover:text-primary">Chat</a>
					<span>·</span>
					<a href="/projects/{project.id}/files" class="transition hover:text-primary">Files</a>
					<span>·</span>
					<a href="/projects/{project.id}/preview" class="transition hover:text-primary">Preview</a>
				</div>
			</li>
		{/each}
	</ul>
{/if}

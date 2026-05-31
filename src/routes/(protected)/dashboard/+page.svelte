<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let creating = $state(false);
</script>

<svelte:head><title>{m.dashboard_title()} — {m.app_name()}</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<h1 class="text-2xl font-bold">{m.dashboard_title()}</h1>
</div>

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
		placeholder="My new app"
		required
		class="flex-1 rounded-md border bg-background px-3 py-2"
	/>
	<button
		type="submit"
		disabled={creating}
		class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
	>
		{m.dashboard_new_project()}
	</button>
</form>

{#if form?.error}
	<p class="mb-4 text-sm text-destructive">{form.error}</p>
{/if}

{#if data.projects.length === 0}
	<p class="text-muted-foreground">{m.dashboard_empty()}</p>
{:else}
	<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.projects as project (project.id)}
			<li class="rounded-lg border bg-card p-4">
				<div class="flex items-start justify-between">
					<a href="/projects/{project.id}" class="font-semibold hover:text-primary">
						{project.name}
					</a>
					<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
						{project.status}
					</span>
				</div>
				{#if project.description}
					<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
				{/if}
				<form method="POST" action="?/delete" use:enhance class="mt-3">
					<input type="hidden" name="id" value={project.id} />
					<button type="submit" class="text-xs text-destructive hover:underline">Delete</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

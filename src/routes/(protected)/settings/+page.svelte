<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pct = $derived(
		data.usage.quota > 0
			? Math.min(100, Math.round((data.usage.totalTokens / data.usage.quota) * 100))
			: 0
	);
</script>

<svelte:head><title>{m.settings_title()} — {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold">{m.settings_title()}</h1>

{#if form?.success}
	<p class="mb-4 text-sm text-success">Saved.</p>
{/if}

<section class="mb-8 max-w-md rounded-lg border bg-card p-5">
	<h2 class="mb-4 font-semibold">Preferences</h2>
	<form method="POST" use:enhance class="flex flex-col gap-4">
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.settings_language()}</span>
			<select
				name="locale"
				value={data.preferences.locale}
				class="rounded-md border bg-background px-3 py-2"
			>
				<option value="en">English</option>
				<option value="id">Bahasa Indonesia</option>
			</select>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.settings_theme()}</span>
			<select
				name="theme"
				value={data.preferences.theme}
				class="rounded-md border bg-background px-3 py-2"
			>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
		<button
			type="submit"
			class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
		>
			Save
		</button>
	</form>
</section>

<section class="max-w-md rounded-lg border bg-card p-5">
	<h2 class="mb-4 font-semibold">{m.settings_usage()}</h2>
	<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
		<div class="h-full bg-primary" style="width: {pct}%"></div>
	</div>
	<p class="mt-2 text-sm text-muted-foreground">
		{m.usage_remaining({ remaining: data.usage.remaining, quota: data.usage.quota })}
	</p>
</section>

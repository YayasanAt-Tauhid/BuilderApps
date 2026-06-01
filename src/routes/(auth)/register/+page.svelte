<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>{m.auth_register()} — {m.app_name()}</title></svelte:head>

<h1 class="mb-1 text-xl font-bold">{m.auth_register()}</h1>
<p class="mb-6 text-sm text-muted-foreground">Create a free account to start building.</p>

{#if form?.error}
	<div class="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
		<svg xmlns="http://www.w3.org/2000/svg" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
		{form.error}
	</div>
{/if}

<form
	method="POST"
	use:enhance={() => {
		loading = true;
		return async ({ update }) => {
			await update();
			loading = false;
		};
	}}
	class="flex flex-col gap-4"
>
	<label class="flex flex-col gap-1.5 text-sm">
		<span class="font-medium">{m.auth_display_name()}</span>
		<input
			name="displayName"
			type="text"
			autocomplete="name"
			class="rounded-xl border bg-background px-3 py-2.5 text-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
		/>
	</label>
	<label class="flex flex-col gap-1.5 text-sm">
		<span class="font-medium">{m.auth_email()}</span>
		<input
			name="email"
			type="email"
			required
			autocomplete="email"
			class="rounded-xl border bg-background px-3 py-2.5 text-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
		/>
	</label>
	<label class="flex flex-col gap-1.5 text-sm">
		<span class="font-medium">{m.auth_password()}</span>
		<input
			name="password"
			type="password"
			required
			minlength="8"
			autocomplete="new-password"
			class="rounded-xl border bg-background px-3 py-2.5 text-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
		/>
	</label>
	<button
		type="submit"
		disabled={loading}
		class="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
	>
		{#if loading}
			<span class="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></span>
			Creating account…
		{:else}
			{m.auth_register()}
		{/if}
	</button>
</form>

<p class="mt-5 text-center text-sm text-muted-foreground">
	{m.auth_have_account()}
	<a href="/login" class="font-medium text-primary hover:underline">{m.auth_login()}</a>
</p>

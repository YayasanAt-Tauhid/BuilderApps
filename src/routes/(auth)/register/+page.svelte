<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>{m.auth_register()} — {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold">{m.auth_register()}</h1>

{#if form?.error}
	<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
		{form.error}
	</p>
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
	<label class="flex flex-col gap-1 text-sm">
		<span>{m.auth_display_name()}</span>
		<input
			name="displayName"
			type="text"
			autocomplete="name"
			class="rounded-md border bg-background px-3 py-2"
		/>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		<span>{m.auth_email()}</span>
		<input
			name="email"
			type="email"
			required
			autocomplete="email"
			class="rounded-md border bg-background px-3 py-2"
		/>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		<span>{m.auth_password()}</span>
		<input
			name="password"
			type="password"
			required
			minlength="8"
			autocomplete="new-password"
			class="rounded-md border bg-background px-3 py-2"
		/>
	</label>
	<button
		type="submit"
		disabled={loading}
		class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
	>
		{loading ? '…' : m.auth_register()}
	</button>
</form>

<p class="mt-4 text-center text-sm text-muted-foreground">
	{m.auth_have_account()}
	<a href="/login" class="text-primary hover:underline">{m.auth_login()}</a>
</p>

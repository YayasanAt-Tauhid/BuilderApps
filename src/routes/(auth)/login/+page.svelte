<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>{m.auth_login()} — {m.app_name()}</title></svelte:head>

<h1 class="mb-1 text-xl font-bold">{m.auth_login()}</h1>
<p class="mb-6 text-sm text-muted-foreground">Welcome back — sign in to continue.</p>

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
	<div class="flex flex-col gap-1.5">
		<Label for="email">{m.auth_email()}</Label>
		<Input id="email" name="email" type="email" required autocomplete="email" />
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="password">{m.auth_password()}</Label>
		<Input id="password" name="password" type="password" required autocomplete="current-password" />
	</div>
	<Button type="submit" disabled={loading} class="mt-1">
		{#if loading}
			<span class="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></span>
			Signing in…
		{:else}
			{m.auth_login()}
		{/if}
	</Button>
</form>

<p class="mt-5 text-center text-sm text-muted-foreground">
	{m.auth_no_account()}
	<a href="/register" class="font-medium text-primary hover:underline">{m.auth_register()}</a>
</p>

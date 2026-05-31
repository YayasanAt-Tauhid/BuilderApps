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

<h1 class="mb-6 text-xl font-semibold">{m.auth_login()}</h1>

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
	<div class="flex flex-col gap-1.5">
		<Label for="email">{m.auth_email()}</Label>
		<Input id="email" name="email" type="email" required autocomplete="email" />
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="password">{m.auth_password()}</Label>
		<Input id="password" name="password" type="password" required autocomplete="current-password" />
	</div>
	<Button type="submit" disabled={loading}>
		{loading ? '…' : m.auth_login()}
	</Button>
</form>

<p class="mt-4 text-center text-sm text-muted-foreground">
	{m.auth_no_account()}
	<a href="/register" class="text-primary hover:underline">{m.auth_register()}</a>
</p>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pct = $derived(
		data.usage.quota > 0
			? Math.min(100, Math.round((data.usage.totalTokens / data.usage.quota) * 100))
			: 0
	);

	const githubError = $derived($page.url.searchParams.get('github_error'));
	const githubConnected = $derived($page.url.searchParams.get('github_connected') === '1');
	const supabaseError = $derived($page.url.searchParams.get('supabase_error'));
	const supabaseJustConnected = $derived($page.url.searchParams.get('supabase_connected') === '1');

	const supabaseErrorMessages: Record<string, string> = {
		denied: 'Supabase access was denied.',
		invalid: 'Invalid OAuth response.',
		expired: 'OAuth session expired. Please try again.',
		config: 'Supabase integration is not configured.',
		token: 'Failed to obtain access token.'
	};

	const githubErrorMessages: Record<string, string> = {
		denied: 'GitHub access was denied.',
		invalid: 'Invalid OAuth response.',
		expired: 'OAuth session expired. Please try again.',
		config: 'GitHub integration is not configured.',
		token: 'Failed to obtain access token.',
		user: 'Failed to fetch GitHub user info.'
	};
</script>

<svelte:head><title>{m.settings_title()} — {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold">{m.settings_title()}</h1>

{#if form?.success}
	<p class="mb-4 text-sm text-success">Saved.</p>
{/if}

<section class="mb-8 max-w-md rounded-lg border bg-card p-5">
	<h2 class="mb-4 font-semibold">Preferences</h2>
	<form method="POST" action="?/savePreferences" use:enhance class="flex flex-col gap-4">
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

<section class="mb-8 max-w-md rounded-lg border bg-card p-5">
	<h2 class="mb-4 font-semibold">GitHub Integration</h2>

	{#if githubConnected}
		<p class="mb-3 text-sm text-success">GitHub connected successfully.</p>
	{/if}

	{#if githubError}
		<p class="mb-3 text-sm text-destructive">
			{githubErrorMessages[githubError] ?? 'GitHub connection failed.'}
		</p>
	{/if}

	{#if data.githubLogin}
		<div class="mb-3 flex items-center gap-2">
			<svg
				class="size-5 text-muted-foreground"
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
				/>
			</svg>
			<span class="text-sm">Connected as <strong>@{data.githubLogin}</strong></span>
		</div>
		<form method="POST" action="?/disconnectGithub" use:enhance>
			<button type="submit" class="rounded-md border px-4 py-2 text-sm hover:bg-muted">
				Disconnect GitHub
			</button>
		</form>
	{:else}
		<p class="mb-3 text-sm text-muted-foreground">
			Connect your GitHub account to push generated projects directly to a repository.
		</p>
		<a
			href="/api/v1/auth/github"
			class="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path
					d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
				/>
			</svg>
			Connect GitHub
		</a>
	{/if}
</section>

<section class="mb-8 max-w-md rounded-lg border bg-card p-5">
	<h2 class="mb-4 font-semibold">Supabase Integration</h2>

	{#if supabaseJustConnected}
		<p class="mb-3 text-sm text-success">Supabase connected successfully.</p>
	{/if}

	{#if supabaseError}
		<p class="mb-3 text-sm text-destructive">
			{supabaseErrorMessages[supabaseError] ?? 'Supabase connection failed.'}
		</p>
	{/if}

	{#if data.supabaseConnected}
		<div class="mb-3 flex items-center gap-2">
			<svg class="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
			</svg>
			<span class="text-sm">Supabase account <strong>connected</strong></span>
		</div>
		<form method="POST" action="?/disconnectSupabase" use:enhance>
			<button type="submit" class="rounded-md border px-4 py-2 text-sm hover:bg-muted">
				Disconnect Supabase
			</button>
		</form>
	{:else}
		<p class="mb-3 text-sm text-muted-foreground">
			Connect your Supabase account to generate apps with real database CRUD operations.
		</p>
		<a
			href="/api/v1/auth/supabase"
			class="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
			</svg>
			Connect Supabase
		</a>
	{/if}
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

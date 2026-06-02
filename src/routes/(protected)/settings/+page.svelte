<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pct = $derived(
		data.usage.quota > 0
			? Math.min(100, Math.round((data.usage.totalTokens / data.usage.quota) * 100))
			: 0
	);

	const githubError = $derived(page.url.searchParams.get('github_error'));
	const githubConnected = $derived(page.url.searchParams.get('github_connected') === '1');
	const supabaseError = $derived(page.url.searchParams.get('supabase_error'));
	const supabaseJustConnected = $derived(page.url.searchParams.get('supabase_connected') === '1');

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

<div class="mb-8">
	<h1 class="text-2xl font-bold">{m.settings_title()}</h1>
	<p class="mt-0.5 text-sm text-muted-foreground">Manage your account and integrations</p>
</div>

{#if form?.success}
	<div class="mb-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400">
		<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
		Preferences saved.
	</div>
{/if}

<div class="grid gap-5 lg:grid-cols-[1fr_1fr] max-w-3xl">

<!-- Preferences -->
<section class="rounded-2xl border bg-card p-6">
	<h2 class="mb-4 font-semibold">Preferences</h2>
	<form method="POST" action="?/savePreferences" use:enhance class="flex flex-col gap-4">
		<label class="flex flex-col gap-1.5 text-sm">
			<span class="font-medium">{m.settings_language()}</span>
			<select
				name="locale"
				value={data.preferences.locale}
				class="rounded-xl border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
			>
				<option value="en">English</option>
				<option value="id">Bahasa Indonesia</option>
			</select>
		</label>
		<label class="flex flex-col gap-1.5 text-sm">
			<span class="font-medium">{m.settings_theme()}</span>
			<select
				name="theme"
				value={data.preferences.theme}
				class="rounded-xl border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
			>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
		<button
			type="submit"
			class="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
		>
			Save preferences
		</button>
	</form>
</section>

<!-- Usage -->
<section class="rounded-2xl border bg-card p-6">
	<h2 class="mb-4 font-semibold">{m.settings_usage()}</h2>
	<div class="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
		<div
			class="h-full rounded-full transition-all duration-500 {pct > 80 ? 'bg-destructive' : pct > 50 ? 'bg-warning' : 'bg-primary'}"
			style="width: {pct}%"
		></div>
	</div>
	<p class="text-sm text-muted-foreground">
		{m.usage_remaining({ remaining: data.usage.remaining, quota: data.usage.quota })}
	</p>
	<p class="mt-1 text-xs text-muted-foreground">{pct}% used</p>
</section>

<!-- GitHub -->
<section class="rounded-2xl border bg-card p-6">
	<div class="mb-4 flex items-center gap-2">
		<svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
		</svg>
		<h2 class="font-semibold">GitHub</h2>
		{#if data.githubLogin}
			<span class="ml-auto rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Connected</span>
		{/if}
	</div>

	{#if githubConnected}
		<div class="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400">
			GitHub connected successfully.
		</div>
	{/if}
	{#if githubError}
		<div class="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
			{githubErrorMessages[githubError] ?? 'GitHub connection failed.'}
		</div>
	{/if}

	{#if data.githubLogin}
		<p class="mb-4 text-sm text-muted-foreground">
			Connected as <strong class="text-foreground">@{data.githubLogin}</strong>
		</p>
		<form method="POST" action="?/disconnectGithub" use:enhance>
			<button type="submit" class="rounded-xl border px-4 py-2 text-sm transition hover:bg-muted">
				Disconnect
			</button>
		</form>
	{:else}
		<p class="mb-4 text-sm text-muted-foreground">
			Push generated projects directly to a GitHub repository.
		</p>
		<p class="mb-4 text-xs text-muted-foreground/70">
			Saat authorize di GitHub, pastikan tidak uncheck permission apapun agar push bisa berjalan.
		</p>
		<a
			href="/api/v1/auth/github"
			class="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-80"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
			</svg>
			Connect GitHub
		</a>
	{/if}
</section>

<!-- Supabase -->
<section class="rounded-2xl border bg-card p-6">
	<div class="mb-4 flex items-center gap-2">
		<svg class="size-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
		</svg>
		<h2 class="font-semibold">Supabase</h2>
		{#if data.supabaseConnected}
			<span class="ml-auto rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Connected</span>
		{/if}
	</div>

	{#if supabaseJustConnected}
		<div class="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400">
			Supabase connected successfully.
		</div>
	{/if}
	{#if supabaseError}
		<div class="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
			{supabaseErrorMessages[supabaseError] ?? 'Supabase connection failed.'}
		</div>
	{/if}

	{#if data.supabaseConnected}
		<p class="mb-4 text-sm text-muted-foreground">
			Supabase account connected. Generated apps will include real database CRUD code.
		</p>
		<form method="POST" action="?/disconnectSupabase" use:enhance>
			<button type="submit" class="rounded-xl border px-4 py-2 text-sm transition hover:bg-muted">
				Disconnect
			</button>
		</form>
	{:else}
		<p class="mb-4 text-sm text-muted-foreground">
			Connect your Supabase account to generate apps with real database CRUD operations.
		</p>
		<a
			href="/api/v1/auth/supabase"
			class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
		>
			<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
			</svg>
			Connect Supabase
		</a>
	{/if}
</section>


</div>

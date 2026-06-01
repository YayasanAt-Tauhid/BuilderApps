<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const initial = $derived(
		(data.user.displayName ?? data.user.email ?? '?').charAt(0).toUpperCase()
	);

	const navLinks = [
		{ href: '/dashboard', label: m.nav_dashboard() },
		{ href: '/settings', label: m.nav_settings() }
	];
</script>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-sm">
		<nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<div class="flex items-center gap-6">
				<a href="/dashboard" class="flex items-center gap-2 text-base font-bold">
					<span
						class="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground"
						>B</span
					>
					{m.app_name()}
				</a>
				<div class="hidden items-center gap-1 sm:flex">
					{#each navLinks as link}
						<a
							href={link.href}
							class="rounded-md px-3 py-1.5 text-sm font-medium transition {page.url.pathname.startsWith(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
						>
							{link.label}
						</a>
					{/each}
				</div>
			</div>

			<div class="flex items-center gap-3">
				<span class="hidden text-sm text-muted-foreground sm:block">
					{data.user.displayName ?? data.user.email}
				</span>
				<div
					class="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
				>
					{initial}
				</div>
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
					>
						{m.nav_logout()}
					</button>
				</form>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>

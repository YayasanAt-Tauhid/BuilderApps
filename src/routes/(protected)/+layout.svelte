<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const initial = $derived(
		(data.user.displayName ?? data.user.email ?? '?').charAt(0).toUpperCase()
	);

	let menuOpen = $state(false);

	const navLinks = [
		{ href: '/dashboard', label: m.nav_dashboard() },
		{ href: '/settings', label: m.nav_settings() }
	];
</script>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-sm">
		<nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<!-- Logo -->
			<a href="/dashboard" class="flex items-center gap-2 text-base font-bold">
				<span
					class="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground"
					>B</span
				>
				<span class="hidden sm:inline">{m.app_name()}</span>
			</a>

			<!-- Desktop nav -->
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

			<!-- Right side -->
			<div class="flex items-center gap-2">
				<!-- Desktop user info + logout -->
				<span class="hidden text-sm text-muted-foreground lg:block">
					{data.user.displayName ?? data.user.email}
				</span>
				<div
					class="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
					title={data.user.displayName ?? data.user.email}
				>
					{initial}
				</div>
				<form method="POST" action="/logout" class="hidden sm:block">
					<button
						type="submit"
						class="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
					>
						{m.nav_logout()}
					</button>
				</form>

				<!-- Mobile hamburger -->
				<button
					onclick={() => (menuOpen = !menuOpen)}
					class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted sm:hidden"
					aria-label="Toggle menu"
				>
					{#if menuOpen}
						<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12"/>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
						</svg>
					{/if}
				</button>
			</div>
		</nav>

		<!-- Mobile dropdown menu -->
		{#if menuOpen}
			<div class="border-t bg-background px-4 pb-4 pt-2 sm:hidden">
				{#each navLinks as link}
					<a
						href={link.href}
						onclick={() => (menuOpen = false)}
						class="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition {page.url.pathname.startsWith(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}"
					>
						{link.label}
					</a>
				{/each}
				<div class="mt-2 border-t pt-2">
					<p class="px-3 py-1 text-xs text-muted-foreground">{data.user.displayName ?? data.user.email}</p>
					<form method="POST" action="/logout">
						<button type="submit" class="flex w-full items-center rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-destructive">
							{m.nav_logout()}
						</button>
					</form>
				</div>
			</div>
		{/if}
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>

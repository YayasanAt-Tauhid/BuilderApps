<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="border-b">
		<nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<a href="/dashboard" class="text-lg font-bold text-primary">{m.app_name()}</a>
			<div class="flex items-center gap-4 text-sm">
				<a href="/dashboard" class="hover:text-primary">{m.nav_dashboard()}</a>
				<a href="/settings" class="hover:text-primary">{m.nav_settings()}</a>
				<span class="text-muted-foreground">{data.user.displayName ?? data.user.email}</span>
				<form method="POST" action="/logout">
					<button type="submit" class="hover:text-primary">{m.nav_logout()}</button>
				</form>
			</div>
		</nav>
	</header>
	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>

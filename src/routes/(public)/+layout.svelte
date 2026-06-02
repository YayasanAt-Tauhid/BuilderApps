<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<a href="/" class="flex items-center gap-2 text-lg font-bold">
				<span
					class="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground"
					>B</span
				>
				{m.app_name()}
			</a>
			<div class="flex items-center gap-4 text-sm">
				<a href="/about" class="text-muted-foreground transition hover:text-foreground">About</a>
				<a href="/login" class="text-muted-foreground transition hover:text-foreground"
					>{m.auth_login()}</a
				>
				<a
					href="/register"
					class="rounded-lg bg-primary px-4 py-1.5 font-medium text-primary-foreground transition hover:opacity-90"
				>
					{m.auth_register()}
				</a>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-5xl flex-1 px-4">
		{@render children()}
	</main>

	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		© {new Date().getFullYear()}
		{m.app_name()} — Built on Cloudflare Workers
	</footer>
</div>

<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="border-b">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
			<a href="/" class="text-lg font-bold text-primary">{m.app_name()}</a>
			<div class="flex items-center gap-4 text-sm">
				<a href="/about" class="hover:text-primary">About</a>
				<a href="/login" class="hover:text-primary">{m.auth_login()}</a>
				<a
					href="/register"
					class="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90"
				>
					{m.auth_register()}
				</a>
			</div>
		</nav>
	</header>
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
		{@render children()}
	</main>
	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		© {new Date().getFullYear()}
		{m.app_name()}
	</footer>
</div>

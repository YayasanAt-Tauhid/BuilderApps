<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-4">
	<a href="/" class="mb-8 text-2xl font-bold text-primary">{m.app_name()}</a>
	<div class="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
		{@render children()}
	</div>
</div>

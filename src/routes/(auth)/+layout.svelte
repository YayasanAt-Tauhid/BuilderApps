<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center px-4"
	style="background: radial-gradient(ellipse at top, hsl(from var(--primary) h s l / 0.08) 0%, transparent 70%);"
>
	<a href="/" class="mb-8 flex items-center gap-2 text-2xl font-bold">
		<span
			class="flex size-8 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground"
			>B</span
		>
		{m.app_name()}
	</a>
	<div class="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-xl shadow-black/5">
		{@render children()}
	</div>
</div>

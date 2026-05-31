<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

	const projectId = $derived(page.params.id);
</script>

<svelte:head><title>{m.project_preview()}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a href="/projects/{projectId}" class="text-sm text-muted-foreground hover:text-primary">← Back</a
	>
	<h1 class="text-xl font-bold">{m.project_preview()}</h1>
</div>

<p class="mb-3 text-sm text-muted-foreground">
	Sandboxed preview of the generated frontend only (not full-stack execution).
</p>

<!-- Sandboxed: the iframe cannot script the parent or use same-origin credentials. -->
<iframe
	title="Frontend preview"
	src="/api/v1/projects/{projectId}/preview"
	sandbox="allow-scripts"
	class="h-[70vh] w-full rounded-lg border bg-white"
></iframe>

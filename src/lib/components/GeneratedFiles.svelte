<script lang="ts">
	import { parseStream } from '$lib/utils/parse-stream';

	let { text, live = false }: { text: string; live?: boolean } = $props();

	const parsed = $derived(parseStream(text));
	let expanded = $state<Record<string, boolean>>({});

	function toggle(key: string) {
		expanded[key] = !expanded[key];
	}
</script>

{#if parsed.intro}
	<p class="mb-2 whitespace-pre-wrap text-sm text-muted-foreground">{parsed.intro}</p>
{/if}

{#if parsed.files.length > 0}
	<ul class="flex flex-col gap-1">
		{#each parsed.files as file, i (i)}
			{@const key = String(i)}
			{@const isOpen = expanded[key]}
			<li class="overflow-hidden rounded-md border bg-background">
				<button
					type="button"
					onclick={() => toggle(key)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
				>
					{#if file.complete}
						<span class="text-success" aria-label="done">✓</span>
					{:else}
						<span
							class="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
							aria-label="generating"
						></span>
					{/if}
					<span class="flex-1 truncate font-mono text-xs">{file.path}</span>
					{#if !file.complete}
						<span class="text-xs text-muted-foreground">writing…</span>
					{/if}
					<span class="text-muted-foreground transition-transform" class:rotate-90={isOpen}>›</span>
				</button>
				{#if isOpen}
					<pre
						class="max-h-[50vh] overflow-auto border-t bg-muted p-3 font-mono text-xs">{file.content}</pre>
				{/if}
			</li>
		{/each}
	</ul>
{:else if live}
	<p class="text-sm text-muted-foreground">Thinking…</p>
{/if}

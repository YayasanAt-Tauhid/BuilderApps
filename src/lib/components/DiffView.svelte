<script lang="ts">
	let { content }: { content: string } = $props();

	type LineType = 'add' | 'remove' | 'header' | 'context';

	interface DiffLine {
		type: LineType;
		text: string;
	}

	const lines = $derived<DiffLine[]>(
		content.split('\n').map((line): DiffLine => {
			if (line.startsWith('@@')) return { type: 'header', text: line };
			if (line.startsWith('+')) return { type: 'add', text: line.slice(1) };
			if (line.startsWith('-')) return { type: 'remove', text: line.slice(1) };
			return { type: 'context', text: line.startsWith(' ') ? line.slice(1) : line };
		})
	);
</script>

<div class="max-h-[50vh] overflow-auto border-t">
	{#each lines as line, i (i)}
		{#if line.type === 'add'}
			<div class="flex font-mono text-xs leading-5 whitespace-pre bg-green-950/30">
				<span class="w-5 shrink-0 select-none text-center text-green-500">+</span>
				<span class="flex-1 px-1 text-green-300">{line.text}</span>
			</div>
		{:else if line.type === 'remove'}
			<div class="flex font-mono text-xs leading-5 whitespace-pre bg-red-950/30">
				<span class="w-5 shrink-0 select-none text-center text-red-500">-</span>
				<span class="flex-1 px-1 text-red-300">{line.text}</span>
			</div>
		{:else if line.type === 'header'}
			<div class="flex font-mono text-xs leading-5 whitespace-pre bg-blue-950/20">
				<span class="w-5 shrink-0 select-none text-center text-blue-400">@</span>
				<span class="flex-1 px-1 text-blue-400">{line.text}</span>
			</div>
		{:else}
			<div class="flex font-mono text-xs leading-5 whitespace-pre bg-muted">
				<span class="w-5 shrink-0 select-none text-center text-muted-foreground"> </span>
				<span class="flex-1 px-1 text-muted-foreground">{line.text}</span>
			</div>
		{/if}
	{/each}
</div>

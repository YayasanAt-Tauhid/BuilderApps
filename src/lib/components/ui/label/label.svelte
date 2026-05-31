<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLLabelAttributes & { children?: Snippet };
	let { class: className, children, ...rest }: Props = $props();
</script>

<label class={cn('text-sm font-medium leading-none', className)} {...rest}>
	{@render children?.()}
</label>

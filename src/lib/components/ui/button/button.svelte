<script lang="ts" module>
	export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'ghost' | 'link';
	export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	type Props = HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		children?: Snippet;
	};

	let {
		variant = 'default',
		size = 'default',
		class: className,
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

	const variants: Record<ButtonVariant, string> = {
		default: 'bg-primary text-primary-foreground hover:opacity-90',
		destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
		outline: 'border border-input bg-background hover:bg-muted',
		ghost: 'hover:bg-muted',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizes: Record<ButtonSize, string> = {
		default: 'h-10 px-4 py-2',
		sm: 'h-9 px-3',
		lg: 'h-11 px-6',
		icon: 'h-10 w-10'
	};
</script>

<button class={cn(base, variants[variant], sizes[size], className)} {...rest}>
	{@render children?.()}
</button>

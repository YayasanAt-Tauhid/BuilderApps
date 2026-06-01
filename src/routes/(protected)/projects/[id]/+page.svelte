<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import GeneratedFiles from '$lib/components/GeneratedFiles.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ChatMsg = { id: string; role: string; content: string };
	let history = $state<ChatMsg[]>(
		data.messages.map((x) => ({ id: x.id, role: x.role, content: x.content }))
	);
	let streaming = $state('');
	let status = $state<'idle' | 'running' | 'error'>('idle');
	let statusText = $state('');
	let prompt = $state('');
	let chatEl = $state<HTMLDivElement | null>(null);

	const projectId = data.project.id;

	function scrollBottom() {
		setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
	}

	async function refreshMessages(): Promise<ChatMsg[]> {
		const res = await fetch(`/api/v1/projects/${projectId}/messages`);
		if (!res.ok) return history;
		const body = await res.json();
		return (body.data ?? []).map((x: ChatMsg) => ({ id: x.id, role: x.role, content: x.content }));
	}

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function finishOk(version: number) {
		history = await refreshMessages();
		streaming = '';
		status = 'idle';
		statusText = `Done — v${version} is ready in the Files tab.`;
		scrollBottom();
	}

	async function pollGeneration(generationId: string) {
		for (let i = 0; i < 90; i++) {
			await sleep(2000);
			const gRes = await fetch(`/api/v1/generations/${generationId}`);
			if (!gRes.ok) continue;
			const g = (await gRes.json()).data;
			if (g.status === 'succeeded') return finishOk(g.version);
			if (g.status === 'failed') {
				status = 'error';
				statusText = g.errorMessage ?? 'Generation failed. Please try again.';
				return;
			}
		}
		status = 'error';
		statusText = 'Generation timed out. Please try again.';
	}

	async function streamGeneration(generationId: string) {
		const res = await fetch(`/api/v1/projects/${projectId}/generations/${generationId}/stream`, {
			headers: { Accept: 'text/event-stream' }
		});
		if (!res.ok || !res.body) throw new Error('stream unavailable');

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buf = '';
		let needFallback = false;

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });

			let sep: number;
			while ((sep = buf.indexOf('\n\n')) !== -1) {
				const frame = buf.slice(0, sep);
				buf = buf.slice(sep + 2);

				let eventName = 'message';
				let dataStr = '';
				for (const line of frame.split('\n')) {
					if (line.startsWith('event:')) eventName = line.slice(6).trim();
					else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
				}
				let payload: Record<string, unknown>;
				try {
					payload = dataStr ? JSON.parse(dataStr) : {};
				} catch {
					payload = {};
				}

				if (eventName === 'token') {
					streaming += String(payload.content ?? '');
					scrollBottom();
				} else if (eventName === 'done') {
					await finishOk(Number(payload.version ?? 1));
					return;
				} else if (eventName === 'failed') {
					status = 'error';
					statusText = String(payload.message ?? 'Generation failed. Please try again.');
					return;
				} else if (eventName === 'fallback') {
					needFallback = true;
				}
			}
		}
		await pollGeneration(generationId);
		void needFallback;
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		const content = prompt.trim();
		if (!content || status === 'running') return;

		history = [...history, { id: crypto.randomUUID(), role: 'user', content }];
		prompt = '';
		status = 'running';
		streaming = '';
		statusText = 'Generating…';
		scrollBottom();

		const res = await fetch(`/api/v1/projects/${projectId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
		if (!res.ok) {
			status = 'error';
			const body = await res.json().catch(() => null);
			statusText = body?.error?.message ?? 'Request failed.';
			return;
		}
		const { data: created } = await res.json();
		const generationId: string = created.generation.id;

		try {
			await streamGeneration(generationId);
		} catch {
			await pollGeneration(generationId);
		}
	}
</script>

<svelte:head><title>{data.project.name} — {m.app_name()}</title></svelte:head>

<!-- Use dvh for mobile browser bar awareness -->
<div class="flex h-[calc(100dvh-4rem)] flex-col">
	<!-- Header -->
	<div class="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
		<a
			href="/dashboard"
			class="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
			aria-label="Back to dashboard"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 5l-7 7 7 7"/>
			</svg>
		</a>
		<h1 class="min-w-0 truncate text-base font-bold sm:text-lg">{data.project.name}</h1>
		<div class="ml-auto flex shrink-0 items-center gap-1 text-sm">
			<a
				href="/projects/{projectId}/files"
				class="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted sm:px-3 sm:text-sm"
			>
				Files
			</a>
			<a
				href="/projects/{projectId}/preview"
				class="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted sm:px-3 sm:text-sm"
			>
				Preview
			</a>
			<a
				href="/api/v1/projects/{projectId}/export"
				class="hidden rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted sm:block sm:px-3 sm:text-sm"
			>
				Export
			</a>
		</div>
	</div>

	<!-- Chat area -->
	<div class="flex flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
		<!-- Messages -->
		<div bind:this={chatEl} class="flex flex-1 flex-col gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-5">
			{#if history.length === 0 && !streaming}
				<div class="flex flex-col items-center justify-center gap-3 py-12 text-center sm:py-16">
					<div class="text-4xl sm:text-5xl">✨</div>
					<p class="font-semibold">What are we building today?</p>
					<p class="max-w-xs text-sm text-muted-foreground">
						Describe your app idea below. Be specific — include features, tech stack, or style preferences.
					</p>
					<!-- Quick prompts -->
					<div class="mt-2 flex flex-wrap justify-center gap-2">
						{#each ['Todo list app', 'Landing page', 'Calculator', 'Weather app'] as q}
							<button
								type="button"
								onclick={() => { prompt = q; }}
								class="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
							>
								{q}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#each history as msg (msg.id)}
				{#if msg.role === 'user'}
					<div class="flex justify-end">
						<div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm sm:max-w-[80%]">
							<pre class="whitespace-pre-wrap font-sans">{msg.content}</pre>
						</div>
					</div>
				{:else}
					<div class="flex justify-start gap-2 sm:gap-3">
						<div
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary sm:size-7 sm:text-xs"
						>
							AI
						</div>
						<div class="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-background px-3 py-2.5 text-sm shadow-sm sm:px-4">
							<GeneratedFiles text={msg.content} />
						</div>
					</div>
				{/if}
			{/each}

			{#if streaming}
				<div class="flex justify-start gap-2 sm:gap-3">
					<div class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary sm:size-7 sm:text-xs">
						AI
					</div>
					<div class="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-background px-3 py-2.5 text-sm shadow-sm sm:px-4">
						<GeneratedFiles text={streaming} live />
					</div>
				</div>
			{/if}

			{#if status === 'running'}
				<div class="flex items-center gap-2 pl-8 text-xs text-muted-foreground sm:pl-10">
					<span class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
					{statusText}
				</div>
			{:else if status === 'error'}
				<div class="ml-8 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:ml-10">
					{statusText}
				</div>
			{:else if statusText}
				<div class="flex items-center gap-1.5 pl-8 text-xs text-success sm:pl-10">
					<svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5"/>
					</svg>
					{statusText}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<form onsubmit={send} class="flex items-end gap-2 border-t bg-card/80 p-3 sm:p-4">
			<textarea
				bind:value={prompt}
				placeholder={m.project_describe()}
				rows="1"
				disabled={status === 'running'}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						e.currentTarget.form?.requestSubmit();
					}
				}}
				oninput={(e) => {
					const el = e.currentTarget;
					el.style.height = 'auto';
					el.style.height = Math.min(el.scrollHeight, 120) + 'px';
				}}
				class="max-h-28 flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-sm shadow-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 sm:max-h-36 sm:px-4"
			></textarea>
			<button
				type="submit"
				disabled={status === 'running'}
				class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
				aria-label="Send"
			>
				{#if status === 'running'}
					<span class="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
					</svg>
				{/if}
			</button>
		</form>
	</div>
</div>

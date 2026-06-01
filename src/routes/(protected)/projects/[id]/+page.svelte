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

<div class="flex h-[calc(100vh-5rem)] flex-col">
	<!-- Header -->
	<div class="mb-4 flex items-center gap-3">
		<a href="/dashboard" class="text-muted-foreground transition hover:text-foreground">
			<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 5l-7 7 7 7"/>
			</svg>
		</a>
		<h1 class="text-lg font-bold">{data.project.name}</h1>
		<div class="ml-auto flex items-center gap-1 text-sm">
			<a
				href="/projects/{projectId}/files"
				class="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
			>
				{m.project_files()}
			</a>
			<a
				href="/projects/{projectId}/preview"
				class="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
			>
				{m.project_preview()}
			</a>
			<a
				href="/api/v1/projects/{projectId}/export"
				class="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
			>
				Export .zip
			</a>
		</div>
	</div>

	<!-- Chat area -->
	<div class="flex flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
		<!-- Messages -->
		<div bind:this={chatEl} class="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
			{#if history.length === 0 && !streaming}
				<div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
					<div class="text-5xl">✨</div>
					<p class="font-semibold">What are we building today?</p>
					<p class="max-w-sm text-sm text-muted-foreground">
						Describe your app idea below. Be specific — include features, tech stack, or style preferences.
					</p>
				</div>
			{/if}

			{#each history as msg (msg.id)}
				{#if msg.role === 'user'}
					<div class="flex justify-end">
						<div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
							<pre class="whitespace-pre-wrap font-sans">{msg.content}</pre>
						</div>
					</div>
				{:else}
					<div class="flex justify-start">
						<div class="flex max-w-[90%] gap-3">
							<div
								class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
							>
								AI
							</div>
							<div class="rounded-2xl rounded-tl-sm border bg-background px-4 py-2.5 text-sm shadow-sm">
								<GeneratedFiles text={msg.content} />
							</div>
						</div>
					</div>
				{/if}
			{/each}

			{#if streaming}
				<div class="flex justify-start">
					<div class="flex max-w-[90%] gap-3">
						<div
							class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
						>
							AI
						</div>
						<div class="rounded-2xl rounded-tl-sm border bg-background px-4 py-2.5 text-sm shadow-sm">
							<GeneratedFiles text={streaming} live />
						</div>
					</div>
				</div>
			{/if}

			{#if status === 'running'}
				<div class="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
					<span class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
					{statusText}
				</div>
			{:else if status === 'error'}
				<div class="ml-10 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{statusText}
				</div>
			{:else if statusText}
				<div class="flex items-center gap-1.5 pl-10 text-xs text-success">
					<svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5"/>
					</svg>
					{statusText}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<form onsubmit={send} class="flex items-end gap-2 border-t bg-card/80 p-4">
			<textarea
				bind:value={prompt}
				placeholder={m.project_describe()}
				rows="1"
				disabled={status === 'running'}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
				}}
				oninput={(e) => {
					const el = e.currentTarget;
					el.style.height = 'auto';
					el.style.height = Math.min(el.scrollHeight, 140) + 'px';
				}}
				class="max-h-36 flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm shadow-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
			></textarea>
			<button
				type="submit"
				disabled={status === 'running'}
				class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
				title="Send (Enter)"
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

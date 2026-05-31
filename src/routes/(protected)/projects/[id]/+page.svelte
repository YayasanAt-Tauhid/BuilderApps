<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ChatMsg = { id: string; role: string; content: string };
	let history = $state<ChatMsg[]>(
		data.messages.map((x) => ({ id: x.id, role: x.role, content: x.content }))
	);
	let status = $state<'idle' | 'running' | 'error'>('idle');
	let statusText = $state('');
	let prompt = $state('');

	const projectId = data.project.id;

	async function refreshMessages(): Promise<ChatMsg[]> {
		const res = await fetch(`/api/v1/projects/${projectId}/messages`);
		if (!res.ok) return history;
		const body = await res.json();
		return (body.data ?? []).map((x: ChatMsg) => ({ id: x.id, role: x.role, content: x.content }));
	}

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		const content = prompt.trim();
		if (!content || status === 'running') return;

		history = [...history, { id: crypto.randomUUID(), role: 'user', content }];
		prompt = '';
		status = 'running';
		statusText = 'Generating… this can take a few seconds.';

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

		// Poll the generation status until it finishes (WebSocket streaming is disabled —
		// generation results are persisted, so we poll and then load the assistant reply).
		for (let i = 0; i < 90; i++) {
			await sleep(2000);
			const gRes = await fetch(`/api/v1/generations/${generationId}`);
			if (!gRes.ok) continue;
			const g = (await gRes.json()).data;
			if (g.status === 'succeeded') {
				history = await refreshMessages();
				status = 'idle';
				statusText = `Done — generated files are in the Files tab (v${g.version}).`;
				return;
			}
			if (g.status === 'failed') {
				status = 'error';
				statusText = g.errorMessage ?? 'Generation failed. Please try again.';
				return;
			}
		}
		status = 'error';
		statusText = 'Generation timed out. Please try again.';
	}
</script>

<svelte:head><title>{data.project.name} — {m.app_name()}</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-bold">{data.project.name}</h1>
	<div class="flex gap-3 text-sm">
		<a href="/projects/{projectId}/files" class="hover:text-primary">{m.project_files()}</a>
		<a href="/projects/{projectId}/preview" class="hover:text-primary">{m.project_preview()}</a>
		<a href="/api/v1/projects/{projectId}/export" class="hover:text-primary">Export .zip</a>
	</div>
</div>

<div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
	<div class="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
		{#each history as msg (msg.id)}
			<div
				class="rounded-md p-3 text-sm {msg.role === 'user' ? 'bg-muted' : 'border bg-background'}"
			>
				<span class="mb-1 block text-xs font-medium text-muted-foreground">{msg.role}</span>
				<pre class="whitespace-pre-wrap font-mono text-xs">{msg.content}</pre>
			</div>
		{/each}
		{#if status === 'running'}
			<p class="flex items-center gap-2 text-sm text-muted-foreground">
				<span class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
				></span>
				{statusText}
			</p>
		{:else if status === 'error'}
			<p class="text-sm text-destructive">{statusText}</p>
		{:else if statusText}
			<p class="text-sm text-success">{statusText}</p>
		{/if}
	</div>

	<form onsubmit={send} class="flex gap-2 border-t pt-3">
		<input
			bind:value={prompt}
			placeholder={m.project_describe()}
			class="flex-1 rounded-md border bg-background px-3 py-2"
		/>
		<button
			type="submit"
			disabled={status === 'running'}
			class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
		>
			{m.project_send()}
		</button>
	</form>
</div>

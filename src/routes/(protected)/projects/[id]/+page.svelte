<script lang="ts">
	import { onDestroy } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ChatMsg = { id: string; role: string; content: string };
	let history = $state<ChatMsg[]>(
		data.messages.map((x) => ({ id: x.id, role: x.role, content: x.content }))
	);
	let streaming = $state('');
	let status = $state<'idle' | 'running' | 'error'>('idle');
	let prompt = $state('');
	let socket: WebSocket | null = null;

	function connect() {
		if (socket) return;
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		socket = new WebSocket(`${proto}://${location.host}/api/v1/projects/${data.project.id}/ws`);
		socket.addEventListener('message', (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.type === 'token') {
				streaming += msg.content;
			} else if (msg.type === 'done') {
				history = [...history, { id: msg.generationId, role: 'assistant', content: streaming }];
				streaming = '';
				status = 'idle';
			} else if (msg.type === 'error') {
				status = 'error';
				streaming = '';
			} else if (msg.type === 'status' && msg.status === 'running') {
				status = 'running';
			}
		});
		socket.addEventListener('close', () => {
			socket = null;
		});
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		const content = prompt.trim();
		if (!content || status === 'running') return;
		connect();
		history = [...history, { id: crypto.randomUUID(), role: 'user', content }];
		prompt = '';
		status = 'running';
		streaming = '';

		const res = await fetch(`/api/v1/projects/${data.project.id}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
		if (!res.ok) {
			status = 'error';
			const body = await res.json().catch(() => null);
			streaming = body?.error?.message ?? 'Request failed.';
		}
	}

	onDestroy(() => socket?.close());
</script>

<svelte:head><title>{data.project.name} — {m.app_name()}</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-bold">{data.project.name}</h1>
	<div class="flex gap-3 text-sm">
		<a href="/projects/{data.project.id}/files" class="hover:text-primary">{m.project_files()}</a>
		<a href="/projects/{data.project.id}/preview" class="hover:text-primary"
			>{m.project_preview()}</a
		>
		<a href="/api/v1/projects/{data.project.id}/export" class="hover:text-primary">Export .zip</a>
	</div>
</div>

<div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
	<div class="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
		{#each history as msg (msg.id)}
			<div
				class="rounded-md p-3 text-sm {msg.role === 'user' ? 'bg-muted' : 'bg-background border'}"
			>
				<span class="mb-1 block text-xs font-medium text-muted-foreground">{msg.role}</span>
				<pre class="whitespace-pre-wrap font-mono text-xs">{msg.content}</pre>
			</div>
		{/each}
		{#if streaming}
			<div class="rounded-md border bg-background p-3 text-sm">
				<span class="mb-1 block text-xs font-medium text-muted-foreground">assistant</span>
				<pre class="whitespace-pre-wrap font-mono text-xs">{streaming}</pre>
			</div>
		{/if}
		{#if status === 'running' && !streaming}
			<p class="text-sm text-muted-foreground">Generating…</p>
		{/if}
		{#if status === 'error'}
			<p class="text-sm text-destructive">Generation failed. Please try again.</p>
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

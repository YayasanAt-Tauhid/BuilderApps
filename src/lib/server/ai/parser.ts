// Parses the model's streamed output into generated files and/or unified diff patches.
//
// Two output formats are supported (both can appear in the same generation):
//
// 1. Full file (new file or full rewrite):
//    === FILE: relative/path/to/file.ext ===
//    <full file content>
//    === END FILE ===
//
// 2. Unified diff patch (targeted edit):
//    === PATCH: relative/path/to/file.ext ===
//    @@ ... @@
//     context line
//    -removed line
//    +added line
//     context line
//    === END PATCH ===

export interface ParsedFile {
	path: string;
	content: string;
}

export interface Hunk {
	/** Lines to find in the file: context + removed lines, in diff order. */
	search: string[];
	/** Replacement lines: context + added lines, in diff order. */
	replace: string[];
}

export interface ParsedPatch {
	path: string;
	hunks: Hunk[];
}

export interface ParseResult {
	files: ParsedFile[];
	patches: ParsedPatch[];
	deletedPaths: string[];
}

const FILE_START = /^===\s*FILE:\s*(.+?)\s*===$/;
const FILE_END = /^===\s*END FILE\s*===$/;
const PATCH_START = /^===\s*PATCH:\s*(.+?)\s*===$/;
const PATCH_END = /^===\s*END PATCH\s*===$/;
const DELETE_MARKER = /^===\s*DELETE:\s*(.+?)\s*===$/;
const HUNK_HEAD = /^@@/;

type Mode = 'none' | 'file' | 'patch';

export function parseOutput(output: string): ParseResult {
	const lines = output.split('\n');
	const files: ParsedFile[] = [];
	const patches: ParsedPatch[] = [];
	const deletedPaths: string[] = [];

	let mode: Mode = 'none';
	let currentPath: string | null = null;
	let fileBuf: string[] = [];

	let patchHunks: Hunk[] = [];
	let hunkSearch: string[] = [];
	let hunkReplace: string[] = [];
	let inHunk = false;

	const flushFile = () => {
		if (currentPath) files.push({ path: currentPath, content: fileBuf.join('\n') });
		currentPath = null;
		fileBuf = [];
	};
	const flushHunk = () => {
		if (inHunk && (hunkSearch.length || hunkReplace.length))
			patchHunks.push({ search: hunkSearch, replace: hunkReplace });
		hunkSearch = [];
		hunkReplace = [];
		inHunk = false;
	};
	const flushPatch = () => {
		flushHunk();
		if (currentPath && patchHunks.length) patches.push({ path: currentPath, hunks: patchHunks });
		currentPath = null;
		patchHunks = [];
	};

	for (const line of lines) {
		const del = line.match(DELETE_MARKER);
		if (del) {
			const p = sanitizePath(del[1]);
			if (p) deletedPaths.push(p);
			continue;
		}

		const fs = line.match(FILE_START);
		if (fs) {
			if (mode === 'file') flushFile();
			if (mode === 'patch') flushPatch();
			mode = 'file';
			currentPath = sanitizePath(fs[1]);
			fileBuf = [];
			continue;
		}
		if (FILE_END.test(line) && mode === 'file') {
			flushFile();
			mode = 'none';
			continue;
		}

		const ps = line.match(PATCH_START);
		if (ps) {
			if (mode === 'file') flushFile();
			if (mode === 'patch') flushPatch();
			mode = 'patch';
			currentPath = sanitizePath(ps[1]);
			patchHunks = [];
			inHunk = false;
			continue;
		}
		if (PATCH_END.test(line) && mode === 'patch') {
			flushPatch();
			mode = 'none';
			continue;
		}

		if (mode === 'file') {
			fileBuf.push(line);
			continue;
		}

		if (mode === 'patch') {
			if (HUNK_HEAD.test(line)) {
				flushHunk();
				inHunk = true;
				continue;
			}
			if (!inHunk) continue;
			if (line.startsWith('-')) {
				hunkSearch.push(line.slice(1)); // removed → search only
			} else if (line.startsWith('+')) {
				hunkReplace.push(line.slice(1)); // added → replace only
			} else {
				const ctx = line.startsWith(' ') ? line.slice(1) : line;
				hunkSearch.push(ctx); // context → both
				hunkReplace.push(ctx);
			}
		}
	}

	if (mode === 'file') flushFile();
	if (mode === 'patch') flushPatch();

	const byPath = new Map(files.filter((f) => f.path).map((f) => [f.path, f.content]));
	return {
		files: [...byPath.entries()].map(([path, content]) => ({ path, content })),
		patches,
		deletedPaths
	};
}

/**
 * Apply all hunks of a patch to the given file content.
 * Returns patched string, or null if any hunk cannot be located.
 * Caller must handle null (e.g. fall back to full rewrite).
 */
export function applyPatch(original: string, patch: ParsedPatch): string | null {
	let result = original;
	for (const hunk of patch.hunks) {
		const next = applyHunk(result, hunk);
		if (next === null) return null;
		result = next;
	}
	return result;
}

function applyHunk(content: string, hunk: Hunk): string | null {
	const lines = content.split('\n');
	if (!hunk.search.length) return content + '\n' + hunk.replace.join('\n'); // pure insert at EOF

	const start = findBlock(lines, hunk.search);
	if (start === -1) return null;
	return [
		...lines.slice(0, start),
		...hunk.replace,
		...lines.slice(start + hunk.search.length)
	].join('\n');
}

function findBlock(lines: string[], search: string[]): number {
	for (const eq of [
		(a: string, b: string) => a === b,
		(a: string, b: string) => a.trimEnd() === b.trimEnd(),
		(a: string, b: string) => a.trim() === b.trim()
	]) {
		outer: for (let i = 0; i <= lines.length - search.length; i++) {
			for (let j = 0; j < search.length; j++) if (!eq(lines[i + j], search[j])) continue outer;
			return i;
		}
	}
	return -1;
}

/** Legacy wrapper around parseOutput(). */
export function parseGeneratedFiles(output: string): ParseResult {
	return parseOutput(output);
}

/** Reject path traversal and absolute paths; normalize separators. */
export function sanitizePath(raw: string): string {
	return raw
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.split('/')
		.filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
		.join('/');
}

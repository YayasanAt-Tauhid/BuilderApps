// Parses the model's streamed output into generated files and/or unified diff patches.
//
// Two output formats are supported (both can appear in the same generation):
//
// 1. Full file (new file or full rewrite):
//    === FILE: relative/path/to/file.ext ===
//    <full file content>
//    === END FILE ===
//
// 2. Unified diff patch (targeted edit — minimal token output):
//    === PATCH: relative/path/to/file.ext ===
//    @@ ... @@
//     context line
//    -removed line
//    +added line
//     context line
//    === END PATCH ===
//
//    Hunk headers: "@@ ... @@" (no line numbers required).
//    Multiple hunks per PATCH block are supported.
//    Any prose outside blocks is ignored (shown in chat, not written to R2).

export interface ParsedFile {
	path: string;
	content: string;
}

export interface Hunk {
	/** Lines to find in the file: context + removed lines, in diff order. */
	search: string[];
	/** Replacement: context + added lines, in diff order. */
	replace: string[];
}

export interface ParsedPatch {
	path: string;
	hunks: Hunk[];
}

export interface ParseResult {
	files: ParsedFile[];
	patches: ParsedPatch[];
}

const FILE_START_RE = /^===\s*FILE:\s*(.+?)\s*===$/;
const FILE_END_RE = /^===\s*END FILE\s*===$/;
const PATCH_START_RE = /^===\s*PATCH:\s*(.+?)\s*===$/;
const PATCH_END_RE = /^===\s*END PATCH\s*===$/;
const HUNK_HEADER_RE = /^@@/;

type Mode = 'none' | 'file' | 'patch';

export function parseOutput(output: string): ParseResult {
	const lines = output.split('\n');
	const files: ParsedFile[] = [];
	const patches: ParsedPatch[] = [];

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
		if (inHunk && (hunkSearch.length > 0 || hunkReplace.length > 0)) {
			patchHunks.push({ search: hunkSearch, replace: hunkReplace });
		}
		hunkSearch = [];
		hunkReplace = [];
		inHunk = false;
	};

	const flushPatch = () => {
		flushHunk();
		if (currentPath && patchHunks.length > 0) {
			patches.push({ path: currentPath, hunks: patchHunks });
		}
		currentPath = null;
		patchHunks = [];
	};

	for (const line of lines) {
		const fileStart = line.match(FILE_START_RE);
		if (fileStart) {
			if (mode === 'file') flushFile();
			if (mode === 'patch') flushPatch();
			mode = 'file';
			currentPath = sanitizePath(fileStart[1]);
			fileBuf = [];
			continue;
		}
		if (FILE_END_RE.test(line) && mode === 'file') {
			flushFile();
			mode = 'none';
			continue;
		}

		const patchStart = line.match(PATCH_START_RE);
		if (patchStart) {
			if (mode === 'file') flushFile();
			if (mode === 'patch') flushPatch();
			mode = 'patch';
			currentPath = sanitizePath(patchStart[1]);
			patchHunks = [];
			inHunk = false;
			continue;
		}
		if (PATCH_END_RE.test(line) && mode === 'patch') {
			flushPatch();
			mode = 'none';
			continue;
		}

		if (mode === 'file') {
			fileBuf.push(line);
			continue;
		}

		if (mode === 'patch') {
			if (HUNK_HEADER_RE.test(line)) {
				flushHunk();
				inHunk = true;
				continue;
			}
			if (!inHunk) continue;
			if (line.startsWith('-')) {
				// Removed line: part of the search block, not the replacement.
				hunkSearch.push(line.slice(1));
			} else if (line.startsWith('+')) {
				// Added line: part of the replacement, not the search block.
				hunkReplace.push(line.slice(1));
			} else {
				// Context line (space-prefixed): present in both search and replace.
				const ctx = line.startsWith(' ') ? line.slice(1) : line;
				hunkSearch.push(ctx);
				hunkReplace.push(ctx);
			}
		}
	}

	if (mode === 'file') flushFile();
	if (mode === 'patch') flushPatch();

	// De-dupe full files by path (last write wins).
	const byPath = new Map<string, string>();
	for (const f of files) {
		if (f.path) byPath.set(f.path, f.content);
	}

	return {
		files: [...byPath.entries()].map(([path, content]) => ({ path, content })),
		patches
	};
}

/**
 * Apply all hunks of a patch to the given file content.
 * Returns the patched string, or null if any hunk cannot be located.
 * Caller should fall back to a full file rewrite on null.
 */
export function applyPatch(original: string, patch: ParsedPatch): string | null {
	let result = original;
	for (const hunk of patch.hunks) {
		const applied = applyHunk(result, hunk);
		if (applied === null) return null;
		result = applied;
	}
	return result;
}

function applyHunk(content: string, hunk: Hunk): string | null {
	const fileLines = content.split('\n');
	if (hunk.search.length === 0) {
		// Pure insertion (no context/removals) — append at EOF.
		return content + '\n' + hunk.replace.join('\n');
	}
	const matchStart = findBlock(fileLines, hunk.search);
	if (matchStart === -1) return null;
	const before = fileLines.slice(0, matchStart);
	const after = fileLines.slice(matchStart + hunk.search.length);
	// hunk.replace already contains context lines (kept) + added lines in order.
	return [...before, ...hunk.replace, ...after].join('\n');
}

function findBlock(fileLines: string[], searchLines: string[]): number {
	if (searchLines.length === 0) return -1;
	// Pass 1: exact
	const exact = scan(fileLines, searchLines, (a, b) => a === b);
	if (exact !== -1) return exact;
	// Pass 2: ignore trailing whitespace
	const trimEnd = scan(fileLines, searchLines, (a, b) => a.trimEnd() === b.trimEnd());
	if (trimEnd !== -1) return trimEnd;
	// Pass 3: ignore all leading/trailing whitespace per line
	return scan(fileLines, searchLines, (a, b) => a.trim() === b.trim());
}

function scan(
	fileLines: string[],
	searchLines: string[],
	eq: (a: string, b: string) => boolean
): number {
	outer: for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
		for (let j = 0; j < searchLines.length; j++) {
			if (!eq(fileLines[i + j], searchLines[j])) continue outer;
		}
		return i;
	}
	return -1;
}

/** Legacy wrapper — prefer parseOutput(). */
export function parseGeneratedFiles(output: string): ParsedFile[] {
	return parseOutput(output).files;
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

// Parses the model's streamed output into a set of generated files.
//
// Contract (enforced by the system prompt): the model emits files delimited by
// path markers, e.g.
//
//   === FILE: src/routes/+page.svelte ===
//   <file content>
//   === END FILE ===
//
// For update mode the model may also emit:
//   === DELETE: relative/path ===
//
// Any prose outside FILE/DELETE blocks is ignored.

export interface ParsedFile {
	path: string;
	content: string;
}

export interface ParseResult {
	files: ParsedFile[];
	deletedPaths: string[];
}

const FILE_RE = /^===\s*FILE:\s*(.+?)\s*===$/;
const END_RE = /^===\s*END FILE\s*===$/;
const DELETE_RE = /^===\s*DELETE:\s*(.+?)\s*===$/;

export function parseGeneratedFiles(output: string): ParseResult {
	const lines = output.split('\n');
	const files: ParsedFile[] = [];
	const deletedPaths: string[] = [];
	let currentPath: string | null = null;
	let buf: string[] = [];

	for (const line of lines) {
		const deleteMatch = line.match(DELETE_RE);
		if (deleteMatch) {
			if (currentPath !== null) {
				files.push({ path: currentPath, content: buf.join('\n') });
				currentPath = null;
				buf = [];
			}
			const p = sanitizePath(deleteMatch[1]);
			if (p) deletedPaths.push(p);
			continue;
		}

		const startMatch = line.match(FILE_RE);
		if (startMatch) {
			// A new FILE marker implicitly closes any unterminated previous block.
			if (currentPath !== null) {
				files.push({ path: currentPath, content: buf.join('\n') });
			}
			currentPath = sanitizePath(startMatch[1]);
			buf = [];
			continue;
		}

		if (END_RE.test(line)) {
			if (currentPath !== null) {
				files.push({ path: currentPath, content: buf.join('\n') });
				currentPath = null;
				buf = [];
			}
			continue;
		}

		if (currentPath !== null) buf.push(line);
	}

	// Flush a trailing unterminated block (stream may have been cut off).
	if (currentPath !== null) {
		files.push({ path: currentPath, content: buf.join('\n') });
	}

	// De-dupe by path — last write wins.
	const byPath = new Map<string, string>();
	for (const f of files) {
		if (f.path) byPath.set(f.path, f.content);
	}

	return {
		files: [...byPath.entries()].map(([path, content]) => ({ path, content })),
		deletedPaths: [...new Set(deletedPaths)]
	};
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

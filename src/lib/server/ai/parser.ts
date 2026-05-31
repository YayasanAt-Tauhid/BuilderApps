// Parses the model's streamed output into a set of generated files.
//
// Contract (enforced by the system prompt): the model emits files delimited by
// path markers, e.g.
//
//   === FILE: src/routes/+page.svelte ===
//   <file content>
//   === END FILE ===
//
// Any prose outside FILE blocks is ignored (it is shown in chat but not written to R2).

export interface ParsedFile {
	path: string;
	content: string;
}

const FILE_RE = /^===\s*FILE:\s*(.+?)\s*===$/;
const END_RE = /^===\s*END FILE\s*===$/;

export function parseGeneratedFiles(output: string): ParsedFile[] {
	const lines = output.split('\n');
	const files: ParsedFile[] = [];
	let currentPath: string | null = null;
	let buf: string[] = [];

	for (const line of lines) {
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
	return [...byPath.entries()].map(([path, content]) => ({ path, content }));
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

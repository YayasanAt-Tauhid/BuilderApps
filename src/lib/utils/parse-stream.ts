// Incrementally parses the model's streamed output into files for the chat UI.
// Mirrors the server parser (ai/parser.ts) but tracks per-file completion + leading
// prose so the chat can render a live file list with spinners.

export interface StreamFile {
	path: string;
	content: string;
	complete: boolean;
	/** True when this entry represents a PATCH block (targeted edit), not a full file. */
	isPatch: boolean;
}

export interface ParsedStream {
	intro: string;
	files: StreamFile[];
}

const FILE_RE = /^===\s*FILE:\s*(.+?)\s*===$/;
const FILE_END_RE = /^===\s*END FILE\s*===$/;
const PATCH_RE = /^===\s*PATCH:\s*(.+?)\s*===$/;
const PATCH_END_RE = /^===\s*END PATCH\s*===$/;

export function parseStream(text: string): ParsedStream {
	const lines = text.split('\n');
	const intro: string[] = [];
	const files: StreamFile[] = [];
	let current: StreamFile | null = null;
	let buf: string[] = [];
	let sawFile = false;

	for (const line of lines) {
		const fileStart = line.match(FILE_RE);
		if (fileStart) {
			if (current) {
				current.content = buf.join('\n');
				files.push(current);
			}
			current = { path: fileStart[1], content: '', complete: false, isPatch: false };
			buf = [];
			sawFile = true;
			continue;
		}
		const patchStart = line.match(PATCH_RE);
		if (patchStart) {
			if (current) {
				current.content = buf.join('\n');
				files.push(current);
			}
			current = { path: patchStart[1], content: '', complete: false, isPatch: true };
			buf = [];
			sawFile = true;
			continue;
		}
		if (FILE_END_RE.test(line) || PATCH_END_RE.test(line)) {
			if (current) {
				current.content = buf.join('\n');
				current.complete = true;
				files.push(current);
				current = null;
				buf = [];
			}
			continue;
		}
		if (current) buf.push(line);
		else if (!sawFile) intro.push(line);
		// prose between completed files is ignored
	}

	// Trailing unterminated block = the file currently being written.
	if (current) {
		current.content = buf.join('\n');
		files.push(current);
	}

	return { intro: intro.join('\n').trim(), files };
}

// Incrementally parses the model's streamed output into files for the chat UI.
// Mirrors the server parser (ai/parser.ts) but tracks per-file completion + leading
// prose so the chat can render a live file list with spinners.

export interface StreamFile {
	path: string;
	content: string;
	complete: boolean;
}

export interface ParsedStream {
	intro: string;
	files: StreamFile[];
}

const FILE_RE = /^===\s*FILE:\s*(.+?)\s*===$/;
const END_RE = /^===\s*END FILE\s*===$/;

export function parseStream(text: string): ParsedStream {
	const lines = text.split('\n');
	const intro: string[] = [];
	const files: StreamFile[] = [];
	let current: StreamFile | null = null;
	let buf: string[] = [];
	let sawFile = false;

	for (const line of lines) {
		const start = line.match(FILE_RE);
		if (start) {
			if (current) {
				current.content = buf.join('\n');
				files.push(current);
			}
			current = { path: start[1], content: '', complete: false };
			buf = [];
			sawFile = true;
			continue;
		}
		if (END_RE.test(line)) {
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

// Incrementally parses the model's streamed output into files for the chat UI.
// Mirrors the server parser (ai/parser.ts) but tracks per-file completion + leading
// prose so the chat can render a live file list with spinners.

export interface StreamFile {
	path: string;
	content: string;
	complete: boolean;
	/** true when this entry is a PATCH block (diff), not a full file. */
	isPatch: boolean;
}

export interface ParsedStream {
	intro: string;
	files: StreamFile[];
}

const FILE_START = /^===\s*FILE:\s*(.+?)\s*===$/;
const FILE_END = /^===\s*END FILE\s*===$/;
const PATCH_START = /^===\s*PATCH:\s*(.+?)\s*===$/;
const PATCH_END = /^===\s*END PATCH\s*===$/;

export function parseStream(text: string): ParsedStream {
	const lines = text.split('\n');
	const intro: string[] = [];
	const files: StreamFile[] = [];
	let current: StreamFile | null = null;
	let buf: string[] = [];
	let sawFile = false;

	const pushCurrent = () => {
		if (current) {
			current.content = buf.join('\n');
			files.push(current);
		}
	};

	for (const line of lines) {
		const fs = line.match(FILE_START);
		if (fs) {
			pushCurrent();
			current = { path: fs[1], content: '', complete: false, isPatch: false };
			buf = [];
			sawFile = true;
			continue;
		}
		const ps = line.match(PATCH_START);
		if (ps) {
			pushCurrent();
			current = { path: ps[1], content: '', complete: false, isPatch: true };
			buf = [];
			sawFile = true;
			continue;
		}
		if ((FILE_END.test(line) || PATCH_END.test(line)) && current) {
			current.content = buf.join('\n');
			current.complete = true;
			files.push(current);
			current = null;
			buf = [];
			continue;
		}
		if (current) buf.push(line);
		else if (!sawFile) intro.push(line);
	}

	// Trailing unterminated block = file currently being written.
	if (current) {
		current.content = buf.join('\n');
		files.push(current);
	}

	return { intro: intro.join('\n').trim(), files };
}

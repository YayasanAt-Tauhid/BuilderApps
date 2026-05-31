import { describe, it, expect } from 'vitest';
import { parseStream } from '../../src/lib/utils/parse-stream';

describe('parseStream (live chat parser)', () => {
	it('captures intro prose and completed files', () => {
		const text = [
			'Here is your project:',
			'=== FILE: index.html ===',
			'<h1>Hi</h1>',
			'=== END FILE ==='
		].join('\n');
		const { intro, files } = parseStream(text);
		expect(intro).toBe('Here is your project:');
		expect(files).toEqual([{ path: 'index.html', content: '<h1>Hi</h1>', complete: true }]);
	});

	it('marks the trailing in-progress file as incomplete', () => {
		const text = '=== FILE: app.js ===\nconst x = 1;';
		const { files } = parseStream(text);
		expect(files).toHaveLength(1);
		expect(files[0].complete).toBe(false);
		expect(files[0].path).toBe('app.js');
	});

	it('handles multiple files with mixed completion', () => {
		const text =
			'=== FILE: a.css ===\nbody{}\n=== END FILE ===\n=== FILE: b.js ===\nconsole.error(1)';
		const { files } = parseStream(text);
		expect(files.map((f) => [f.path, f.complete])).toEqual([
			['a.css', true],
			['b.js', false]
		]);
	});

	it('returns no files for plain prose', () => {
		expect(parseStream('just thinking...').files).toHaveLength(0);
	});
});

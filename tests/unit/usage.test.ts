import { describe, it, expect } from 'vitest';
import { periodDate, DAILY_TOKEN_QUOTA } from '../../src/lib/server/usage';

describe('usage period', () => {
	it('formats the UTC date as YYYY-MM-DD', () => {
		const t = Date.UTC(2026, 4, 31, 23, 59, 0); // 2026-05-31
		expect(periodDate(t)).toBe('2026-05-31');
	});

	it('exposes a positive daily quota default', () => {
		expect(DAILY_TOKEN_QUOTA).toBeGreaterThan(0);
	});
});

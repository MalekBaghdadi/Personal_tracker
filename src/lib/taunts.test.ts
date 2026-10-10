import { describe, expect, it } from 'vitest';
import { TAUNTS, taunt } from './taunts';

describe('taunt', () => {
  it('holds still for the same seed and fills in the name', () => {
    const a = taunt('behind', 'link1:2026-10-11', 'Cousin');
    expect(taunt('behind', 'link1:2026-10-11', 'Cousin')).toBe(a);
    expect(TAUNTS.behind.map((l) => l.replace(/\{them\}/g, 'Cousin'))).toContain(a);
    expect(taunt('ahead', 'x', 'Cousin')).not.toContain('{them}');
  });
  it('varies across days', () => {
    const lines = new Set(Array.from({ length: 30 }, (_, i) => taunt('ahead', `link1:day${i}`, 'C')));
    expect(lines.size).toBeGreaterThan(3);
  });
  it('every line is short enough for a phone and swear-free', () => {
    for (const lines of Object.values(TAUNTS)) {
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(60);
        expect(l).not.toMatch(/\b(damn|hell|shit|fuck|crap|ass)\b/i);
      }
    }
  });
});

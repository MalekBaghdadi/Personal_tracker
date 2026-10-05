import { describe, expect, it } from 'vitest';
import { dayOf, todayIn } from './dates';

// Beirut is UTC+3 in October.
const TZ = 'Asia/Beirut';
const at = (local: string) => new Date(`${local}+03:00`);

describe('dayOf with a 5am rollover', () => {
  it('after midnight but before 5am is still the previous day', () => {
    expect(dayOf(at('2026-10-07T01:30:00'), TZ, 5)).toBe('2026-10-06');
    expect(dayOf(at('2026-10-07T04:59:59'), TZ, 5)).toBe('2026-10-06');
  });
  it('from 5am it is the new day', () => {
    expect(dayOf(at('2026-10-07T05:00:00'), TZ, 5)).toBe('2026-10-07');
    expect(dayOf(at('2026-10-07T23:59:00'), TZ, 5)).toBe('2026-10-07');
  });
  it('midnight rollover is the plain local date', () => {
    expect(dayOf(at('2026-10-07T00:10:00'), TZ, 0)).toBe('2026-10-07');
  });
  it('accepts ISO strings and works across months', () => {
    expect(dayOf(at('2026-11-01T02:00:00').toISOString(), TZ, 5)).toBe('2026-10-31');
  });
  it('todayIn uses the same rule', () => {
    expect(todayIn(TZ, 5, at('2026-10-07T03:00:00'))).toBe('2026-10-06');
    expect(todayIn(TZ, 0, at('2026-10-07T03:00:00'))).toBe('2026-10-07');
  });
});

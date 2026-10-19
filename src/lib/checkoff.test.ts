import { describe, expect, it } from 'vitest';
import { buildDayStats } from './admin';
import { computeStreaks } from './streaks';
import { formatTarget, formatValue, formatValueParts } from './format';
import type { Entry, Metric } from './types';

const entry = (id: string, metricId: string, localDate: string, value: number): Entry => ({
  id, metricId, localDate, value, source: 'manual', note: null,
  occurredAt: `${localDate}T12:00:00.000Z`, createdAt: '', updatedAt: '', deletedAt: null,
});

describe('check-off day totals', () => {
  const entries = [
    entry('a', 'gym', '2026-10-12', 3600), // a timed session from before the switch
    entry('b', 'gym', '2026-10-14', 1),
    entry('c', 'gym', '2026-10-14', 1), // ticked on two offline devices
    entry('d', 'study', '2026-10-14', 1800),
  ];
  const stats = buildDayStats(entries, [{ id: 'gym', type: 'check' }, { id: 'study', type: 'duration' }]);

  it('a day with anything logged is one done day', () => {
    expect(stats.get('gym')!.get('2026-10-12')).toEqual({ total: 1, count: 1 });
    expect(stats.get('gym')!.get('2026-10-14')).toEqual({ total: 1, count: 2 });
  });
  it('leaves other metrics summed', () => {
    expect(stats.get('study')!.get('2026-10-14')).toEqual({ total: 1800, count: 1 });
  });
  it('without metric types, totals are plain sums', () => {
    expect(buildDayStats(entries).get('gym')!.get('2026-10-14')!.total).toBe(2);
  });
  it('streaks count done due days, keeping history from before the switch', () => {
    const gym = { target: 1, targetDirection: 'at_least' as const, schedule: { kind: 'days_of_week' as const, days: [1, 3, 5] } };
    // Mon 12 and Wed 14 done; Fri 16 is today and still open.
    expect(computeStreaks(gym, stats.get('gym')!, '2026-10-16')).toEqual({ current: 2, longest: 2 });
  });
});

describe('formatting', () => {
  const check: Pick<Metric, 'type' | 'unit' | 'target' | 'targetDirection' | 'targetMin'> = { type: 'check', unit: 'days', target: 1, targetDirection: 'at_least' };
  it('check-off values read as days done', () => {
    expect(formatValue(check, 1)).toBe('1 day');
    expect(formatValue(check, 4)).toBe('4 days');
    expect(formatValueParts(check, 4)).toEqual({ num: '4', unit: 'days' });
    expect(formatTarget(check)).toBe('check off');
  });
  it('ranges show both ends with one unit', () => {
    expect(formatTarget({ type: 'count', unit: 'kcal', target: 2200, targetMin: 1800, targetDirection: 'between' })).toBe('1,800–2,200 kcal');
    expect(formatTarget({ type: 'duration', unit: 'min', target: 9 * 3600, targetMin: 7 * 3600, targetDirection: 'between' })).toBe('7h–9h');
    expect(formatTarget({ type: 'count', unit: 'kcal', target: 2000, targetDirection: 'at_most' })).toBe('at most 2,000 kcal');
    expect(formatTarget({ type: 'count', unit: 'kcal', target: null, targetDirection: 'at_least' })).toBe(null);
  });
});

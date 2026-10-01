import { describe, expect, it } from 'vitest';
import { computeStreaks, hitRate, isHit, isScheduled } from './streaks';
import type { DayStats, Metric } from './types';

type M = Pick<Metric, 'target' | 'targetDirection' | 'schedule'>;

const daily = (target: number | null, dir: 'at_least' | 'at_most' = 'at_least'): M => ({
  target,
  targetDirection: dir,
  schedule: { kind: 'daily' },
});

// 2026-09-28 is a Monday.
const gym: M = { target: 3600, targetDirection: 'at_least', schedule: { kind: 'days_of_week', days: [1, 3, 5] } };

function stats(days: Record<string, number | [number, number]>): DayStats {
  const m: DayStats = new Map();
  for (const [d, v] of Object.entries(days)) {
    const [total, count] = Array.isArray(v) ? v : [v, 1];
    m.set(d, { total, count });
  }
  return m;
}

describe('isScheduled', () => {
  it('daily is always scheduled', () => {
    expect(isScheduled({ kind: 'daily' }, '2026-09-27')).toBe(true);
  });
  it('days_of_week matches weekday, 0 = Sunday', () => {
    expect(isScheduled(gym.schedule, '2026-09-28')).toBe(true); // Mon
    expect(isScheduled(gym.schedule, '2026-09-29')).toBe(false); // Tue
    expect(isScheduled(gym.schedule, '2026-09-27')).toBe(false); // Sun
  });
});

describe('isHit', () => {
  it('at_least compares total to target', () => {
    expect(isHit(daily(100), 100, 1)).toBe(true);
    expect(isHit(daily(100), 99, 1)).toBe(false);
  });
  it('at_most requires at least one entry', () => {
    expect(isHit(daily(2000, 'at_most'), 0, 0)).toBe(false);
    expect(isHit(daily(2000, 'at_most'), 1800, 2)).toBe(true);
    expect(isHit(daily(2000, 'at_most'), 2001, 1)).toBe(false);
  });
  it('no target means no verdict', () => {
    expect(isHit(daily(null), 50, 1)).toBeNull();
  });
});

describe('computeStreaks', () => {
  it('returns null without a target', () => {
    expect(computeStreaks(daily(null), stats({ '2026-10-01': 5 }), '2026-10-01')).toBeNull();
  });

  it('is zero with no data', () => {
    expect(computeStreaks(daily(10), new Map(), '2026-10-01')).toEqual({ current: 0, longest: 0 });
  });

  it('includes today when today is a hit', () => {
    const s = stats({ '2026-09-29': 10, '2026-09-30': 10, '2026-10-01': 10 });
    expect(computeStreaks(daily(10), s, '2026-10-01')).toEqual({ current: 3, longest: 3 });
  });

  it('today not yet hit does not break the streak', () => {
    const s = stats({ '2026-09-29': 10, '2026-09-30': 10, '2026-10-01': 3 });
    expect(computeStreaks(daily(10), s, '2026-10-01')).toEqual({ current: 2, longest: 2 });
  });

  it('today with no entries at all does not break the streak', () => {
    const s = stats({ '2026-09-29': 10, '2026-09-30': 10 });
    expect(computeStreaks(daily(10), s, '2026-10-01')?.current).toBe(2);
  });

  it('a missed yesterday breaks it', () => {
    const s = stats({ '2026-09-28': 10, '2026-09-29': 10, '2026-10-01': 10 });
    expect(computeStreaks(daily(10), s, '2026-10-01')).toEqual({ current: 1, longest: 2 });
  });

  it('unscheduled days neither break nor extend a gym streak', () => {
    // Mon 28, Wed 30, Fri Oct 2 are gym days; nothing logged Tue/Thu.
    const s = stats({ '2026-09-28': 3600, '2026-09-30': 3600, '2026-10-02': 3600 });
    expect(computeStreaks(gym, s, '2026-10-02')).toEqual({ current: 3, longest: 3 });
  });

  it('a session on an unscheduled day does not extend the streak', () => {
    const s = stats({ '2026-09-28': 3600, '2026-09-29': 3600, '2026-09-30': 3600 });
    expect(computeStreaks(gym, s, '2026-09-30')?.current).toBe(2);
  });

  it('on an unscheduled today, counts back from the last scheduled day', () => {
    const s = stats({ '2026-09-28': 3600, '2026-09-30': 3600 });
    expect(computeStreaks(gym, s, '2026-10-01')?.current).toBe(2); // Thu
  });

  it('a missed scheduled gym day breaks it', () => {
    const s = stats({ '2026-09-25': 3600, '2026-09-30': 3600 }); // Fri, then Mon 28 missed
    expect(computeStreaks(gym, s, '2026-09-30')).toEqual({ current: 1, longest: 1 });
  });

  it('an unlogged day never counts as hitting a calorie ceiling', () => {
    const cal = daily(2000, 'at_most');
    const s = stats({ '2026-09-28': 1800, '2026-09-30': 1900 }); // 29th unlogged
    expect(computeStreaks(cal, s, '2026-09-30')).toEqual({ current: 1, longest: 1 });
  });

  it('over the ceiling breaks the streak', () => {
    const cal = daily(2000, 'at_most');
    const s = stats({ '2026-09-28': 1800, '2026-09-29': 2500, '2026-09-30': 1900 });
    expect(computeStreaks(cal, s, '2026-09-30')?.current).toBe(1);
  });

  it('calorie streak: today unlogged reads as continuing', () => {
    const cal = daily(2000, 'at_most');
    const s = stats({ '2026-09-29': 1800, '2026-09-30': 1900 });
    expect(computeStreaks(cal, s, '2026-10-01')?.current).toBe(2);
  });

  it('calorie streak: today already over the ceiling still does not break it', () => {
    // Over the ceiling is a miss for the day, but the day isn't over; counting
    // starts from yesterday per §9.
    const cal = daily(2000, 'at_most');
    const s = stats({ '2026-09-29': 1800, '2026-09-30': 1900, '2026-10-01': 2600 });
    expect(computeStreaks(cal, s, '2026-10-01')?.current).toBe(2);
  });

  it('finds the longest run over history', () => {
    const s = stats({
      '2026-09-01': 10, '2026-09-02': 10, '2026-09-03': 10, '2026-09-04': 10,
      '2026-09-06': 10, '2026-09-07': 10,
    });
    expect(computeStreaks(daily(10), s, '2026-09-07')).toEqual({ current: 2, longest: 4 });
  });

  it('ignores entries dated after today', () => {
    const s = stats({ '2026-09-30': 10, '2026-10-05': 10 });
    expect(computeStreaks(daily(10), s, '2026-09-30')?.current).toBe(1);
  });
});

describe('hitRate', () => {
  it('excludes today until it is a hit', () => {
    const s = stats({ '2026-09-29': 10, '2026-09-30': 3 });
    expect(hitRate(daily(10), s, '2026-09-29', '2026-10-01')).toEqual({ hits: 1, scheduled: 2 });
  });
  it('counts only scheduled days', () => {
    const s = stats({ '2026-09-28': 3600, '2026-09-29': 3600 });
    // Mon hit, Tue unscheduled, Wed missed, Thu (today) unscheduled.
    expect(hitRate(gym, s, '2026-09-28', '2026-10-01')).toEqual({ hits: 1, scheduled: 2 });
  });
});

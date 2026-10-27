import { describe, expect, it } from 'vitest';
import { changeTarget, targetOn, targetPeriods } from './targets';
import { computeStreaks, hitRate, isHitOn } from './streaks';
import { shareMetric } from './compete';
import type { DayStats, Metric } from './types';

const H = 3600;
const MIN = 60;

const base = (over: Partial<Metric> = {}) => ({ target: 90 * MIN, targetDirection: 'at_least' as const, targetMin: null, schedule: { kind: 'daily' as const }, ...over });
const stats = (days: Record<string, number>): DayStats => new Map(Object.entries(days).map(([d, t]) => [d, { total: t, count: 1 }]));
const at = (target: number) => ({ target, targetDirection: 'at_least' as const, targetMin: null });

// Network+ 2h from the 1st, 30 min from the 8th, CCNA 1h30 from the 15th.
function malek() {
  let m = base({ target: 2 * H });
  m = { ...m, ...changeTarget(m, at(30 * MIN), '2026-10-08', '2026-10-01') };
  m = { ...m, ...changeTarget(m, at(90 * MIN), '2026-10-15', '2026-10-01') };
  return m;
}

describe('targetOn', () => {
  it('with no history the current target applies to every day', () => {
    expect(targetOn(base(), '2020-01-01').target).toBe(90 * MIN);
  });
  it('each day gets the target that was in force on it', () => {
    const m = malek();
    expect(targetOn(m, '2026-10-01').target).toBe(2 * H);
    expect(targetOn(m, '2026-10-07').target).toBe(2 * H);
    expect(targetOn(m, '2026-10-08').target).toBe(30 * MIN);
    expect(targetOn(m, '2026-10-14').target).toBe(30 * MIN);
    expect(targetOn(m, '2026-10-15').target).toBe(90 * MIN);
    expect(targetOn(m, '2026-11-01').target).toBe(90 * MIN);
  });
  it('the metric itself carries the latest target', () => {
    expect(malek().target).toBe(90 * MIN);
    expect(malek().targetFrom).toBe('2026-10-15');
  });
});

describe('changeTarget', () => {
  it('changing from the metric’s first day replaces the target outright', () => {
    const r = changeTarget(base(), at(H), '2026-10-01', '2026-10-01');
    expect(r).toMatchObject({ target: H, targetHistory: [], targetFrom: null });
  });
  it('a change on a day replaces versions that started on or after it', () => {
    const m = malek();
    const r = changeTarget(m, at(45 * MIN), '2026-10-08', '2026-10-01');
    expect(targetPeriods({ ...m, ...r }).map((p) => [p.from, p.target])).toEqual([[null, 2 * H], ['2026-10-08', 45 * MIN]]);
  });
  it('a change dated earlier drops the later versions, keeping what came before', () => {
    const r = changeTarget(malek(), at(H), '2026-10-04', '2026-10-01');
    expect(r.targetHistory!.map((v) => v.target)).toEqual([2 * H]);
    expect(r.targetFrom).toBe('2026-10-04');
  });
  it('setting the target already in force adds no version', () => {
    const r = changeTarget(malek(), at(90 * MIN), '2026-10-20', '2026-10-01');
    expect(r.targetHistory).toHaveLength(2);
    expect(r.targetFrom).toBe('2026-10-15');
  });
  it('can switch a day-by-day target to a range and back', () => {
    const m = base({ target: 4 * H });
    const r = changeTarget(m, { target: 4 * H, targetDirection: 'between', targetMin: H }, '2026-10-10', '2026-10-01');
    expect(targetOn({ ...m, ...r }, '2026-10-09').targetDirection).toBe('at_least');
    expect(targetOn({ ...m, ...r }, '2026-10-10')).toMatchObject({ targetDirection: 'between', targetMin: H });
  });
});

describe('past days keep their target', () => {
  const m = malek();
  // 30 minutes every day from the 8th to the 14th: each a success under the 30-minute target.
  const s = stats({ '2026-10-08': 30 * MIN, '2026-10-09': 30 * MIN, '2026-10-10': 30 * MIN, '2026-10-11': 30 * MIN, '2026-10-12': 30 * MIN, '2026-10-13': 30 * MIN, '2026-10-14': 30 * MIN });

  it('a day is judged against its own target', () => {
    expect(isHitOn(m, '2026-10-10', 30 * MIN, 1)).toBe(true);
    expect(isHitOn(m, '2026-10-16', 30 * MIN, 1)).toBe(false);
    expect(isHitOn(m, '2026-10-03', 90 * MIN, 1)).toBe(false);
  });
  it('raising the target later doesn’t break the streak the earlier target earned', () => {
    expect(computeStreaks(m, s, '2026-10-14', 1)).toEqual({ current: 7, longest: 7 });
    // Without history, the same data judged by today's 1h30 target is all misses.
    expect(computeStreaks(base(), s, '2026-10-14', 1)).toEqual({ current: 0, longest: 0 });
  });
  it('the hit rate counts each day against its own target', () => {
    expect(hitRate(m, s, '2026-10-08', '2026-10-14', 1)).toEqual({ hits: 7, scheduled: 7 });
  });
  it('the Compete summary marks old days by the target they had', () => {
    const shared = shareMetric({ ...m, id: 'x', name: 'x', type: 'duration', unit: 'min', timerEnabled: true, quickAdd: [], color: '', icon: '', order: 0, archivedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '' } as Metric, s, '2026-10-08', '2026-10-14', 1);
    expect(Object.values(shared.days).every((d) => d.s === 'h')).toBe(true);
  });
});

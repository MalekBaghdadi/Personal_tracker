import { describe, expect, it } from 'vitest';
import { reviewWeek, weekStartOf } from './review';
import type { DayStats, Goal, Metric } from './types';

// 2026-09-28 is a Monday; the reviewed week is Mon 28 Sep – Sun 4 Oct.
const START = '2026-09-28';

function metric(id: string, over: Partial<Metric> = {}): Metric {
  return {
    id, name: id, type: 'duration', unit: '', target: 3600, targetDirection: 'at_least', schedule: { kind: 'daily' },
    timerEnabled: true, quickAdd: [], color: '#fff', icon: 'book', order: 0, archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over,
  };
}

function stats(days: Record<string, number>): DayStats {
  return new Map(Object.entries(days).map(([d, total]) => [d, { total, count: 1 }]));
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g', metricId: 'study', name: 'G', nameEdited: false, targetTotal: 100 * 3600, priorProgress: 0,
    startDate: '2026-09-01', deadline: '2026-12-15', paceSchedule: { kind: 'daily' }, archivedAt: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...over,
  };
}

const created = (ids: string[], on = '2026-01-01') => new Map(ids.map((id) => [id, on]));

describe('weekStartOf', () => {
  it('Monday weeks', () => {
    expect(weekStartOf('2026-10-04', 1)).toBe('2026-09-28'); // Sun → previous Mon
    expect(weekStartOf('2026-09-28', 1)).toBe('2026-09-28');
    expect(weekStartOf('2026-10-06', 1)).toBe('2026-10-05');
  });
  it('Sunday weeks', () => {
    expect(weekStartOf('2026-10-04', 0)).toBe('2026-10-04');
    expect(weekStartOf('2026-10-03', 0)).toBe('2026-09-27');
  });
});

describe('reviewWeek', () => {
  it('totals, target days, best day and the week before', () => {
    const m = metric('study');
    const s = stats({ '2026-09-21': 1800, '2026-09-28': 3600, '2026-09-30': 7800, '2026-10-01': 1200, '2026-10-05': 9999 });
    const r = reviewWeek(START, [m], new Map([['study', s]]), [], created(['study']));
    expect(r.end).toBe('2026-10-04');
    expect(r.any).toBe(true);
    const w = r.metrics[0];
    expect(w.total).toBe(3600 + 7800 + 1200);
    expect(w.hits).toBe(2);
    expect(w.scheduled).toBe(7);
    expect(w.best).toEqual({ date: '2026-09-30', total: 7800 });
    expect(w.previousTotal).toBe(1800);
    expect(w.loggedDays).toBe(3);
  });

  it('only counts scheduled days, from the day the metric was created', () => {
    const gym = metric('gym', { schedule: { kind: 'days_of_week', days: [1, 3, 5] } });
    const s = stats({ '2026-10-02': 3600 });
    const r = reviewWeek(START, [gym], new Map([['gym', s]]), [], created(['gym'], '2026-09-30'));
    expect(r.metrics[0].scheduled).toBe(2); // Wed and Fri, not Mon
    expect(r.metrics[0].hits).toBe(1);
  });

  it('no target: no hit counts; ceilings: no best day', () => {
    const r = reviewWeek(
      START,
      [metric('read', { target: null }), metric('kcal', { type: 'count', targetDirection: 'at_most', target: 2000 })],
      new Map([['read', stats({ '2026-09-29': 600 })], ['kcal', stats({ '2026-09-29': 1800, '2026-09-30': 2500 })]]),
      [],
      created(['read', 'kcal']),
    );
    expect(r.metrics[0].hits).toBeNull();
    expect(r.metrics[0].best).not.toBeNull();
    expect(r.metrics[1].hits).toBe(1); // 1800 under, 2500 over, unlogged days aren't hits
    expect(r.metrics[1].best).toBeNull();
  });

  it('skips metrics created after the week and archived ones with nothing logged', () => {
    const r = reviewWeek(
      START,
      [metric('new'), metric('old', { archivedAt: '2026-09-01T00:00:00Z' })],
      new Map(),
      [],
      new Map([['new', '2026-10-05'], ['old', '2026-01-01']]),
    );
    expect(r.metrics).toEqual([]);
    expect(r.any).toBe(false);
  });

  it('goal gain is clipped to the goal window; archived and out-of-range goals are left out', () => {
    const s = stats({ '2026-09-28': 3600, '2026-10-01': 1800, '2026-10-03': 900 });
    const r = reviewWeek(
      START,
      [metric('study')],
      new Map([['study', s]]),
      [
        goal({ id: 'a', startDate: '2026-09-30' }),
        goal({ id: 'b', archivedAt: '2026-09-29T00:00:00Z' }),
        goal({ id: 'c', deadline: '2026-09-20' }),
        goal({ id: 'd', deadline: '2026-10-02' }),
      ],
      created(['study']),
    );
    expect(r.goals.map((g) => [g.goal.id, g.gained])).toEqual([['a', 2700], ['d', 5400]]);
  });
});

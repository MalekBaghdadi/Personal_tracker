import { describe, expect, it } from 'vitest';
import { ceilToMinute, computeGoal, countPaceDays, validateGoal } from './goals';
import type { Goal } from './types';

// Dates are real: 1 October 2026 is a Thursday.
const H = 3600;
const M = 60;

type G = Parameters<typeof computeGoal>[0];
const goal = (g: Partial<G>): G => ({
  metricId: 'm1',
  targetTotal: 10 * H,
  priorProgress: 0,
  startDate: '2026-10-01',
  deadline: '2026-10-10',
  paceSchedule: { kind: 'daily' },
  ...g,
});
const e = (localDate: string, value: number, extra: Partial<{ metricId: string; deletedAt: string | null }> = {}) => ({
  metricId: 'm1',
  localDate,
  value,
  deletedAt: null,
  ...extra,
});

describe('A — basic behind, daily schedule', () => {
  const g = goal({});
  const entries = [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H), e('2026-10-03', 1 * H), e('2026-10-05', 1 * H)];
  const r = computeGoal(g, entries, '2026-10-06');

  it('pace figures', () => {
    expect(r.totalPaceDays).toBe(10);
    expect(r.idealPerDay).toBe(1 * H);
    expect(r.paceDaysBeforeToday).toBe(5);
    expect(r.expectedByNow).toBe(5 * H);
    expect(r.delta).toBe(-1 * H);
    expect(r.tolerance).toBe(30 * M);
  });
  it('is behind by 1h', () => expect(r.status).toBe('behind'));
  it('required pace 6h / 5 = 1h 12m', () => {
    expect(r.paceDaysLeft).toBe(5);
    expect(r.requiredPerDay).toBe(72 * M);
    expect(r.neededToday).toBe(72 * M);
  });
});

describe('B — same as A plus 1h logged today', () => {
  const entries = [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H), e('2026-10-03', 1 * H), e('2026-10-05', 1 * H), e('2026-10-06', 1 * H)];
  const r = computeGoal(goal({}), entries, '2026-10-06');
  it('is on track', () => {
    expect(r.done).toBe(5 * H);
    expect(r.delta).toBe(0);
    expect(r.status).toBe('on_track');
  });
  it('required pace stays fixed for the day; today needs 12m more', () => {
    expect(r.requiredPerDay).toBe(72 * M);
    expect(r.neededToday).toBe(12 * M);
  });
});

describe('C — non-pace day', () => {
  // Mon 5, Wed 7, Fri 9, Mon 12, Wed 14, Fri 16 Oct.
  const g = goal({ targetTotal: 6 * H, startDate: '2026-10-05', deadline: '2026-10-16', paceSchedule: { kind: 'days_of_week', days: [1, 3, 5] } });
  const r = computeGoal(g, [e('2026-10-05', 1 * H), e('2026-10-07', 1 * H)], '2026-10-08');
  it('six pace days, 1h ideal', () => {
    expect(r.totalPaceDays).toBe(6);
    expect(r.idealPerDay).toBe(1 * H);
  });
  it('on track with 2 pace days behind it', () => {
    expect(r.paceDaysBeforeToday).toBe(2);
    expect(r.expectedByNow).toBe(2 * H);
    expect(r.status).toBe('on_track');
  });
  it('nothing needed today; next pace day is Fri 9 Oct', () => {
    expect(r.todayIsPaceDay).toBe(false);
    expect(r.neededToday).toBe(0);
    expect(r.nextPaceDay).toBe('2026-10-09');
    expect(r.paceDaysLeft).toBe(4);
    expect(r.requiredPerDay).toBe(1 * H);
  });
});

describe('D — prior progress', () => {
  const g = goal({ targetTotal: 120 * H, priorProgress: 20 * H, startDate: '2026-10-03', deadline: '2026-12-15' });
  const r = computeGoal(g, [], '2026-10-03');
  it('74 pace days, ideal ≈ 1h 21m', () => {
    expect(r.totalPaceDays).toBe(74);
    expect(r.idealPerDay).toBeCloseTo((100 * H) / 74, 6);
    expect(Math.round(r.idealPerDay / M)).toBe(81);
  });
  it('on track on the start date', () => {
    expect(r.expectedByNow).toBe(20 * H);
    expect(r.done).toBe(20 * H);
    expect(r.status).toBe('on_track');
  });
});

describe('E — entries outside the range', () => {
  it('excludes entries before the start, after the deadline, deleted, or for another metric', () => {
    const entries = [
      e('2026-09-30', 5 * H),
      e('2026-10-11', 5 * H),
      e('2026-10-02', 5 * H, { deletedAt: '2026-10-02T10:00:00Z' }),
      e('2026-10-02', 5 * H, { metricId: 'other' }),
      e('2026-10-02', 2 * H),
    ];
    expect(computeGoal(goal({}), entries, '2026-10-04').done).toBe(2 * H);
  });
});

describe('F — achieved early', () => {
  const entries = [e('2026-10-01', 4 * H), e('2026-10-02', 4 * H), e('2026-10-03', 3 * H), e('2026-10-04', 1 * H)];
  it('achieved, dated the day the total crossed the target', () => {
    const r = computeGoal(goal({}), entries, '2026-10-05');
    expect(r.status).toBe('achieved');
    expect(r.achievedDate).toBe('2026-10-03');
  });
  it('stays achieved after the deadline', () => {
    expect(computeGoal(goal({}), entries, '2026-10-20').status).toBe('achieved');
  });
  it('prior progress alone meeting the target dates it to the start', () => {
    const r = computeGoal(goal({ priorProgress: 12 * H }), [], '2026-10-04');
    expect(r.status).toBe('achieved');
    expect(r.achievedDate).toBe('2026-10-01');
  });
});

describe('G — missed', () => {
  it('missed after the deadline, no required pace', () => {
    const r = computeGoal(goal({}), [e('2026-10-02', 3 * H)], '2026-10-11');
    expect(r.status).toBe('missed');
    expect(r.requiredPerDay).toBeNull();
    expect(r.remaining).toBe(7 * H);
    expect(r.daysLeft).toBe(0);
  });
});

describe('H — not started', () => {
  it('before the start date, expected position is the prior progress', () => {
    const r = computeGoal(goal({ priorProgress: 2 * H }), [], '2026-09-28');
    expect(r.status).toBe('not_started');
    expect(r.expectedByNow).toBe(2 * H);
    expect(r.nextPaceDay).toBe('2026-10-01');
  });
});

describe('I — no days left', () => {
  it('no pace days from today on, deadline not passed', () => {
    // Pace on Mondays only; the range ends on Friday 9 Oct; today is Tue 6 Oct.
    const g = goal({ startDate: '2026-10-05', deadline: '2026-10-09', paceSchedule: { kind: 'days_of_week', days: [1] } });
    const r = computeGoal(g, [e('2026-10-05', 1 * H)], '2026-10-06');
    expect(r.paceDaysLeft).toBe(0);
    expect(r.status).toBe('no_days_left');
    expect(r.requiredPerDay).toBeNull();
    expect(r.neededToday).toBe(0);
  });
});

describe('J — deadline day', () => {
  it('required pace is everything left', () => {
    const r = computeGoal(goal({}), [e('2026-10-05', 6 * H)], '2026-10-10');
    expect(r.paceDaysLeft).toBe(1);
    expect(r.requiredPerDay).toBe(4 * H);
    expect(r.daysLeft).toBe(1);
  });
});

describe('K — projection threshold', () => {
  it('fewer than 3 pace days in the window: no projection', () => {
    const r = computeGoal(goal({}), [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H)], '2026-10-03');
    expect(r.projection.kind).toBe('insufficient');
  });
  it('3 or more: projection shown', () => {
    // 3h over 3 pace days → 1h/day; 7 pace days after today → 10h total: finishes on the deadline.
    const r = computeGoal(goal({}), [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H), e('2026-10-03', 1 * H)], '2026-10-04');
    expect(r.recentRate).toBe(1 * H);
    expect(r.projection).toEqual({ kind: 'finishes', projectedTotal: 10 * H, finishDate: '2026-10-10' });
  });
  it('projects a shortfall when the recent rate is too slow', () => {
    const r = computeGoal(goal({}), [e('2026-10-01', 30 * M), e('2026-10-02', 30 * M), e('2026-10-03', 30 * M)], '2026-10-04');
    expect(r.projection).toEqual({ kind: 'short', projectedTotal: 5 * H, shortfall: 5 * H });
  });
  it('no recent activity', () => {
    const r = computeGoal(goal({}), [], '2026-10-05');
    expect(r.projection.kind).toBe('no_recent');
  });
  it('finishes early when the recent rate is fast', () => {
    const r = computeGoal(goal({}), [e('2026-10-01', 2 * H), e('2026-10-02', 2 * H), e('2026-10-03', 2 * H)], '2026-10-04');
    // done 6h after 3 days; 2h/day: 8h by end of today, 10h on the 5th.
    expect(r.projection).toMatchObject({ kind: 'finishes', finishDate: '2026-10-05' });
  });
  it('exactly on ideal pace in the morning projects finishing on time, not short', () => {
    // The case the addendum's literal formula gets wrong: on track, nothing logged yet today.
    const r = computeGoal(goal({}), [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H), e('2026-10-03', 1 * H)], '2026-10-04');
    expect(r.status).toBe('on_track');
    expect(r.projection.kind).toBe('finishes');
  });
  it("doesn't count today's logged work twice", () => {
    // Same history plus today's 1h already logged: still 10h at the deadline.
    const r = computeGoal(goal({}), [e('2026-10-01', 1 * H), e('2026-10-02', 1 * H), e('2026-10-03', 1 * H), e('2026-10-04', 1 * H)], '2026-10-04');
    expect(r.projection).toEqual({ kind: 'finishes', projectedTotal: 10 * H, finishDate: '2026-10-10' });
  });
});

describe('L — validation', () => {
  it('rejects a deadline before the start', () => {
    expect(validateGoal(goal({ deadline: '2026-09-30' })).deadline).toBeTruthy();
  });
  it('rejects a schedule with no pace days in range', () => {
    const g = goal({ startDate: '2026-10-06', deadline: '2026-10-08', paceSchedule: { kind: 'days_of_week', days: [0, 6] } });
    expect(countPaceDays(g, g.startDate, g.deadline)).toBe(0);
    expect(validateGoal(g).schedule).toBeTruthy();
  });
  it('accepts a valid goal', () => {
    expect(validateGoal(goal({}))).toEqual({});
  });
});

describe('overload and display rounding', () => {
  it('flags a required pace above twice the ideal while behind', () => {
    // 10h over 10 days; nothing done by day 8 → 10h over 3 days.
    const r = computeGoal(goal({}), [], '2026-10-08');
    expect(r.status).toBe('behind');
    expect(r.overloaded).toBe(true);
  });
  it('rounds pace up to the minute', () => {
    expect(ceilToMinute(81 * M + 5)).toBe(82 * M);
    expect(ceilToMinute(81 * M)).toBe(81 * M);
  });
});

// Compile-time check that the test inputs line up with the stored shape.
const _shape: G = {} as Pick<Goal, keyof G>;
void _shape;

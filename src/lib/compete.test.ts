import { describe, expect, it } from 'vitest';
import { canJoin, challengeDays, challengeResult, challengeSpan, combine, counts, everSideMetricIds, sideMetricIds, teamOf, logInWindow, newInviteCode, shareLogs, normalizeCode, race, shareMetric, sideFor, weekOutcome, type Challenge, type Link, type LinkMember, type SharedDay, type SharedLog, type SharedMetric } from './compete';
import type { DayStats, Entry, Metric } from './types';

// 2026-10-05 is a Monday.
const H = 3600;

function metric(over: Partial<Metric> = {}): Metric {
  return {
    id: 'm1', name: 'Studying', type: 'duration', unit: 'h', target: H, targetDirection: 'at_least',
    schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [], color: '#5b8def', icon: 'book',
    order: 0, archivedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over,
  };
}

function stats(days: Record<string, number>): DayStats {
  return new Map(Object.entries(days).map(([d, t]) => [d, { total: t, count: 1 }]));
}

function shared(days: Record<string, SharedDay | number>, target: number | null = H): SharedMetric {
  const out: Record<string, SharedDay> = {};
  for (const [d, v] of Object.entries(days)) out[d] = typeof v === 'number' ? { t: v, s: target == null ? 'n' : v >= target ? 'h' : 'd' } : v;
  return { name: 'Studying', type: 'duration', unit: 'h', target, color: '#000', icon: 'book', days: out };
}

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1', linkId: 'l1', kind: 'most_total', amount: null, startDate: '2026-10-05', endDate: '2026-10-11',
    createdBy: 'a', createdAt: '2026-10-04T10:00:00Z', acceptedAt: '2026-10-04T11:00:00Z', declinedAt: null, cancelledAt: null, ...over,
  };
}

describe('shareMetric', () => {
  it('marks hits, misses, off days and rest days, and leaves empty off days out', () => {
    const gym = metric({ schedule: { kind: 'days_of_week', days: [1, 2, 3, 4, 5] }, restDaysPerWeek: 1 });
    const s = shareMetric(gym, stats({ '2026-10-05': H, '2026-10-07': H, '2026-10-11': 600 }), '2026-10-05', '2026-10-11', 1);
    expect(s.days['2026-10-05']).toEqual({ t: H, s: 'h' });
    expect(s.days['2026-10-06']).toEqual({ t: 0, s: 'r' }); // first miss of the week uses the rest day
    expect(s.days['2026-10-08']).toEqual({ t: 0, s: 'd' });
    expect(s.days['2026-10-10']).toBeUndefined(); // Saturday, nothing logged
    expect(s.days['2026-10-11']).toEqual({ t: 600, s: 'o' }); // logged on an off day still counts toward the total
  });
  it('days before the metric existed are not due', () => {
    const s = shareMetric(metric(), stats({ '2026-10-08': H }), '2026-10-05', '2026-10-09', 1, '2026-10-08');
    expect(s.days['2026-10-06']).toBeUndefined();
    expect(s.days['2026-10-08']).toEqual({ t: H, s: 'h' });
    expect(s.days['2026-10-09']).toEqual({ t: 0, s: 'd' });
  });
  it('a metric with no target only publishes totals', () => {
    const s = shareMetric(metric({ target: null }), stats({ '2026-10-05': 900 }), '2026-10-05', '2026-10-06', 1);
    expect(s.days).toEqual({ '2026-10-05': { t: 900, s: 'n' } });
  });
});

describe('sideFor', () => {
  const m = shared({ '2026-10-05': H, '2026-10-06': 1800, '2026-10-07': 0 });
  it('sums the range and counts due days, leaving the open current day out', () => {
    expect(sideFor(m, '2026-10-05', '2026-10-11', '2026-10-07')).toEqual({ total: H + 1800, hits: 1, due: 2, hasTarget: true });
    expect(sideFor(m, '2026-10-05', '2026-10-11', '2026-10-08')).toEqual({ total: H + 1800, hits: 1, due: 3, hasTarget: true });
  });
  it('rest days are not due days', () => {
    const r = shared({ '2026-10-05': { t: 0, s: 'r' }, '2026-10-06': H });
    expect(sideFor(r, '2026-10-05', '2026-10-06', '2026-10-09')).toMatchObject({ hits: 1, due: 1 });
  });
  it('nothing published is all zeros', () => {
    expect(sideFor(undefined, '2026-10-05', '2026-10-11', '2026-10-11')).toEqual({ total: 0, hits: 0, due: 0, hasTarget: false });
  });
});

describe('weekOutcome', () => {
  const s = (total: number, hits: number) => ({ total, hits, due: 5, hasTarget: true });
  it('higher total wins, then more target days, then a draw', () => {
    expect(weekOutcome(s(10, 1), s(9, 5))).toBe('me');
    expect(weekOutcome(s(9, 1), s(10, 0))).toBe('them');
    expect(weekOutcome(s(10, 3), s(10, 2))).toBe('me');
    expect(weekOutcome(s(10, 2), s(10, 2))).toBe('draw');
  });
});

describe('race', () => {
  const mine = shared({ '2026-09-29': 2 * H, '2026-10-06': H, '2026-10-13': 1800 });
  const theirs = shared({ '2026-09-30': H, '2026-10-07': 3 * H, '2026-10-12': H });

  it('tallies finished weeks from the start week and keeps this week open', () => {
    const r = race(mine, theirs, '2026-09-30', '2026-10-14', '2026-10-14', 1);
    expect(r.past.map((w) => [w.start, w.outcome])).toEqual([['2026-10-05', 'them'], ['2026-09-28', 'me']]);
    expect([r.wins, r.losses, r.draws]).toEqual([1, 1, 0]);
    expect(r.current.start).toBe('2026-10-12');
    expect(r.current.outcome).toBeNull();
    expect(r.current.me.total).toBe(1800);
    expect(r.current.them.total).toBe(H);
  });
  it('a finished week waits for their numbers past its end', () => {
    const r = race(mine, theirs, '2026-10-05', '2026-10-14', '2026-10-11', 1);
    expect(r.past[0].outcome).toBeNull();
    expect(r.wins + r.losses + r.draws).toBe(0);
  });
  it('weeks follow the pair’s week start', () => {
    const r = race(mine, theirs, '2026-10-05', '2026-10-14', '2026-10-14', 0);
    expect(r.current.start).toBe('2026-10-11');
  });
});

describe('challengeResult', () => {
  it('pending, declined, cancelled and upcoming come first', () => {
    expect(challengeResult(challenge({ acceptedAt: null }), undefined, undefined, '2026-10-06', null).status).toBe('pending');
    expect(challengeResult(challenge({ declinedAt: 'x' }), undefined, undefined, '2026-10-06', null).status).toBe('declined');
    expect(challengeResult(challenge({ cancelledAt: 'x' }), undefined, undefined, '2026-10-06', null).status).toBe('cancelled');
    expect(challengeResult(challenge(), undefined, undefined, '2026-10-04', null).status).toBe('upcoming');
  });

  describe('most_total', () => {
    const mine = shared({ '2026-10-04': 9 * H, '2026-10-05': 2 * H, '2026-10-11': H });
    const theirs = shared({ '2026-10-06': 2 * H, '2026-10-12': 5 * H });
    it('counts only the period and is active until it ends', () => {
      const r = challengeResult(challenge(), mine, theirs, '2026-10-08', '2026-10-08');
      expect(r.status).toBe('active');
      expect([r.me, r.them]).toEqual([2 * H, 2 * H]);
    });
    it('waits for their numbers past the end, then the higher total wins', () => {
      expect(challengeResult(challenge(), mine, theirs, '2026-10-13', '2026-10-11').status).toBe('awaiting');
      const r = challengeResult(challenge(), mine, theirs, '2026-10-13', '2026-10-12');
      expect(r.status).toBe('finished');
      expect(r.winner).toBe('me');
      expect([r.me, r.them]).toEqual([3 * H, 2 * H]);
    });
  });

  describe('most_days', () => {
    it('counts target days, and a tie is a draw', () => {
      const ch = challenge({ kind: 'most_days' });
      const mine = shared({ '2026-10-05': H, '2026-10-06': 10 * H });
      const theirs = shared({ '2026-10-07': H, '2026-10-08': H, '2026-10-09': 60 });
      const r = challengeResult(ch, mine, theirs, '2026-10-12', '2026-10-12');
      expect([r.me, r.them, r.winner]).toEqual([2, 2, 'draw']);
    });
  });

  describe('first_to', () => {
    const ch = challenge({ kind: 'first_to', amount: 5 * H, endDate: '2026-10-31' });
    it('the earlier day to reach the amount wins, before the end date', () => {
      const mine = shared({ '2026-10-05': 3 * H, '2026-10-07': 2 * H });
      const theirs = shared({ '2026-10-05': 4 * H, '2026-10-08': 4 * H });
      const r = challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10');
      expect(r.status).toBe('finished');
      expect(r.winner).toBe('me');
      expect(r.reached).toEqual({ me: '2026-10-07', them: '2026-10-08' });
    });
    it('my reaching it waits for their numbers for that day', () => {
      const mine = shared({ '2026-10-07': 5 * H });
      const theirs = shared({ '2026-10-06': H });
      expect(challengeResult(ch, mine, theirs, '2026-10-08', '2026-10-07').status).toBe('active');
      expect(challengeResult(ch, mine, theirs, '2026-10-08', '2026-10-08').winner).toBe('me');
    });
    it('reaching it today stays open, since the other side can still get there today', () => {
      const theirs = shared({ '2026-10-08': 5 * H });
      const r = challengeResult(ch, shared({}), theirs, '2026-10-08', '2026-10-08');
      expect(r.status).toBe('active');
      expect(r.reached.them).toBe('2026-10-08');
      expect(challengeResult(ch, shared({}), theirs, '2026-10-09', '2026-10-08').winner).toBe('them');
    });
    it('the same day goes to the higher total that day', () => {
      const mine = shared({ '2026-10-06': 6 * H });
      const theirs = shared({ '2026-10-06': 7 * H });
      expect(challengeResult(ch, mine, theirs, '2026-10-09', '2026-10-09').winner).toBe('them');
    });
    it('if nobody reaches it, the higher total at the end wins', () => {
      const mine = shared({ '2026-10-06': 2 * H });
      const theirs = shared({ '2026-10-20': H });
      expect(challengeResult(ch, mine, theirs, '2026-10-20', '2026-10-20').status).toBe('active');
      expect(challengeResult(ch, mine, theirs, '2026-11-01', '2026-10-31').status).toBe('awaiting');
      const r = challengeResult(ch, mine, theirs, '2026-11-01', '2026-11-01');
      expect([r.status, r.winner]).toEqual(['finished', 'me']);
    });
  });
});

describe('timed challenges', () => {
  // Saturday 18:00 to Sunday 22:00 UTC; tracking days by UTC date for simplicity.
  const timed = (over: Partial<Challenge> = {}) => challenge({
    startDate: '2026-10-10', endDate: '2026-10-11', startAt: '2026-10-10T18:00:00.000Z', endAt: '2026-10-11T22:00:00.000Z', ...over,
  });
  const withLogs = (logs: Record<string, SharedLog[]>): SharedMetric => ({ ...shared({}), logs });
  const timer = (at: string, v: number): SharedLog => ({ v, at, src: 't' });
  const manual = (at: string, v: number): SharedLog => ({ v, at, src: 'm' });

  it('counts a timer only for its part inside the window, anything else if logged inside it', () => {
    const [s, e] = ['2026-10-10T18:00:00.000Z', '2026-10-11T22:00:00.000Z'];
    expect(logInWindow(timer('2026-10-10T17:00:00.000Z', 2 * H), s, e)).toBe(H);
    expect(logInWindow(timer('2026-10-11T21:30:00.000Z', H), s, e)).toBe(H / 2);
    expect(logInWindow(manual('2026-10-10T17:59:00.000Z', H), s, e)).toBe(0);
    expect(logInWindow(manual('2026-10-11T21:59:00.000Z', H), s, e)).toBe(H);
    expect(logInWindow(manual('2026-10-11T22:00:00.000Z', H), s, e)).toBe(0);
  });

  it('most: totals inside the window; upcoming before the start time, settled once they publish past the end', () => {
    const mine = withLogs({ '2026-10-10': [manual('2026-10-10T10:00:00.000Z', 5 * H), timer('2026-10-10T17:00:00.000Z', 2 * H)] });
    const theirs = withLogs({ '2026-10-11': [manual('2026-10-11T12:00:00.000Z', 90 * 60)] });
    const ch = timed();
    expect(challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10', '2026-10-10T17:59:00.000Z').status).toBe('upcoming');
    const live = challengeResult(ch, mine, theirs, '2026-10-11', '2026-10-11', '2026-10-11T12:00:00.000Z', '2026-10-11T12:00:00.000Z');
    expect([live.status, live.me, live.them]).toEqual(['active', H, 90 * 60]);
    expect(challengeResult(ch, mine, theirs, '2026-10-11', '2026-10-11', '2026-10-11T22:30:00.000Z', '2026-10-11T21:00:00.000Z').status).toBe('awaiting');
    const done = challengeResult(ch, mine, theirs, '2026-10-11', '2026-10-11', '2026-10-11T22:30:00.000Z', '2026-10-11T22:10:00.000Z');
    expect([done.status, done.winner]).toEqual(['finished', 'them']);
    // Or once their day has moved past the last day.
    expect(challengeResult(ch, mine, theirs, '2026-10-12', '2026-10-12', '2026-10-12T09:00:00.000Z', '2026-10-11T21:00:00.000Z').status).toBe('finished');
  });

  it('can’t settle until the other side shares logs', () => {
    const r = challengeResult(timed(), withLogs({}), shared({ '2026-10-11': H }), '2026-10-13', '2026-10-13', '2026-10-13T09:00:00.000Z', '2026-10-13T09:00:00.000Z');
    expect(r.status).toBe('awaiting');
  });

  it('first to: the earlier instant wins, reached partway through a timer', () => {
    const ch = timed({ kind: 'first_to', amount: 2 * H });
    // Mine: a 3h timer from 19:00 reaches 2h at 21:00. Theirs: 2h logged by hand at 20:30.
    const mine = withLogs({ '2026-10-10': [timer('2026-10-10T19:00:00.000Z', 3 * H)] });
    const theirs = withLogs({ '2026-10-10': [manual('2026-10-10T20:30:00.000Z', 2 * H)] });
    const r = challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10', '2026-10-10T23:00:00.000Z', '2026-10-10T20:31:00.000Z');
    expect(r.reached).toEqual({ me: '2026-10-10T21:00:00.000Z', them: '2026-10-10T20:30:00.000Z' });
    expect([r.status, r.winner]).toEqual(['finished', 'them']);
  });

  it('first to: my reaching it first settles once they have published after that moment', () => {
    const ch = timed({ kind: 'first_to', amount: 2 * H });
    const mine = withLogs({ '2026-10-10': [manual('2026-10-10T19:00:00.000Z', 2 * H)] });
    const theirs = withLogs({ '2026-10-10': [] });
    expect(challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10', '2026-10-10T20:00:00.000Z', '2026-10-10T18:30:00.000Z').status).toBe('active');
    const r = challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10', '2026-10-10T20:00:00.000Z', '2026-10-10T19:30:00.000Z');
    expect([r.status, r.winner]).toEqual(['finished', 'me']);
  });

  it('most days ignores times and counts whole days', () => {
    const ch = timed({ kind: 'most_days' });
    const r = challengeResult(ch, shared({ '2026-10-10': H, '2026-10-11': H }), shared({ '2026-10-10': H }), '2026-10-13', '2026-10-13');
    expect([r.me, r.them, r.winner]).toEqual([2, 1, 'me']);
  });

  it('ended early: a timed challenge stops at that moment and settles once they publish after it', () => {
    const ch = timed({ endedEarlyAt: '2026-10-10T20:00:00.000Z', endedEarlyOn: '2026-10-10', endedEarlyBy: 'a' });
    const mine = withLogs({ '2026-10-10': [timer('2026-10-10T19:00:00.000Z', 2 * H)] });
    const theirs = withLogs({ '2026-10-10': [manual('2026-10-10T19:30:00.000Z', 30 * 60)], '2026-10-11': [manual('2026-10-11T10:00:00.000Z', 9 * H)] });
    // The screen's clock is behind the moment it was ended: it's still over.
    const waiting = challengeResult(ch, mine, theirs, '2026-10-10', '2026-10-10', '2026-10-10T19:59:00.000Z', '2026-10-10T19:45:00.000Z');
    expect([waiting.status, waiting.me, waiting.them]).toEqual(['awaiting', H, 30 * 60]);
    const r = challengeResult(ch, mine, theirs, '2026-10-11', '2026-10-11', '2026-10-11T12:00:00.000Z', '2026-10-11T12:00:00.000Z');
    expect([r.status, r.winner, r.me, r.them]).toEqual(['finished', 'me', H, 30 * 60]);
    expect(challengeSpan(ch, (iso) => iso.slice(0, 10))).toEqual({ start: '2026-10-10', end: '2026-10-10' });
  });

  it('ended early: a whole-day challenge counts its days’ logs up to that moment', () => {
    const ch = challenge({ endedEarlyAt: '2026-10-07T12:00:00.000Z', endedEarlyOn: '2026-10-07', endedEarlyBy: 'b' });
    // A log from another challenge's day before the start doesn't count.
    const mine = withLogs({ '2026-10-04': [manual('2026-10-04T10:00:00.000Z', 9 * H)], '2026-10-06': [manual('2026-10-06T10:00:00.000Z', H)], '2026-10-07': [timer('2026-10-07T11:00:00.000Z', 2 * H)] });
    const theirs = withLogs({ '2026-10-05': [manual('2026-10-05T10:00:00.000Z', 2 * H)], '2026-10-07': [manual('2026-10-07T13:00:00.000Z', 5 * H)] });
    const r = challengeResult(ch, mine, theirs, '2026-10-07', '2026-10-07', '2026-10-07T14:00:00.000Z', '2026-10-07T13:30:00.000Z');
    expect([r.status, r.me, r.them, r.winner]).toEqual(['finished', 2 * H, 2 * H, 'draw']);
    expect(challengeResult(ch, mine, theirs, '2026-10-07', '2026-10-07', '2026-10-07T14:00:00.000Z', '2026-10-07T11:00:00.000Z').status).toBe('awaiting');
  });

  it('ended early: first to goes to whoever got there before the moment, else the higher total', () => {
    const ch = challenge({ kind: 'first_to', amount: 3 * H, endDate: '2026-10-31', endedEarlyAt: '2026-10-08T12:00:00.000Z', endedEarlyOn: '2026-10-08' });
    const mine = withLogs({ '2026-10-06': [manual('2026-10-06T10:00:00.000Z', 2 * H)] });
    const theirs = withLogs({ '2026-10-07': [manual('2026-10-07T10:00:00.000Z', H)], '2026-10-08': [manual('2026-10-08T13:00:00.000Z', 5 * H)] });
    const r = challengeResult(ch, mine, theirs, '2026-10-08', '2026-10-08', '2026-10-08T12:00:00.000Z', '2026-10-08T14:00:00.000Z');
    expect([r.status, r.winner, r.me, r.them]).toEqual(['finished', 'me', 2 * H, H]);
  });

  it('ended early: most days runs to the end of the day it was ended', () => {
    const ch = challenge({ kind: 'most_days', endedEarlyAt: '2026-10-07T12:00:00.000Z', endedEarlyOn: '2026-10-07' });
    const mine = shared({ '2026-10-05': H, '2026-10-06': H, '2026-10-09': H, '2026-10-10': H });
    const theirs = shared({ '2026-10-05': H, '2026-10-07': H, '2026-10-08': H });
    expect(challengeResult(ch, mine, theirs, '2026-10-07', '2026-10-07').status).toBe('active');
    expect(challengeResult(ch, mine, theirs, '2026-10-08', '2026-10-07').status).toBe('awaiting');
    const r = challengeResult(ch, mine, theirs, '2026-10-08', '2026-10-08');
    expect([r.status, r.me, r.them, r.winner]).toEqual(['finished', 2, 2, 'draw']);
  });

  it('share logs for the tracking days the start and end fall on', () => {
    const dayOf = (iso: string) => iso.slice(0, 10);
    const days = challengeDays([timed({ startAt: '2026-10-09T23:00:00.000Z' })], 'l1', '2026-10-20', dayOf);
    expect([...days].sort()).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });
});

describe('invite codes', () => {
  it('are six unambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
  it('normalise what people type', () => {
    expect(normalizeCode(' abc-d23 ')).toBe('ABCD23');
    expect(normalizeCode('abc')).toBeNull();
  });
});

describe('shared logs', () => {
  it('cover the days of accepted challenges on that link, through today', () => {
    const days = challengeDays([
      challenge({ startDate: '2026-10-05', endDate: '2026-10-20' }),
      challenge({ id: 'c2', startDate: '2026-10-01', endDate: '2026-10-02' }),
      challenge({ id: 'c3', linkId: 'other', startDate: '2026-09-01', endDate: '2026-09-02' }),
      challenge({ id: 'c4', startDate: '2026-09-20', endDate: '2026-09-21', acceptedAt: null }),
      challenge({ id: 'c5', startDate: '2026-09-22', endDate: '2026-09-23', cancelledAt: 'x' }),
    ], 'l1', '2026-10-07', () => 'unused');
    expect([...days].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('list each entry with value, time, source and note, oldest first; empty days stay empty', () => {
    const e = (over: Partial<Entry>): Entry => ({
      id: 'e', metricId: 'm1', localDate: '2026-10-06', value: 600, source: 'manual', note: null,
      occurredAt: '2026-10-06T10:00:00Z', createdAt: '', updatedAt: '', deletedAt: null, ...over,
    });
    const logs = shareLogs([
      e({ occurredAt: '2026-10-06T15:00:00Z', source: 'quick_add', value: 900 }),
      e({ source: 'timer', value: 3000, note: 'Subnetting, chapter 3' }),
      e({ localDate: '2026-10-04' }),
      e({ deletedAt: 'x' }),
    ], new Set(['2026-10-06', '2026-10-07']));
    expect(logs).toEqual({
      '2026-10-06': [
        { v: 3000, at: '2026-10-06T10:00:00Z', src: 't', note: 'Subnetting, chapter 3' },
        { v: 900, at: '2026-10-06T15:00:00Z', src: 'q' },
      ],
      '2026-10-07': [],
    });
    // No undefined fields: Firestore refuses them.
    expect(JSON.stringify(logs)).not.toContain('undefined');
    expect('note' in logs['2026-10-06'][1]).toBe(false);
  });
});

describe('sides with several metrics', () => {
  const study = { ...shared({ '2026-10-12': H, '2026-10-13': 0 }), name: 'Study' };
  const netplus = { ...shared({ '2026-10-06': 2 * H, '2026-10-12': 1800, '2026-10-13': H }), name: 'Network+' };
  const link = (extra: LinkMember[]): Link => ({
    id: 'l1', metrics: { a: 'net', b: 'their' }, type: 'duration', proposedBy: 'a', createdAt: 'x', acceptedAt: 'y', startDate: '2026-09-28', endedAt: null,
    extra: { a: extra },
  });
  const added = (on: string, removedOn: string | null = null): LinkMember => ({
    metricId: 'study', addedOn: on, addedAt: `${on}T12:00:00.000Z`, removedOn, removedAt: removedOn ? `${removedOn}T12:00:00.000Z` : null,
  });
  const metrics = { net: netplus, study };

  it('sums daily totals; a day is a target day if any metric met its target', () => {
    const c = combine([netplus, study])!;
    expect(c.name).toBe('Network+ & Study');
    expect(c.days['2026-10-12']).toEqual({ t: H + 1800, s: 'h' }); // Study met, Network+ didn't
    expect(c.days['2026-10-13']).toEqual({ t: H, s: 'h' });
    expect(c.days['2026-10-06']).toEqual({ t: 2 * H, s: 'h' });
  });
  it('a day with every target missed is a miss; rest beats not due', () => {
    const a = shared({ '2026-10-05': { t: 0, s: 'd' }, '2026-10-06': { t: 0, s: 'r' } });
    const b = shared({ '2026-10-05': { t: 600, s: 'd' }, '2026-10-06': { t: 300, s: 'o' } });
    expect(combine([a, b])!.days).toEqual({ '2026-10-05': { t: 600, s: 'd' }, '2026-10-06': { t: 300, s: 'r' } });
  });
  it('merges logs oldest first, tagged with their metric', () => {
    const a = { ...netplus, logs: { '2026-10-12': [{ v: 1800, at: '2026-10-12T15:00:00Z', src: 'm' as const }] } };
    const b = { ...study, logs: { '2026-10-12': [{ v: H, at: '2026-10-12T09:00:00Z', src: 't' as const }] } };
    expect(combine([a, b])!.logs).toEqual({ '2026-10-12': [
      { v: H, at: '2026-10-12T09:00:00Z', src: 't', m: 'Study' },
      { v: 1800, at: '2026-10-12T15:00:00Z', src: 'm', m: 'Network+' },
    ] });
  });
  it('one metric passes through unchanged', () => {
    expect(combine([netplus])).toBe(netplus);
    expect(combine([])).toBeUndefined();
  });
  it('lists the ids on a side now, and every one it ever had', () => {
    expect(sideMetricIds(link([added('2026-10-12')]), 'a')).toEqual(['net', 'study']);
    expect(sideMetricIds(link([added('2026-10-12', '2026-10-13')]), 'a')).toEqual(['net']);
    expect(everSideMetricIds(link([added('2026-10-12', '2026-10-13')]), 'a')).toEqual(['net', 'study']);
    expect(sideMetricIds(link([]), 'b')).toEqual(['their']);
  });
  it('an added metric counts this week from its start, not finished weeks', () => {
    const team = teamOf(link([added('2026-10-13')]), 'a', metrics);
    const r = race(team, shared({}), '2026-10-05', '2026-10-14', '2026-10-14', 1);
    expect(r.current.me.total).toBe(1800 + H + H); // Monday's Study hour counts too
    expect(r.past[0].me.total).toBe(2 * H); // last week: Network+ only
  });
  it('removing it takes it out of the running week but not finished ones', () => {
    const team = teamOf(link([added('2026-10-06', '2026-10-13')]), 'a', { ...metrics, study: { ...study, days: { ...study.days, '2026-10-07': { t: H, s: 'h' } } } });
    const r = race(team, shared({}), '2026-10-05', '2026-10-14', '2026-10-14', 1);
    expect(r.past[0].me.total).toBe(3 * H);
    expect(r.current.me.total).toBe(1800 + H);
  });
  it('an added metric joins a challenge still running, from its start', () => {
    const team = teamOf(link([added('2026-10-13')]), 'a', metrics);
    const running = challengeResult(challenge({ startDate: '2026-10-12', endDate: '2026-10-18' }), team, shared({}), '2026-10-14', '2026-10-14');
    expect(running.me).toBe(1800 + H + H);
    const finished = challengeResult(challenge({ startDate: '2026-10-05', endDate: '2026-10-11' }), team, shared({}), '2026-10-14', '2026-10-14');
    expect(finished.me).toBe(2 * H);
  });
  it('with times, it counts if added before the end instant', () => {
    const m = { metricId: 'study', addedOn: '2026-10-13', addedAt: '2026-10-13T18:00:00Z', removedOn: null, removedAt: null };
    expect(counts({ metric: study, ...m }, '2026-10-13', '2026-10-13T20:00:00Z')).toBe(true);
    expect(counts({ metric: study, ...m }, '2026-10-13', '2026-10-13T17:00:00Z')).toBe(false);
  });
  it('time metrics join time ones; counts only with the same unit', () => {
    const pages = metric({ id: 'p', type: 'count', unit: 'pages' });
    expect(canJoin(metric({ id: 's' }), { type: 'duration' }, 'h')).toBe(true);
    expect(canJoin(pages, { type: 'duration' }, 'h')).toBe(false);
    expect(canJoin(pages, { type: 'count' }, 'Pages')).toBe(true);
    expect(canJoin(pages, { type: 'count' }, 'chapters')).toBe(false);
    expect(canJoin(metric({ targetDirection: 'at_most' }), { type: 'duration' }, 'h')).toBe(false);
  });
});

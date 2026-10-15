import { describe, expect, it } from 'vitest';
import { challengeDays, challengeResult, newInviteCode, shareLogs, normalizeCode, race, shareMetric, sideFor, weekOutcome, type Challenge, type SharedDay, type SharedMetric } from './compete';
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
    ], 'l1', '2026-10-07');
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

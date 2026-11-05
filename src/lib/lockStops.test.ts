import { describe, expect, it } from 'vitest';
import { lockFollowUp, nextLockStep } from './lockStops';
import type { LockStop } from './native';
import type { ActiveTimer } from './types';

function stop(over: Partial<LockStop> = {}): LockStop {
  return {
    id: 'e1', uid: 'u1', metricId: 'm1', metricName: 'Study', startedAt: '2026-11-05T09:00:00.000Z',
    startedAtMs: Date.parse('2026-11-05T09:00:00.000Z'), stoppedAt: '2026-11-05T10:30:00.000Z', localDate: '2026-11-05',
    seconds: 5400, kind: 'log', synced: false, outcome: null, problem: null, ...over,
  };
}

const timer = (over: Partial<ActiveTimer> = {}): ActiveTimer => ({
  metricId: 'm1', startedAt: '2026-11-05T09:00:00.000Z', deviceId: 'd1', updatedAt: '2026-11-05T09:00:00.000Z', ...over,
});

const none = () => false;

describe('nextLockStep', () => {
  it('leaves another account’s stop for that account', () => {
    expect(nextLockStep(stop({ uid: 'u2' }), { uid: 'u1', timer: timer(), timerFromServer: true, hasEntry: none })).toEqual({ do: 'skip' });
  });

  it('follows up once the stop is saved, whoever saved it', () => {
    expect(nextLockStep(stop({ synced: true, outcome: 'saved' }), { uid: 'u1', timer: null, timerFromServer: false, hasEntry: none })).toEqual({ do: 'follow-up' });
  });

  it('completes it while state/timer still holds that timer, even from the offline cache', () => {
    expect(nextLockStep(stop(), { uid: 'u1', timer: timer(), timerFromServer: false, hasEntry: none })).toEqual({ do: 'complete' });
    expect(nextLockStep(stop({ kind: 'held' }), { uid: 'u1', timer: timer(), timerFromServer: true, hasEntry: none })).toEqual({ do: 'complete' });
  });

  it('never completes a different timer', () => {
    const later = timer({ startedAt: '2026-11-05T11:00:00.000Z' });
    expect(nextLockStep(stop(), { uid: 'u1', timer: later, timerFromServer: false, hasEntry: none })).toEqual({ do: 'wait' });
    expect(nextLockStep(stop(), { uid: 'u1', timer: timer({ metricId: 'm2' }), timerFromServer: true, hasEntry: none })).toEqual({ do: 'settle', outcome: 'gone' });
  });

  it('waits while offline with no timer cached', () => {
    expect(nextLockStep(stop(), { uid: 'u1', timer: null, timerFromServer: false, hasEntry: none })).toEqual({ do: 'wait' });
  });

  it('settles as saved when the APK wrote the entry, gone when another device stopped it', () => {
    expect(nextLockStep(stop(), { uid: 'u1', timer: null, timerFromServer: true, hasEntry: (id) => id === 'e1' })).toEqual({ do: 'settle', outcome: 'saved' });
    expect(nextLockStep(stop(), { uid: 'u1', timer: null, timerFromServer: true, hasEntry: none })).toEqual({ do: 'settle', outcome: 'gone' });
    // Over 12 hours writes no entry, so a vanished timer means it was dealt with elsewhere.
    expect(nextLockStep(stop({ kind: 'held' }), { uid: 'u1', timer: null, timerFromServer: true, hasEntry: () => true })).toEqual({ do: 'settle', outcome: 'gone' });
  });
});

describe('lockFollowUp', () => {
  it('owes a toast for a logged stop, the sheet for one over 12 hours, nothing otherwise', () => {
    expect(lockFollowUp(stop({ synced: true, outcome: 'saved' }))).toBe('logged');
    expect(lockFollowUp(stop({ synced: true, outcome: 'saved', kind: 'held', seconds: 13 * 3600 }))).toBe('held');
    expect(lockFollowUp(stop({ synced: true, outcome: 'saved', kind: 'none', seconds: 0 }))).toBe('nothing');
    expect(lockFollowUp(stop({ synced: true, outcome: 'gone' }))).toBe('nothing');
    expect(lockFollowUp(stop())).toBe('nothing');
  });
});

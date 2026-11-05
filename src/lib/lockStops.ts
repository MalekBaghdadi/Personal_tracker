import type { LockStop } from './native';
import type { ActiveTimer } from './types';

/**
 * What the web app does with a timer stopped from the Android lock screen (src/lib/native.ts,
 * TimerContext). The APK usually saves the stop to Firestore itself; when it couldn't (offline,
 * signed out), the app finishes it here, and either way the app then owes what a lock screen
 * can't show: the note prompt, or the over-12-hours sheet.
 *
 * - skip: another account's stop; it waits for that account.
 * - complete: state/timer still holds that timer, so stop it now, as the APK would have.
 * - settle: the server no longer has that timer. Saved if its entry exists (the APK wrote it),
 *   gone if another device stopped it first (that device logged it).
 * - wait: offline and the cached timer isn't this one; nothing can be told yet.
 * - follow-up: already saved or gone; show what's owed and forget it.
 */
export type LockStopStep =
  | { do: 'skip' }
  | { do: 'complete' }
  | { do: 'settle'; outcome: 'saved' | 'gone' }
  | { do: 'wait' }
  | { do: 'follow-up' };

export function nextLockStep(
  stop: LockStop,
  now: { uid: string; timer: ActiveTimer | null; timerFromServer: boolean; hasEntry: (id: string) => boolean },
): LockStopStep {
  if (stop.uid !== now.uid) return { do: 'skip' };
  if (stop.synced) return { do: 'follow-up' };
  if (now.timer && now.timer.startedAt === stop.startedAt && now.timer.metricId === stop.metricId) return { do: 'complete' };
  if (!now.timerFromServer) return { do: 'wait' };
  return { do: 'settle', outcome: stop.kind === 'log' && now.hasEntry(stop.id) ? 'saved' : 'gone' };
}

/** After it's saved: a toast (with the note prompt over 10 minutes), the over-12-hours sheet, or nothing. */
export function lockFollowUp(stop: LockStop): 'logged' | 'held' | 'nothing' {
  if (!stop.synced || stop.outcome !== 'saved') return 'nothing';
  if (stop.kind === 'held') return 'held';
  if (stop.kind === 'log' && stop.seconds > 0) return 'logged';
  return 'nothing';
}

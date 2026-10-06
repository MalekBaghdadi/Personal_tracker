import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { paths } from './repo';
import { DEFAULT_DAY_START_HOUR, deviceTimezone, nowIso } from './dates';
import { uuid } from './device';
import { PALETTE } from './palette';
import type { Metric, Settings } from './types';

export type Seed = Pick<Metric, 'name' | 'type' | 'unit' | 'targetDirection' | 'schedule' | 'timerEnabled' | 'quickAdd' | 'icon'>;

const MIN = 60;
const HOUR = 60 * MIN;

/**
 * Suggestions offered on first run; each new user picks their own. Starting
 * rows, not special cases: nothing in the app refers to these by name.
 */
export const SUGGESTIONS: Seed[] = [
  { name: 'Studying', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN, 60 * MIN], icon: 'GraduationCap' },
  { name: 'Reading', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN], icon: 'BookOpen' },
  { name: 'Gym', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'days_of_week', days: [1, 3, 5] }, timerEnabled: true, quickAdd: [45 * MIN, 60 * MIN], icon: 'Dumbbell' },
  { name: 'Calories', type: 'count', unit: 'kcal', targetDirection: 'at_most', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [100, 250, 500], icon: 'Flame' },
  { name: 'Water', type: 'count', unit: 'glasses', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [1, 2], icon: 'Droplet' },
  { name: 'Sleep', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [6 * HOUR, 7 * HOUR, 8 * HOUR], icon: 'Moon' },
  { name: 'Walking', type: 'count', unit: 'steps', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [1000, 2000, 5000], icon: 'Footprints' },
  { name: 'Meditation', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [5 * MIN, 10 * MIN, 20 * MIN], icon: 'Leaf' },
  { name: 'Coding', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [30 * MIN, 60 * MIN], icon: 'Code' },
  { name: 'Language practice', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [10 * MIN, 15 * MIN, 30 * MIN], icon: 'Languages' },
  { name: 'Music practice', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN], icon: 'Guitar' },
];

/** A user's own first-run metric: a name and a kind, everything else defaulted. */
export function customSeed(name: string, type: Metric['type'], unit: string): Seed {
  return type === 'duration'
    ? { name, type, unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN, 60 * MIN], icon: 'Target' }
    : { name, type, unit: unit || 'times', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [1, 5, 10], icon: 'Target' };
}

/**
 * A new account gets settings only; onboardedAt: null sends it to first run,
 * where the user picks their own metrics.
 */
export function seedAccount(uid: string): void {
  const settings: Settings = {
    timezone: deviceTimezone(),
    weekStartsOn: 1,
    dayStartHour: DEFAULT_DAY_START_HOUR,
    theme: 'dark',
    onboardedAt: null,
    updatedAt: nowIso(),
  };
  writeBatch(db).set(paths.settings(uid), settings).commit().catch((err) => console.error('[seed] failed', err));
}

/** First run's picks, written with onboardedAt in one batch so a half-finished setup can't happen. */
export function finishSetup(uid: string, picks: (Seed & { target: number | null })[], tz: string): void {
  const now = nowIso();
  const batch = writeBatch(db);
  picks.forEach((p, i) => {
    // Copy field by field: callers pass UI rows that carry extra keys.
    const metric: Metric = {
      name: p.name,
      type: p.type,
      unit: p.unit,
      target: p.target,
      targetDirection: p.targetDirection,
      schedule: p.schedule,
      timerEnabled: p.timerEnabled,
      quickAdd: p.quickAdd,
      icon: p.icon,
      id: uuid(),
      color: PALETTE[i % PALETTE.length].dark,
      order: i,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(paths.metric(uid, metric.id), metric);
  });
  batch.set(paths.settings(uid), { onboardedAt: now, timezone: tz, updatedAt: now }, { merge: true });
  batch.commit().catch((err) => console.error('[setup] failed', err));
}

import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { paths } from './repo';
import { deviceTimezone, nowIso } from './dates';
import { uuid } from './device';
import { PALETTE } from './palette';
import type { Metric, Settings } from './types';

type Seed = Pick<Metric, 'name' | 'type' | 'unit' | 'targetDirection' | 'schedule' | 'timerEnabled' | 'quickAdd' | 'icon'>;

const MIN = 60;

/**
 * Starting rows, not special cases: nothing in the app refers to these by name.
 * Targets are deliberately null — the first-run screen asks for real ones.
 */
const SEEDS: Seed[] = [
  { name: 'Studying', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN, 60 * MIN], icon: 'GraduationCap' },
  { name: 'Reading', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN], icon: 'BookOpen' },
  { name: 'Network+', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'daily' }, timerEnabled: true, quickAdd: [15 * MIN, 30 * MIN, 60 * MIN], icon: 'Network' },
  { name: 'Gym', type: 'duration', unit: 'min', targetDirection: 'at_least', schedule: { kind: 'days_of_week', days: [1, 3, 5] }, timerEnabled: true, quickAdd: [45 * MIN, 60 * MIN], icon: 'Dumbbell' },
  { name: 'Calories', type: 'count', unit: 'kcal', targetDirection: 'at_most', schedule: { kind: 'daily' }, timerEnabled: false, quickAdd: [100, 250, 500], icon: 'Flame' },
];

export function seedAccount(uid: string): void {
  const now = nowIso();
  const batch = writeBatch(db);
  SEEDS.forEach((s, i) => {
    const metric: Metric = {
      ...s,
      id: uuid(),
      target: null,
      color: PALETTE[i % PALETTE.length].dark,
      order: i,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(paths.metric(uid, metric.id), metric);
  });
  const settings: Settings = {
    timezone: deviceTimezone(),
    weekStartsOn: 1,
    theme: 'dark',
    onboardedAt: null,
    updatedAt: now,
  };
  batch.set(paths.settings(uid), settings);
  batch.commit().catch((err) => console.error('[seed] failed', err));
}

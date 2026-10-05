import { addDays, weekdayOf } from './dates';
import type { DayStats, Metric, Schedule } from './types';

type TargetFields = Pick<Metric, 'target' | 'targetDirection' | 'schedule'>;

export function isScheduled(schedule: Schedule, localDate: string): boolean {
  return schedule.kind === 'daily' || schedule.days.includes(weekdayOf(localDate));
}

/**
 * Whether a day met the target. A ceiling (`at_most`) needs evidence: a day
 * with no entries is never a hit, or forgetting to log would read as success.
 * Returns null when the metric has no target.
 */
export function isHit(metric: TargetFields, total: number, count: number): boolean | null {
  if (metric.target == null) return null;
  if (metric.targetDirection === 'at_least') return total >= metric.target;
  return count > 0 && total <= metric.target;
}

function hitOn(metric: TargetFields, stats: DayStats, date: string): boolean {
  const s = stats.get(date);
  return isHit(metric, s?.total ?? 0, s?.count ?? 0) === true;
}

function earliest(stats: DayStats): string | null {
  let min: string | null = null;
  for (const d of stats.keys()) if (min === null || d < min) min = d;
  return min;
}

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * Streaks count scheduled days only; unscheduled days are skipped and neither
 * extend nor break a run. Today never breaks a streak: if it isn't a hit yet,
 * counting starts from the previous scheduled day.
 */
export function computeStreaks(metric: TargetFields, stats: DayStats, today: string): Streaks | null {
  if (metric.target == null) return null;
  const first = earliest(stats);
  if (first === null || first > today) return { current: 0, longest: 0 };

  let current = 0;
  let d = today;
  if (isScheduled(metric.schedule, d) && hitOn(metric, stats, d)) current = 1;
  d = addDays(d, -1);
  // Every day before the first entry is a miss, so the walk ends there at the latest.
  for (; d >= first; d = addDays(d, -1)) {
    if (!isScheduled(metric.schedule, d)) continue;
    if (!hitOn(metric, stats, d)) break;
    current++;
  }

  let longest = 0;
  let run = 0;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (!isScheduled(metric.schedule, day)) continue;
    if (hitOn(metric, stats, day)) {
      run++;
      if (run > longest) longest = run;
    } else if (day !== today) {
      run = 0;
    }
  }

  return { current, longest: Math.max(longest, current) };
}

/**
 * Share of scheduled days in [start, today] that were hits. Today counts only
 * once it's a hit, so the rate doesn't dip every morning.
 */
export function hitRate(
  metric: TargetFields,
  stats: DayStats,
  start: string,
  today: string,
): { hits: number; scheduled: number } | null {
  if (metric.target == null) return null;
  let hits = 0;
  let scheduled = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(metric.schedule, d)) continue;
    const hit = hitOn(metric, stats, d);
    if (d === today && !hit) continue;
    scheduled++;
    if (hit) hits++;
  }
  return { hits, scheduled };
}

/**
 * For each day in [from, to], how far into a streak it is: 1 on the first hit
 * of a run, 2 on the next scheduled hit, and so on; 0 on a miss. Unscheduled
 * days are left out (they neither extend nor break a run), and today never
 * breaks one. Runs are counted from the first entry, so a streak that started
 * last month carries into this one.
 */
export function streakDays(metric: TargetFields, stats: DayStats, from: string, to: string, today: string): Map<string, number> {
  const out = new Map<string, number>();
  if (metric.target == null) return out;
  const first = earliest(stats);
  if (first === null) {
    for (let d = from; d <= to; d = addDays(d, 1)) if (isScheduled(metric.schedule, d)) out.set(d, 0);
    return out;
  }
  let run = 0;
  for (let d = first < from ? first : from; d <= to; d = addDays(d, 1)) {
    if (!isScheduled(metric.schedule, d)) continue;
    let pos = 0;
    if (hitOn(metric, stats, d)) pos = ++run;
    else if (d < today) run = 0;
    if (d >= from) out.set(d, pos);
  }
  return out;
}

/** Brightness step 0–7: one step brighter each day of a streak, full from day 7. Averages round up. */
export function streakLevel(days: number): number {
  if (days <= 0) return 0;
  return Math.min(7, Math.ceil(days));
}

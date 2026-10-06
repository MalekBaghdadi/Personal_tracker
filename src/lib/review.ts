import { addDays, weekdayOf } from './dates';
import { isHit, isScheduled } from './streaks';
import type { DayStats, Goal, Metric } from './types';

/**
 * The weekly review: last week's totals, target days and best day per metric,
 * and how far each deadline goal moved. Pure and derived from day totals, like
 * streaks and goals; nothing here is ever stored.
 */

/** First day of the week containing `date`. */
export function weekStartOf(date: string, weekStartsOn: 0 | 1): string {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

export interface MetricWeek {
  metric: Metric;
  total: number;
  /** Days with anything logged. */
  loggedDays: number;
  /** null when the metric has no target. */
  hits: number | null;
  scheduled: number | null;
  best: { date: string; total: number } | null;
  previousTotal: number;
}

export interface GoalWeek {
  goal: Goal;
  gained: number;
}

export interface WeekReview {
  start: string;
  end: string;
  metrics: MetricWeek[];
  goals: GoalWeek[];
  /** Anything at all was logged that week. */
  any: boolean;
}

function sum(stats: DayStats, from: string, to: string): number {
  let t = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) t += stats.get(d)?.total ?? 0;
  return t;
}

/**
 * @param start first day of the week being reviewed
 * @param createdOn metricId → localDate the metric was created; days before it aren't counted as missed
 */
export function reviewWeek(
  start: string,
  metrics: Metric[],
  dayStats: Map<string, DayStats>,
  goals: Goal[],
  createdOn: Map<string, string>,
): WeekReview {
  const end = addDays(start, 6);
  const empty: DayStats = new Map();
  const out: MetricWeek[] = [];
  let any = false;

  for (const metric of metrics) {
    const created = createdOn.get(metric.id) ?? start;
    if (created > end) continue;
    const stats = dayStats.get(metric.id) ?? empty;
    const total = sum(stats, start, end);
    let loggedDays = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) if (stats.get(d)?.count) loggedDays++;
    if (total > 0) any = true;
    if (metric.archivedAt && total === 0) continue;

    let hits: number | null = null;
    let scheduled: number | null = null;
    if (metric.target != null) {
      hits = 0;
      scheduled = 0;
      for (let d = created > start ? created : start; d <= end; d = addDays(d, 1)) {
        if (!isScheduled(metric.schedule, d)) continue;
        scheduled++;
        const s = stats.get(d);
        if (isHit(metric, s?.total ?? 0, s?.count ?? 0)) hits++;
      }
      // The review covers exactly one week: up to the rest allowance of misses aren't due days.
      scheduled -= Math.min(metric.restDaysPerWeek ?? 0, scheduled - hits);
    }

    // Best day only means something for "more is better" metrics.
    let best: MetricWeek['best'] = null;
    if (metric.targetDirection === 'at_least') {
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const t = stats.get(d)?.total ?? 0;
        if (t > 0 && (!best || t > best.total)) best = { date: d, total: t };
      }
    }

    out.push({ metric, total, loggedDays, hits, scheduled, best, previousTotal: sum(stats, addDays(start, -7), addDays(start, -1)) });
  }

  const goalWeeks: GoalWeek[] = [];
  for (const goal of goals) {
    if (goal.archivedAt || goal.startDate > end || goal.deadline < start) continue;
    const stats = dayStats.get(goal.metricId) ?? empty;
    const from = goal.startDate > start ? goal.startDate : start;
    const to = goal.deadline < end ? goal.deadline : end;
    goalWeeks.push({ goal, gained: sum(stats, from, to) });
  }

  return { start, end, metrics: out, goals: goalWeeks, any };
}

import { addDays } from './dates';
import { isScheduled } from './streaks';
import type { Entry, Goal } from './types';

/*
 * Deadline goals: every number here is derived from the goal's inputs plus
 * entries, on every render. Nothing is stored, so offline edits on two devices
 * and changes to a target or deadline can never leave a stale value behind.
 * Pure module: no React, no Firestore. All amounts are base units.
 */

type GoalInputs = Pick<Goal, 'metricId' | 'targetTotal' | 'priorProgress' | 'startDate' | 'deadline' | 'paceSchedule'>;
type EntryLike = Pick<Entry, 'metricId' | 'localDate' | 'value' | 'deletedAt'>;

export type GoalStatus = 'achieved' | 'missed' | 'not_started' | 'no_days_left' | 'ahead' | 'behind' | 'on_track';

export type Projection =
  | { kind: 'none' } // achieved, missed or not started: nothing to project
  | { kind: 'insufficient' } // fewer than 3 pace days in the recent window
  | { kind: 'no_recent' } // recent rate is zero
  | { kind: 'short'; projectedTotal: number; shortfall: number }
  | { kind: 'finishes'; projectedTotal: number; finishDate: string };

export interface GoalResult {
  done: number;
  doneThroughYesterday: number;
  doneToday: number;
  remaining: number;
  totalPaceDays: number;
  paceDaysBeforeToday: number;
  paceDaysLeft: number;
  idealPerDay: number;
  expectedByNow: number;
  /** done − expectedByNow. Positive is ahead. */
  delta: number;
  tolerance: number;
  /** Pace from this morning on; fixed for the day. null when there are no pace days left. */
  requiredPerDay: number | null;
  todayIsPaceDay: boolean;
  /** 0 on non-pace days. */
  neededToday: number;
  /** Next pace day after today (or the first one, before the goal starts). */
  nextPaceDay: string | null;
  status: GoalStatus;
  achievedDate: string | null;
  /** Calendar days from today to the deadline, inclusive. 0 once it has passed. */
  daysLeft: number;
  recentRate: number | null;
  projection: Projection;
  /** Required pace has more than doubled while behind. */
  overloaded: boolean;
}

const PROJECTION_WINDOW_DAYS = 14;
const PROJECTION_MIN_PACE_DAYS = 3;

export function isPaceDay(goal: Pick<GoalInputs, 'startDate' | 'deadline' | 'paceSchedule'>, d: string): boolean {
  return d >= goal.startDate && d <= goal.deadline && isScheduled(goal.paceSchedule, d);
}

/** Pace days in [from, to], clipped to the goal's range. */
export function countPaceDays(goal: Pick<GoalInputs, 'startDate' | 'deadline' | 'paceSchedule'>, from: string, to: string): number {
  const start = from > goal.startDate ? from : goal.startDate;
  const end = to < goal.deadline ? to : goal.deadline;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isScheduled(goal.paceSchedule, d)) n++;
  return n;
}

function daysBetweenInclusive(a: string, b: string): number {
  if (b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) n++;
  return n;
}

export function computeGoal(goal: GoalInputs, entries: EntryLike[], today: string): GoalResult {
  const yesterday = addDays(today, -1);

  // Counted entries: this metric, not deleted, inside [startDate, deadline].
  const byDate = new Map<string, number>();
  for (const e of entries) {
    if (e.metricId !== goal.metricId || e.deletedAt) continue;
    if (e.localDate < goal.startDate || e.localDate > goal.deadline) continue;
    byDate.set(e.localDate, (byDate.get(e.localDate) ?? 0) + e.value);
  }
  let counted = 0;
  let countedBeforeToday = 0;
  for (const [d, v] of byDate) {
    counted += v;
    if (d < today) countedBeforeToday += v;
  }
  const doneToday = byDate.get(today) ?? 0;
  const done = goal.priorProgress + counted;
  const doneThroughYesterday = goal.priorProgress + countedBeforeToday;
  const remaining = Math.max(0, goal.targetTotal - done);

  const totalPaceDays = countPaceDays(goal, goal.startDate, goal.deadline);
  const idealPerDay = totalPaceDays > 0 ? (goal.targetTotal - goal.priorProgress) / totalPaceDays : 0;
  const paceDaysBeforeToday = countPaceDays(goal, goal.startDate, yesterday);
  const paceDaysLeft = today > goal.deadline ? 0 : countPaceDays(goal, today, goal.deadline);

  // Judged on where yesterday ended; today's work can only move you ahead.
  const expectedByNow = goal.priorProgress + idealPerDay * paceDaysBeforeToday;
  const delta = done - expectedByNow;
  const tolerance = 0.5 * idealPerDay;

  // From doneThroughYesterday so the number holds still all day.
  const requiredPerDay = paceDaysLeft > 0 ? Math.max(0, goal.targetTotal - doneThroughYesterday) / paceDaysLeft : null;
  const todayIsPaceDay = isPaceDay(goal, today);
  const neededToday = todayIsPaceDay && requiredPerDay !== null ? Math.max(0, requiredPerDay - doneToday) : 0;

  // Strictly after today once the goal has started; the first pace day before that.
  let nextPaceDay: string | null = null;
  for (let d = today >= goal.startDate ? addDays(today, 1) : goal.startDate; d <= goal.deadline; d = addDays(d, 1)) {
    if (isScheduled(goal.paceSchedule, d)) {
      nextPaceDay = d;
      break;
    }
  }

  // Achieved date: first day the running total reached the target.
  let achievedDate: string | null = null;
  if (goal.priorProgress >= goal.targetTotal) achievedDate = goal.startDate;
  else {
    let acc = goal.priorProgress;
    for (const d of [...byDate.keys()].sort()) {
      acc += byDate.get(d)!;
      if (acc >= goal.targetTotal) {
        achievedDate = d;
        break;
      }
    }
  }

  let status: GoalStatus;
  if (done >= goal.targetTotal) status = 'achieved';
  else if (today > goal.deadline) status = 'missed';
  else if (today < goal.startDate) status = 'not_started';
  else if (paceDaysLeft === 0) status = 'no_days_left';
  else if (delta > tolerance) status = 'ahead';
  else if (delta < -tolerance) status = 'behind';
  else status = 'on_track';

  // Projection from the last 14 calendar days ending yesterday.
  let recentRate: number | null = null;
  let projection: Projection = { kind: 'none' };
  if (status !== 'achieved' && status !== 'missed' && status !== 'not_started') {
    const windowStart = addDays(today, -PROJECTION_WINDOW_DAYS);
    const from = windowStart > goal.startDate ? windowStart : goal.startDate;
    const windowPaceDays = from <= yesterday ? countPaceDays(goal, from, yesterday) : 0;
    if (windowPaceDays < PROJECTION_MIN_PACE_DAYS) projection = { kind: 'insufficient' };
    else {
      let windowSum = 0;
      for (const [d, v] of byDate) if (d >= from && d <= yesterday) windowSum += v;
      recentRate = windowSum / windowPaceDays;
      if (recentRate <= 0) projection = { kind: 'no_recent' };
      else {
        // Departure from the addendum's formula (done + rate × days after today):
        // in the morning `done` excludes today, so that formula drops a whole
        // day and tells someone exactly on pace they'll fall short. Today's
        // unfinished share at the recent rate is counted too, and work already
        // logged today isn't counted twice.
        const todayRemainder = todayIsPaceDay ? Math.max(0, recentRate - doneToday) : 0;
        const futurePaceDays = countPaceDays(goal, addDays(today, 1), goal.deadline);
        const projectedTotal = done + todayRemainder + recentRate * futurePaceDays;
        if (projectedTotal < goal.targetTotal) {
          projection = { kind: 'short', projectedTotal, shortfall: goal.targetTotal - projectedTotal };
        } else if (done + todayRemainder >= goal.targetTotal) {
          projection = { kind: 'finishes', projectedTotal, finishDate: today };
        } else {
          let acc = done + todayRemainder;
          let finishDate = goal.deadline;
          for (let d = addDays(today, 1); d <= goal.deadline; d = addDays(d, 1)) {
            if (!isScheduled(goal.paceSchedule, d)) continue;
            acc += recentRate;
            if (acc >= goal.targetTotal) {
              finishDate = d;
              break;
            }
          }
          projection = { kind: 'finishes', projectedTotal, finishDate };
        }
      }
    }
  }

  return {
    done,
    doneThroughYesterday,
    doneToday,
    remaining,
    totalPaceDays,
    paceDaysBeforeToday,
    paceDaysLeft,
    idealPerDay,
    expectedByNow,
    delta,
    tolerance,
    requiredPerDay,
    todayIsPaceDay,
    neededToday,
    nextPaceDay,
    status,
    achievedDate,
    daysLeft: daysBetweenInclusive(today, goal.deadline),
    recentRate,
    projection,
    overloaded: status === 'behind' && requiredPerDay !== null && idealPerDay > 0 && requiredPerDay > 2 * idealPerDay,
  };
}

/** Required pace for the next pace day when today isn't one (for "Next: Monday, 1h 35m"). */
export function nextDayRequirement(r: GoalResult, today: string, goal: GoalInputs): number | null {
  if (!r.nextPaceDay || r.todayIsPaceDay) return r.requiredPerDay;
  // Nothing more is expected today, so tomorrow's pace comes from today's total.
  const left = countPaceDays(goal, r.nextPaceDay, goal.deadline);
  return left > 0 ? Math.max(0, goal.targetTotal - (today < goal.startDate ? goal.priorProgress : r.done)) / left : null;
}

export interface GoalValidation {
  deadline?: string;
  schedule?: string;
  target?: string;
}

/** Hard errors that block saving. targetTotal ≤ priorProgress is allowed (confirmed in the form). */
export function validateGoal(goal: Pick<GoalInputs, 'targetTotal' | 'startDate' | 'deadline' | 'paceSchedule'>): GoalValidation {
  const errors: GoalValidation = {};
  if (!(goal.targetTotal > 0)) errors.target = 'Enter a target above zero.';
  if (goal.deadline < goal.startDate) errors.deadline = 'The deadline must be on or after the start date.';
  else if (countPaceDays(goal, goal.startDate, goal.deadline) === 0) errors.schedule = 'None of the work days fall between the start date and the deadline.';
  return errors;
}

/** Durations round up to the minute for pace, so following the number still finishes on time. */
export function ceilToMinute(seconds: number): number {
  return Math.ceil(seconds / 60) * 60;
}

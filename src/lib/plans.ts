import { addDays, weekdayOf } from './dates';
import { isScheduled } from './streaks';
import type { Plan, PlanSection, PlanTask, Schedule } from './types';

/*
 * Plans: deadline goals counted in tasks. Everything here is derived from the
 * plan's inputs and its tasks on every render; nothing is stored. Pure module:
 * no React, no Firestore.
 *
 * The queue: the current task is the first undone one in order. Dates never
 * decide what's shown, only the pace line. A task is never overdue on its
 * own; slipping only shows up as "behind".
 */

type PlanInputs = Pick<Plan, 'startDate' | 'deadline' | 'schedule'>;
type TaskLike = Pick<PlanTask, 'id' | 'sectionId' | 'order' | 'targetDate' | 'doneAt' | 'createdAt'>;
type SectionLike = Pick<PlanSection, 'id' | 'order' | 'createdAt'>;

export const MON_FRI: Schedule = { kind: 'days_of_week', days: [1, 2, 3, 4, 5] };

/**
 * Tasks in plan order: tasks outside any section first, then each section in
 * order. A task whose section is gone counts as outside one.
 */
export function orderTasks<T extends TaskLike>(sections: SectionLike[], tasks: T[]): T[] {
  const rank = new Map([...sections].sort(bySectionOrder).map((s, i) => [s.id, i]));
  const sectionRank = (t: T) => (t.sectionId != null && rank.has(t.sectionId) ? rank.get(t.sectionId)! : -1);
  return [...tasks].sort((a, b) => sectionRank(a) - sectionRank(b) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function bySectionOrder(a: SectionLike, b: SectionLike): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
}

export function isPlanDay(plan: PlanInputs, d: string): boolean {
  return d >= plan.startDate && d <= plan.deadline && isScheduled(plan.schedule, d);
}

/** Scheduled days in [from, to], clipped to the plan's range. */
export function planDays(plan: PlanInputs, from: string, to: string): string[] {
  const start = from > plan.startDate ? from : plan.startDate;
  const end = to < plan.deadline ? to : plan.deadline;
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isScheduled(plan.schedule, d)) out.push(d);
  return out;
}

/** `n` scheduled days after `d` (n ≥ 0), ignoring the plan's range. */
export function addScheduledDays(d: string, n: number, schedule: Schedule): string {
  if (schedule.kind === 'days_of_week' && schedule.days.length === 0) return addDays(d, n);
  let out = d;
  for (let left = n; left > 0;) {
    out = addDays(out, 1);
    if (isScheduled(schedule, out)) left--;
  }
  return out;
}

/**
 * Each task's date on the pace line. Dated tasks keep their date. A run of
 * undated tasks is spread evenly over the scheduled days between the dated
 * tasks around it (the start date and the deadline at the ends), so a plan
 * with no dates at all gets an even line across its schedule, and a mixed
 * plan still gets a sensible one.
 */
export function plannedDates(plan: PlanInputs, ordered: TaskLike[]): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < ordered.length) {
    const t = ordered[i];
    if (t.targetDate) {
      out.set(t.id, t.targetDate);
      i++;
      continue;
    }
    let j = i;
    while (j < ordered.length && !ordered[j].targetDate) j++;
    const run = ordered.slice(i, j);
    const prev = i > 0 ? ordered[i - 1].targetDate : null; // the task before is dated (or there is none)
    const next = j < ordered.length ? ordered[j].targetDate : null;
    // Days after the previous dated task, up to the next one (not on it) or the deadline.
    const from = prev ? addDays(prev, 1) : plan.startDate;
    const to = next ? addDays(next, -1) : plan.deadline;
    let days = from <= to ? planDays(plan, from, to) : [];
    // No scheduled day in between (two dated tasks on consecutive days): share the earlier date.
    if (days.length === 0) days = [prev ?? next ?? plan.startDate];
    run.forEach((task, k) => {
      // Task k lands on the day where (k + 1)/run of the span is covered, so the last one is on the last day.
      const idx = Math.max(0, Math.ceil(((k + 1) * days.length) / run.length) - 1);
      out.set(task.id, days[idx]);
    });
    i = j;
  }
  return out;
}

export type PlanStatus = 'empty' | 'achieved' | 'missed' | 'not_started' | 'ahead' | 'behind' | 'on_pace';

export type PlanProjection =
  | { kind: 'none' } // achieved, missed, not started or empty
  | { kind: 'insufficient' } // fewer than 3 scheduled days in the recent window
  | { kind: 'no_recent' } // nothing done recently
  | { kind: 'finishes'; finishDate: string; late: boolean };

export interface PlanResult<T extends TaskLike = TaskLike> {
  ordered: T[];
  planned: Map<string, string>;
  total: number;
  done: number;
  doneToday: number;
  remaining: number;
  /** The first undone task, or null when all are done. */
  current: T | null;
  currentIndex: number;
  /** Tasks whose pace-line date is before today. Today's own never counts against you. */
  expected: number;
  /** Tasks whose pace-line date is today or earlier. */
  dueThroughToday: number;
  /** How many more today keeps you on pace (0 on unscheduled days with nothing due). */
  neededToday: number;
  /** Signed: + ahead (done past what's due through today), − behind (done short of what was due before today). */
  delta: number;
  status: PlanStatus;
  achievedDate: string | null;
  todayIsPlanDay: boolean;
  totalDays: number;
  daysLeft: number;
  /** Tasks per scheduled day over the last 14 days (ending yesterday). */
  recentRate: number | null;
  projection: PlanProjection;
  /** Behind, and what's left needs more than double the planned rate (or there are no days left). */
  overloaded: boolean;
}

const WINDOW_DAYS = 14;
const MIN_WINDOW_DAYS = 3;

/**
 * `dayOf` turns a done time into its tracking day (timezone and day start).
 */
export function computePlan<T extends TaskLike>(plan: PlanInputs, sections: SectionLike[], tasks: T[], today: string, dayOf: (iso: string) => string): PlanResult<T> {
  const ordered = orderTasks(sections, tasks);
  const planned = plannedDates(plan, ordered);
  const total = ordered.length;
  const doneDays = new Map<string, string>();
  for (const t of ordered) if (t.doneAt) doneDays.set(t.id, dayOf(t.doneAt));
  const done = doneDays.size;
  let doneToday = 0;
  for (const d of doneDays.values()) if (d === today) doneToday++;
  const currentIndex = ordered.findIndex((t) => !t.doneAt);
  const current = currentIndex >= 0 ? ordered[currentIndex] : null;

  let expected = 0;
  let dueThroughToday = 0;
  for (const d of planned.values()) {
    if (d < today) expected++;
    if (d <= today) dueThroughToday++;
  }
  const delta = done < expected ? done - expected : done > dueThroughToday ? done - dueThroughToday : 0;
  const neededToday = Math.max(0, dueThroughToday - done);

  let achievedDate: string | null = null;
  if (total > 0 && done === total) for (const d of doneDays.values()) if (!achievedDate || d > achievedDate) achievedDate = d;

  let status: PlanStatus;
  if (total === 0) status = 'empty';
  else if (done === total) status = 'achieved';
  else if (today > plan.deadline) status = 'missed';
  else if (today < plan.startDate) status = 'not_started';
  else if (delta > 0) status = 'ahead';
  else if (delta < 0) status = 'behind';
  else status = 'on_pace';

  const totalDays = planDays(plan, plan.startDate, plan.deadline).length;
  const daysLeft = today > plan.deadline ? 0 : planDays(plan, today, plan.deadline).length;
  const remaining = total - done;

  let recentRate: number | null = null;
  let projection: PlanProjection = { kind: 'none' };
  if (status !== 'achieved' && status !== 'missed' && status !== 'not_started' && status !== 'empty') {
    const yesterday = addDays(today, -1);
    const from = addDays(today, -WINDOW_DAYS) > plan.startDate ? addDays(today, -WINDOW_DAYS) : plan.startDate;
    const windowDays = from <= yesterday ? planDays(plan, from, yesterday).length : 0;
    if (windowDays < MIN_WINDOW_DAYS) projection = { kind: 'insufficient' };
    else {
      let n = 0;
      for (const d of doneDays.values()) if (d >= from && d <= yesterday) n++;
      recentRate = n / windowDays;
      if (recentRate <= 0) projection = { kind: 'no_recent' };
      else {
        // Today's share at the recent rate, minus what's already done today; then a scheduled day at a time.
        let acc = isScheduled(plan.schedule, today) ? Math.max(recentRate, doneToday) - doneToday : 0;
        let d = today;
        // Bounded: at least one task per ~5 years of scheduled days.
        for (let guard = 0; acc < remaining && guard < 2000; guard++) {
          d = addScheduledDays(d, 1, plan.schedule);
          acc += recentRate;
        }
        projection = { kind: 'finishes', finishDate: d, late: d > plan.deadline };
      }
    }
  }

  const plannedRate = totalDays > 0 ? total / totalDays : 0;
  const overloaded = status === 'behind' && (daysLeft === 0 || (plannedRate > 0 && remaining / daysLeft > 2 * plannedRate));

  return {
    ordered, planned, total, done, doneToday, remaining, current, currentIndex,
    expected, dueThroughToday, neededToday, delta, status, achievedDate,
    todayIsPlanDay: isPlanDay(plan, today), totalDays, daysLeft, recentRate, projection, overloaded,
  };
}

/** "2 tasks behind", "1 task ahead", "On pace", "Achieved", … */
export function planStatusLabel(r: Pick<PlanResult, 'status' | 'delta' | 'remaining'>, startLabel?: string): string {
  const tasks = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;
  switch (r.status) {
    case 'empty': return 'No tasks yet';
    case 'achieved': return 'Achieved';
    case 'missed': return `Missed by ${tasks(r.remaining)}`;
    case 'not_started': return startLabel ? `Starts ${startLabel}` : 'Not started';
    case 'ahead': return `${tasks(r.delta)} ahead`;
    case 'behind': return `${tasks(-r.delta)} behind`;
    default: return 'On pace';
  }
}

/** "2 today to get back on pace", "1 today", "Today’s done", or null when nothing's due. */
export function planNeedLabel(r: Pick<PlanResult, 'status' | 'neededToday' | 'delta' | 'todayIsPlanDay' | 'dueThroughToday' | 'done'>): string | null {
  if (r.status === 'achieved' || r.status === 'missed' || r.status === 'not_started' || r.status === 'empty') return null;
  if (r.neededToday === 0) return r.todayIsPlanDay ? 'Today’s done' : null;
  return r.delta < 0 ? `${r.neededToday} today to get back on pace` : `${r.neededToday} today`;
}

/**
 * "Push remaining": every undone task's target date moves `n` scheduled days
 * later (undated ones follow the deadline). Returns the new dates by task id
 * and, when asked, the new deadline.
 */
export function pushRemaining(plan: PlanInputs, tasks: TaskLike[], n: number, moveDeadline: boolean): { dates: Map<string, string>; deadline: string } {
  const dates = new Map<string, string>();
  for (const t of tasks) if (!t.doneAt && t.targetDate) dates.set(t.id, addScheduledDays(t.targetDate, n, plan.schedule));
  return { dates, deadline: moveDeadline ? addScheduledDays(plan.deadline, n, plan.schedule) : plan.deadline };
}

/** "Mon–Fri", "Every day", "Mon, Wed, Fri". */
export function scheduleLabel(s: Schedule): string {
  if (s.kind === 'daily') return 'Every day';
  const days = [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const key = days.join(',');
  if (key === '1,2,3,4,5') return 'Mon–Fri';
  if (key === '1,2,3,4,5,6') return 'Mon–Sat';
  if (days.length === 7) return 'Every day';
  return days.map((d) => names[d]).join(', ');
}

/** Weekdays a set of dates fall on, as a schedule: all on Mon–Fri gives Mon–Fri. */
export function scheduleFromDates(dates: string[]): Schedule {
  if (dates.length === 0) return MON_FRI;
  const days = new Set(dates.map(weekdayOf));
  if ([...days].every((d) => d >= 1 && d <= 5)) return MON_FRI;
  if (days.size === 7) return { kind: 'daily' };
  return { kind: 'days_of_week', days: [...new Set([...days, 1, 2, 3, 4, 5])].sort() };
}

export interface PlanWeek {
  done: number;
  previous: number;
  /** Signed ahead (+) or behind (−) on the morning the week started, and the morning after it ended. */
  deltaBefore: number;
  deltaAfter: number;
}

/**
 * Last week for one plan, for the weekly review: tasks done, the week
 * before, and how ahead/behind moved. At a boundary it's simply tasks done
 * before that day minus tasks planned before it.
 */
export function planWeek<T extends TaskLike>(plan: PlanInputs, sections: SectionLike[], tasks: T[], weekStart: string, dayOf: (iso: string) => string): PlanWeek {
  const end = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const planned = [...plannedDates(plan, orderTasks(sections, tasks)).values()];
  const doneDays = tasks.filter((t) => t.doneAt).map((t) => dayOf(t.doneAt!));
  const count = (list: string[], from: string, to: string) => list.filter((d) => d >= from && d <= to).length;
  const deltaOn = (day: string) => doneDays.filter((d) => d < day).length - planned.filter((d) => d < day).length;
  return {
    done: count(doneDays, weekStart, end),
    previous: count(doneDays, prevStart, addDays(weekStart, -1)),
    deltaBefore: deltaOn(weekStart),
    deltaAfter: deltaOn(addDays(end, 1)),
  };
}

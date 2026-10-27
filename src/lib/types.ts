/** 'check' is done or not done: one tap a day, stored as an entry of 1, target always 1. */
export type MetricType = 'duration' | 'count' | 'check';
/** 'between' is a range: `targetMin` to `target`, both inclusive (e.g. 1,800–2,200 kcal). */
export type TargetDirection = 'at_least' | 'at_most' | 'between';

export type Schedule =
  | { kind: 'daily' }
  | { kind: 'days_of_week'; days: number[] }; // 0 = Sunday

/** What a metric is about, for themed achievements (lib/themes.ts). */
export type ThemeId = 'study' | 'code' | 'reading' | 'fitness' | 'mind' | 'creative' | 'health' | 'sleep' | 'other';

/** A metric's target as it was for a stretch of days (the fields a day is judged against). */
export interface TargetSpec {
  target: number | null;
  targetDirection: TargetDirection;
  targetMin?: number | null;
}

/** An earlier target, in force from `from` (null: since the start) until the next version began. */
export interface TargetVersion extends TargetSpec {
  from: string | null;
}

export interface Metric {
  id: string;
  name: string;
  type: MetricType;
  unit: string;
  /** Base unit: seconds for duration, integer for count. null = no target. */
  target: number | null;
  targetDirection: TargetDirection;
  /** Lower bound, only for 'between' (target is then the upper bound). Base unit. */
  targetMin?: number | null;
  /**
   * Targets this metric had before the current one, oldest first, so a day is
   * judged against the target in force on it (`targetOn`), not today's. Absent:
   * the current target has always applied.
   */
  targetHistory?: TargetVersion[];
  /** First day the current target applies. Absent or null: since the start. */
  targetFrom?: string | null;
  schedule: Schedule;
  timerEnabled: boolean;
  /** Due days a week that may be missed without breaking the streak. Absent or 0: none. */
  restDaysPerWeek?: number;
  /** Days marked "Rest day" ahead (localDate). Only count within the weekly allowance. */
  restDates?: string[];
  /** Base-unit values for one-tap buttons. */
  quickAdd: number[];
  color: string;
  icon: string;
  /** Achievement theme. Absent until the user picks one: it then follows the icon (themeOf). */
  theme?: ThemeId;
  order: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntrySource = 'timer' | 'manual' | 'quick_add';

export interface Entry {
  id: string;
  metricId: string;
  /** 'YYYY-MM-DD' in the configured timezone. */
  localDate: string;
  /** Base unit, always > 0. */
  value: number;
  source: EntrySource;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActiveTimer {
  metricId: string;
  startedAt: string;
  deviceId: string;
  updatedAt: string;
}

export interface Settings {
  timezone: string;
  weekStartsOn: 0 | 1;
  theme: 'dark' | 'light' | 'system';
  /** Hour (0–6) the tracking day rolls over. Absent on older docs: DEFAULT_DAY_START_HOUR. */
  dayStartHour?: number;
  /** Set once the first-run target walkthrough is finished. */
  onboardedAt: string | null;
  /** Screen tours already shown (ids from lib/tours.ts). Absent means none. */
  toursSeen?: string[];
  /** Profile: the name on it. Absent: the email's local part. */
  displayName?: string;
  /** Profile: a collected achievement's id, worn as a title. Absent or null: the rank. */
  title?: string | null;
  /** Profile: up to three collected achievement ids, in order. */
  pinned?: string[];
  /** Profile: shown to the Compete partner. Absent means off. */
  shareProfile?: boolean;
  updatedAt: string;
}

/**
 * An achievement the user has collected (users/{uid}/achievements/{id}, id =
 * the achievement's). Unlocking is derived from the data, like streaks;
 * collecting is the one stored fact, so a card stays once it's in the binder.
 */
export interface CollectedAchievement {
  id: string;
  /** Tracking day it was earned, as worked out when collected. */
  on: string;
  /** What earned it, e.g. "10h 12m of Studying". */
  detail: string | null;
  collectedAt: string;
}

/**
 * A cumulative target on one at_least metric with an end date: "Network+:
 * 120h by 15 Dec". Inputs only — progress, status, pace and achieved date are
 * always derived (lib/goals.ts), never stored. Lives at users/{uid}/goals/{id}.
 */
export interface Goal {
  id: string;
  metricId: string;
  name: string;
  /** True once the user has typed a name; until then it's regenerated from the fields. */
  nameEdited: boolean;
  /** Base unit: seconds for duration, integer for count. */
  targetTotal: number;
  /** Base unit. Work done before startDate that should count. */
  priorProgress: number;
  /** 'YYYY-MM-DD', inclusive. */
  startDate: string;
  /** 'YYYY-MM-DD', inclusive: work logged on the deadline day counts. */
  deadline: string;
  /** Days the user intends to work on it. Affects pace only, not what counts. */
  paceSchedule: Schedule;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CalendarItemKind = 'event' | 'reminder';

/**
 * A calendar event or reminder on one date. Shown in the app only; nothing
 * is ever pushed as a notification. Lives at users/{uid}/items/{id}.
 */
export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  /** 'YYYY-MM-DD' in the configured timezone. */
  localDate: string;
  /** 'HH:mm' wall-clock time, or null for all day. */
  time: string | null;
  note: string | null;
  /** Reminders only: when it was ticked off. */
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Per-day aggregate for one metric. */
export interface DayStat {
  total: number;
  count: number;
}

export type DayStats = Map<string, DayStat>;

/**
 * A Plan: a deadline goal counted in tasks done. Inputs only, like Goal:
 * progress, the current task, pace and the end state are derived
 * (lib/plans.ts). Lives at users/{uid}/plans/{id}; its sections and tasks are
 * their own docs (planSections, planTasks), so ticking two different tasks
 * on two offline devices touches two different records.
 */
export interface Plan {
  id: string;
  name: string;
  /** 'YYYY-MM-DD', inclusive. */
  startDate: string;
  /** 'YYYY-MM-DD', inclusive. May be after the last task's date (a buffer). */
  deadline: string;
  /** Days that count for pace. Default Mon–Fri. */
  schedule: Schedule;
  /** Optional linked metric: its timer's note prompt offers to tick the current task. */
  metricId: string | null;
  color: string;
  icon: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** An ordered group of tasks ("Week 1"), with an optional checkpoint at its end. */
export interface PlanSection {
  id: string;
  planId: string;
  title: string;
  order: number;
  /** A milestone at the end of the section. Doesn't count toward task totals or pace. */
  checkpoint: string | null;
  checkpointDoneAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PlanTask {
  id: string;
  planId: string;
  /** null: not in a section (listed before any sections). */
  sectionId: string | null;
  /** Position within its section. */
  order: number;
  title: string;
  details: string | null;
  /** Only shapes the pace line; never decides what's shown. */
  targetDate: string | null;
  /** When it was ticked; null while undone. */
  doneAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

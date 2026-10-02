export type MetricType = 'duration' | 'count';
export type TargetDirection = 'at_least' | 'at_most';

export type Schedule =
  | { kind: 'daily' }
  | { kind: 'days_of_week'; days: number[] }; // 0 = Sunday

export interface Metric {
  id: string;
  name: string;
  type: MetricType;
  unit: string;
  /** Base unit: seconds for duration, integer for count. null = no target. */
  target: number | null;
  targetDirection: TargetDirection;
  schedule: Schedule;
  timerEnabled: boolean;
  /** Base-unit values for one-tap buttons. */
  quickAdd: number[];
  color: string;
  icon: string;
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
  /** Set once the first-run target walkthrough is finished. */
  onboardedAt: string | null;
  updatedAt: string;
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

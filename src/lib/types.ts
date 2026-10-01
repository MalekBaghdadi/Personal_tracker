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

/** Per-day aggregate for one metric. */
export interface DayStat {
  total: number;
  count: number;
}

export type DayStats = Map<string, DayStat>;

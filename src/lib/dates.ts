import { addDays as addDaysFn, format, parse } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * A localDate is a calendar date string 'YYYY-MM-DD' in the user's configured
 * timezone. Arithmetic on it is pure calendar arithmetic — no instants involved.
 */

const FMT = 'yyyy-MM-dd';

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function localDateOf(instant: Date | string, tz: string): string {
  return formatInTimeZone(typeof instant === 'string' ? new Date(instant) : instant, tz, FMT);
}

/** When the settings don't say: the day rolls over at 5am (Malek's choice; he's often up past midnight). */
export const DEFAULT_DAY_START_HOUR = 5;

/**
 * The tracking day an instant belongs to: its local date in tz, with the day
 * starting at `dayStartHour` instead of midnight. With 5, 01:30 on the 7th
 * still belongs to the 6th.
 */
export function dayOf(instant: Date | string, tz: string, dayStartHour: number): string {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return localDateOf(new Date(ms - dayStartHour * 3_600_000), tz);
}

export function todayIn(tz: string, dayStartHour = 0, now: Date = new Date()): string {
  return dayOf(now, tz, dayStartHour);
}

function toCalendar(localDate: string): Date {
  return parse(localDate, FMT, new Date(2000, 0, 1));
}

export function addDays(localDate: string, n: number): string {
  return format(addDaysFn(toCalendar(localDate), n), FMT);
}

/** 0 = Sunday. */
export function weekdayOf(localDate: string): number {
  return toCalendar(localDate).getDay();
}

export function formatLocalDate(localDate: string, pattern: string): string {
  return format(toCalendar(localDate), pattern);
}

/** The instant corresponding to a wall-clock time on a localDate in tz. */
export function instantAt(localDate: string, time: string, tz: string): Date {
  return fromZonedTime(`${localDate}T${time}`, tz);
}

export function formatTimeIn(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'HH:mm');
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

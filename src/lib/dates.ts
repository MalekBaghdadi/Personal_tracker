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

export function todayIn(tz: string, now: Date = new Date()): string {
  return localDateOf(now, tz);
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

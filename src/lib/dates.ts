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

/** "HH:mm" as 12-hour text. The two 12s get a word, since 12 AM vs 12 PM is what people mix up. */
export function clock12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const text = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return time === '12:00' ? `${text} (noon)` : time === '00:00' ? `${text} (midnight)` : text;
}

/**
 * A moment as plain words: "Wed 4 Nov, 12:00 PM (noon)", or with `label` ("Tomorrow") for the date part.
 * Midnight names both days it sits between, because "Tue 12:00 AM" doesn't say which night.
 */
export function whenText(localDate: string, time: string, label?: string): string {
  if (time === '00:00') return `midnight, ${formatLocalDate(addDays(localDate, -1), 'EEE d')} → ${formatLocalDate(localDate, 'EEE d MMM')}`;
  return label ? `${label} ${clock12(time)}` : `${formatLocalDate(localDate, 'EEE d MMM')}, ${clock12(time)}`;
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

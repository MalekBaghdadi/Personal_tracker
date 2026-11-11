import type { CalendarItem } from './types';

/**
 * What a History calendar cell writes for a day's events and reminders: the first one still open
 * (the day's items arrive sorted, all-day first then by time), else the first; `more` is how many
 * others the day has. Null for a day with nothing.
 */
export function cellItemLine(items: CalendarItem[]): { title: string; more: number; done: boolean } | null {
  if (items.length === 0) return null;
  const isDone = (it: CalendarItem) => it.kind === 'reminder' && !!it.doneAt;
  const shown = items.find((it) => !isDone(it)) ?? items[0];
  return { title: shown.title, more: items.length - 1, done: isDone(shown) };
}

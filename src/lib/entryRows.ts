import type { Entry } from './types';

/**
 * How a day's entries for one metric are listed. Storage is unchanged (one
 * document per logging action, invariant 1); this only merges the display.
 * Quick adds and manual amounts without a note fold into one row; timer
 * sessions and anything with a note keep their own row.
 */
export type EntryRow =
  | { kind: 'entry'; entry: Entry }
  | { kind: 'merged'; entries: Entry[]; total: number };

export function isMergeable(e: Entry): boolean {
  return e.source !== 'timer' && !e.note;
}

const byTime = (a: Entry, b: Entry) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt);

/** Rows in time order; a merged row sits where its earliest entry would. */
export function entryRows(entries: Entry[]): EntryRow[] {
  const sorted = [...entries].sort(byTime);
  const merge = sorted.filter(isMergeable);
  if (merge.length < 2) return sorted.map((entry) => ({ kind: 'entry', entry }));
  const rows: EntryRow[] = [];
  let placed = false;
  for (const e of sorted) {
    if (!isMergeable(e)) rows.push({ kind: 'entry', entry: e });
    else if (!placed) {
      rows.push({ kind: 'merged', entries: merge, total: merge.reduce((s, x) => s + x.value, 0) });
      placed = true;
    }
  }
  return rows;
}

/** "3 quick adds", "2 manual entries", or "4 entries" when mixed. */
export function mergedLabel(entries: Entry[]): string {
  const n = entries.length;
  if (entries.every((e) => e.source === 'quick_add')) return `${n} quick adds`;
  if (entries.every((e) => e.source === 'manual')) return `${n} manual entries`;
  return `${n} entries`;
}

import {
  collection, doc, setDoc, updateDoc, writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './firebase';
import { deviceId, uuid } from './device';
import { localDateOf, nowIso } from './dates';
import type { ActiveTimer, CalendarItem, Entry, EntrySource, Goal, Metric, Settings } from './types';

/**
 * Every write here returns immediately. With the persistent cache, Firestore
 * commits to IndexedDB synchronously enough for the next snapshot to reflect
 * it; the promise only resolves on server ack, which the UI never waits for.
 */
function fire(p: Promise<unknown>): void {
  p.catch((err) => console.error('[repo] write failed', err));
}

const MAX_BATCH = 450;

export const paths = {
  metrics: (uid: string) => collection(db, 'users', uid, 'metrics'),
  metric: (uid: string, id: string) => doc(db, 'users', uid, 'metrics', id),
  entries: (uid: string) => collection(db, 'users', uid, 'entries'),
  entry: (uid: string, id: string) => doc(db, 'users', uid, 'entries', id),
  goals: (uid: string) => collection(db, 'users', uid, 'goals'),
  goal: (uid: string, id: string) => doc(db, 'users', uid, 'goals', id),
  items: (uid: string) => collection(db, 'users', uid, 'items'),
  item: (uid: string, id: string) => doc(db, 'users', uid, 'items', id),
  timer: (uid: string) => doc(db, 'users', uid, 'state', 'timer'),
  settings: (uid: string) => doc(db, 'users', uid, 'state', 'settings'),
};

// ── Entries ────────────────────────────────────────────────────────────────

export interface NewEntry {
  metricId: string;
  value: number;
  source: EntrySource;
  localDate: string;
  occurredAt?: string;
  note?: string | null;
}

export function buildEntry(input: NewEntry): Entry {
  const now = nowIso();
  return {
    id: uuid(),
    metricId: input.metricId,
    localDate: input.localDate,
    value: Math.round(input.value),
    source: input.source,
    note: input.note?.trim() || null,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** One logging action → one new document. Returns the id for undo. */
export function addEntry(uid: string, input: NewEntry): string {
  if (!(input.value > 0)) throw new Error('Entry value must be positive');
  const entry = buildEntry(input);
  fire(setDoc(paths.entry(uid, entry.id), entry));
  return entry.id;
}

export function updateEntry(
  uid: string,
  id: string,
  patch: Partial<Pick<Entry, 'value' | 'localDate' | 'note' | 'occurredAt'>>,
): void {
  // Field-level update, so concurrent edits on two devices merge per field.
  fire(updateDoc(paths.entry(uid, id), { ...patch, updatedAt: nowIso() }));
}

export function softDeleteEntry(uid: string, id: string): void {
  const now = nowIso();
  fire(updateDoc(paths.entry(uid, id), { deletedAt: now, updatedAt: now }));
}

export function restoreEntry(uid: string, id: string): void {
  fire(updateDoc(paths.entry(uid, id), { deletedAt: null, updatedAt: nowIso() }));
}

/** What a subtraction changed, so it can be undone exactly. */
export type SubtractionUndo = { id: string; value: number; deleted: boolean }[];

/**
 * Remove `amount` from a day by trimming its entries, newest first. Entry
 * values stay positive: an entry trimmed to nothing is soft-deleted, never
 * left at zero or negative, so totals and the at_most evidence rule hold.
 * Callers cap `amount` at the day's total.
 */
export function subtractFromDay(uid: string, dayEntries: Entry[], amount: number): SubtractionUndo {
  const newestFirst = [...dayEntries].sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt),
  );
  const batch = writeBatch(db);
  const now = nowIso();
  const undo: SubtractionUndo = [];
  let remaining = Math.round(amount);
  for (const e of newestFirst) {
    if (remaining <= 0) break;
    if (remaining >= e.value) {
      batch.update(paths.entry(uid, e.id), { deletedAt: now, updatedAt: now });
      undo.push({ id: e.id, value: e.value, deleted: true });
      remaining -= e.value;
    } else {
      batch.update(paths.entry(uid, e.id), { value: e.value - remaining, updatedAt: now });
      undo.push({ id: e.id, value: e.value, deleted: false });
      remaining = 0;
    }
  }
  fire(batch.commit());
  return undo;
}

export function undoSubtraction(uid: string, undo: SubtractionUndo): void {
  const batch = writeBatch(db);
  const now = nowIso();
  for (const u of undo) {
    batch.update(paths.entry(uid, u.id), u.deleted ? { deletedAt: null, updatedAt: now } : { value: u.value, updatedAt: now });
  }
  fire(batch.commit());
}

// ── Deadline goals ─────────────────────────────────────────────────────────

/** Inputs only; every derived figure is computed in lib/goals.ts. */
export function saveGoal(uid: string, goal: Goal): void {
  fire(setDoc(paths.goal(uid, goal.id), { ...goal, updatedAt: nowIso() }));
}

export function setGoalArchived(uid: string, id: string, archived: boolean): void {
  const now = nowIso();
  fire(updateDoc(paths.goal(uid, id), { archivedAt: archived ? now : null, updatedAt: now }));
}

// ── Events and reminders ───────────────────────────────────────────────────

export type ItemFields = Pick<CalendarItem, 'kind' | 'title' | 'localDate' | 'time' | 'note'>;

export function addItem(uid: string, fields: ItemFields): string {
  const now = nowIso();
  const item: CalendarItem = {
    ...fields,
    id: uuid(),
    title: fields.title.trim(),
    note: fields.note?.trim() || null,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  fire(setDoc(paths.item(uid, item.id), item));
  return item.id;
}

/** Field-level, like entries: edits on two devices merge per field. */
export function updateItem(uid: string, id: string, patch: Partial<Omit<CalendarItem, 'id' | 'createdAt'>>): void {
  fire(updateDoc(paths.item(uid, id), { ...patch, updatedAt: nowIso() }));
}

export function setItemDone(uid: string, id: string, done: boolean): void {
  updateItem(uid, id, { doneAt: done ? nowIso() : null });
}

export function softDeleteItem(uid: string, id: string): void {
  const now = nowIso();
  fire(updateDoc(paths.item(uid, id), { deletedAt: now, updatedAt: now }));
}

export function restoreItem(uid: string, id: string): void {
  updateItem(uid, id, { deletedAt: null });
}

// ── Timer ──────────────────────────────────────────────────────────────────

/*
 * Race handling (§8.7). Two devices can each start a timer offline; the last
 * write to reach the server wins the single timer doc, which may not be the
 * earlier start. Each device remembers the timer it started ("own"). When the
 * server shows a later timer than own, and own was never closed, the device
 * re-asserts own. Every close (stop, discard, metric delete) writes a marker
 * to state/timerClosed so a timer closed elsewhere is never resurrected.
 */
const OWN_TIMER_KEY = 'pt.ownTimer';

export interface OwnTimer {
  metricId: string;
  startedAt: string;
}

export function ownTimer(): OwnTimer | null {
  try {
    const raw = localStorage.getItem(OWN_TIMER_KEY);
    return raw ? (JSON.parse(raw) as OwnTimer) : null;
  } catch {
    return null;
  }
}

function setOwnTimer(v: OwnTimer | null): void {
  try {
    if (v) localStorage.setItem(OWN_TIMER_KEY, JSON.stringify(v));
    else localStorage.removeItem(OWN_TIMER_KEY);
  } catch {
    /* ignore */
  }
}

export function forgetOwnTimer(): void {
  setOwnTimer(null);
}

export const timerClosedRef = (uid: string) => doc(db, 'users', uid, 'state', 'timerClosed');

function markClosed(batch: ReturnType<typeof writeBatch>, uid: string, startedAt: string): void {
  batch.set(timerClosedRef(uid), { startedAt, closedAt: nowIso() });
}

export function startTimer(uid: string, metricId: string): ActiveTimer {
  const now = nowIso();
  const timer: ActiveTimer = { metricId, startedAt: now, deviceId: deviceId(), updatedAt: now };
  setOwnTimer({ metricId, startedAt: now });
  fire(setDoc(paths.timer(uid), timer));
  return timer;
}

/** Re-assert this device's earlier timer after losing a race. */
export function reassertOwnTimer(uid: string, own: OwnTimer): void {
  fire(setDoc(paths.timer(uid), { ...own, deviceId: deviceId(), updatedAt: nowIso() }));
}

/**
 * Stop: record the entry and clear the timer atomically. The entry belongs to
 * the day the timer started, even across midnight.
 */
export function stopTimer(uid: string, timer: ActiveTimer, seconds: number, tz: string): string | null {
  const batch = writeBatch(db);
  let entryId: string | null = null;
  if (seconds > 0) {
    const entry = buildEntry({
      metricId: timer.metricId,
      value: seconds,
      source: 'timer',
      localDate: localDateOf(timer.startedAt, tz),
      occurredAt: timer.startedAt,
    });
    batch.set(paths.entry(uid, entry.id), entry);
    entryId = entry.id;
  }
  batch.delete(paths.timer(uid));
  markClosed(batch, uid, timer.startedAt);
  setOwnTimer(null);
  fire(batch.commit());
  return entryId;
}

export function discardTimer(uid: string, timer: ActiveTimer): void {
  const batch = writeBatch(db);
  batch.delete(paths.timer(uid));
  markClosed(batch, uid, timer.startedAt);
  setOwnTimer(null);
  fire(batch.commit());
}

// ── Metrics ────────────────────────────────────────────────────────────────

export function saveMetric(uid: string, metric: Metric): void {
  fire(setDoc(paths.metric(uid, metric.id), { ...metric, updatedAt: nowIso() }));
}

export function reorderMetrics(uid: string, orderedIds: string[]): void {
  const batch = writeBatch(db);
  const now = nowIso();
  orderedIds.forEach((id, i) => batch.update(paths.metric(uid, id), { order: i, updatedAt: now }));
  fire(batch.commit());
}

export function setArchived(uid: string, id: string, archived: boolean): void {
  const now = nowIso();
  fire(updateDoc(paths.metric(uid, id), { archivedAt: archived ? now : null, updatedAt: now }));
}

/**
 * Hard delete: remove the metric and soft-delete its entries. Chunked to stay
 * under the 500-operation batch limit; the metric goes in the last batch so a
 * partial failure never leaves orphaned live entries behind a deleted metric.
 */
export function deleteMetric(
  uid: string,
  id: string,
  entryIds: string[],
  runningTimer: ActiveTimer | null,
  goalIds: string[] = [],
): void {
  const now = nowIso();
  const refs: DocumentReference[] = entryIds.map((e) => paths.entry(uid, e));
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += MAX_BATCH) chunks.push(refs.slice(i, i + MAX_BATCH));
  if (chunks.length === 0) chunks.push([]);
  chunks.forEach((chunk, i) => {
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.update(ref, { deletedAt: now, updatedAt: now }));
    if (i === chunks.length - 1) {
      batch.delete(paths.metric(uid, id));
      // A goal without its metric has nothing to count; it goes in the same batch.
      goalIds.forEach((g) => batch.delete(paths.goal(uid, g)));
      if (runningTimer) {
        batch.delete(paths.timer(uid));
        markClosed(batch, uid, runningTimer.startedAt);
        if (ownTimer()?.startedAt === runningTimer.startedAt) setOwnTimer(null);
      }
    }
    fire(batch.commit());
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

export function saveSettings(uid: string, patch: Partial<Settings>): void {
  fire(setDoc(paths.settings(uid), { ...patch, updatedAt: nowIso() }, { merge: true }));
}

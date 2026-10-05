import type { CalendarItem, Entry, Goal, Metric } from './types';

/**
 * Restoring a JSON export. Import only ever adds: a document whose id is
 * already in the account (deleted ones included, so nothing you deleted comes
 * back) is skipped, and nothing existing is changed. A backup metric with the
 * same name and type as an existing one is merged into it, so restoring onto a
 * freshly seeded account doesn't produce a second "Studying". Settings are
 * not imported. Pure; the caller supplies what the server holds.
 */

export interface ExistingData {
  metrics: Metric[];
  /** Every entry id on the server, deleted ones included. */
  entryIds: Set<string>;
  itemIds: Set<string>;
  goals: Goal[];
}

export interface ImportPlan {
  metrics: Metric[];
  entries: Entry[];
  items: CalendarItem[];
  goals: Goal[];
  /** Backup metrics folded into an existing metric of the same name. */
  mergedMetrics: number;
  /** Already in the account (or deleted from it). */
  skipped: { metrics: number; entries: number; items: number; goals: number };
  /** Malformed, or pointing at a metric that isn't there. */
  invalid: number;
  /** Goals imported as archived because their metric already has an active one. */
  archivedGoals: number;
}

export type ImportResult = { ok: true; plan: ImportPlan } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nameKey = (m: Pick<Metric, 'name' | 'type'>) => `${m.type}:${m.name.trim().toLowerCase()}`;

export const NOT_AN_EXPORT = 'This isn’t a Logbook JSON export.';

export function isExport(backup: unknown): backup is Record<string, unknown> & { format: string } {
  return isObj(backup) && typeof backup.format === 'string' && backup.format.startsWith('personal-tracker/');
}

export function planImport(backup: unknown, existing: ExistingData, now: string): ImportResult {
  if (!isExport(backup)) return { ok: false, error: NOT_AN_EXPORT };

  const plan: ImportPlan = {
    metrics: [], entries: [], items: [], goals: [],
    mergedMetrics: 0, skipped: { metrics: 0, entries: 0, items: 0, goals: 0 }, invalid: 0, archivedGoals: 0,
  };

  // ── Metrics: backup id → id in the account ──
  const byId = new Map(existing.metrics.map((m) => [m.id, m]));
  const byName = new Map(existing.metrics.map((m) => [nameKey(m), m]));
  const resolved = new Map<string, Metric>();
  let order = existing.metrics.reduce((max, m) => Math.max(max, m.order), -1);

  for (const raw of arr(backup.metrics)) {
    if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || (raw.type !== 'duration' && raw.type !== 'count') || !isObj(raw.schedule)) {
      plan.invalid++;
      continue;
    }
    const m = raw as unknown as Metric;
    const same = byId.get(m.id);
    if (same) {
      resolved.set(m.id, same);
      plan.skipped.metrics++;
      continue;
    }
    const named = byName.get(nameKey(m));
    if (named) {
      resolved.set(m.id, named);
      plan.mergedMetrics++;
      continue;
    }
    const metric: Metric = {
      ...m,
      unit: typeof m.unit === 'string' ? m.unit : '',
      target: typeof m.target === 'number' ? m.target : null,
      targetDirection: m.targetDirection === 'at_most' ? 'at_most' : 'at_least',
      timerEnabled: m.type === 'duration' && m.timerEnabled !== false,
      quickAdd: Array.isArray(m.quickAdd) ? m.quickAdd.filter((v) => typeof v === 'number' && v > 0) : [],
      order: ++order,
      archivedAt: strOrNull(m.archivedAt),
      createdAt: isStr(m.createdAt) ? m.createdAt : now,
      updatedAt: now,
    };
    plan.metrics.push(metric);
    resolved.set(m.id, metric);
    byName.set(nameKey(metric), metric);
  }
  // Entries may also point at metrics already in the account by id.
  const metricFor = (id: unknown) => (isStr(id) ? resolved.get(id) ?? byId.get(id) : undefined);

  // ── Entries ──
  const seenEntries = new Set(existing.entryIds);
  for (const raw of arr(backup.entries)) {
    if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.localDate) || !DATE.test(raw.localDate) || typeof raw.value !== 'number' || !(raw.value > 0)) {
      plan.invalid++;
      continue;
    }
    if (seenEntries.has(raw.id)) {
      plan.skipped.entries++;
      continue;
    }
    const metric = metricFor(raw.metricId);
    if (!metric) {
      plan.invalid++;
      continue;
    }
    seenEntries.add(raw.id);
    const e = raw as unknown as Entry;
    plan.entries.push({
      id: e.id,
      metricId: metric.id,
      localDate: e.localDate,
      value: Math.round(e.value),
      source: e.source === 'timer' || e.source === 'quick_add' ? e.source : 'manual',
      note: strOrNull(e.note),
      occurredAt: isStr(e.occurredAt) ? e.occurredAt : `${e.localDate}T12:00:00.000Z`,
      createdAt: isStr(e.createdAt) ? e.createdAt : now,
      updatedAt: now,
      // Always written explicitly: the live queries filter on deletedAt == null.
      deletedAt: null,
    });
  }

  // ── Events and reminders ──
  const seenItems = new Set(existing.itemIds);
  for (const raw of arr(backup.items)) {
    if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.title) || (raw.kind !== 'event' && raw.kind !== 'reminder') || !isStr(raw.localDate) || !DATE.test(raw.localDate)) {
      plan.invalid++;
      continue;
    }
    if (seenItems.has(raw.id)) {
      plan.skipped.items++;
      continue;
    }
    seenItems.add(raw.id);
    const it = raw as unknown as CalendarItem;
    plan.items.push({
      id: it.id,
      kind: it.kind,
      title: it.title,
      localDate: it.localDate,
      time: typeof it.time === 'string' && /^\d{2}:\d{2}$/.test(it.time) ? it.time : null,
      note: strOrNull(it.note),
      doneAt: it.kind === 'reminder' ? strOrNull(it.doneAt) : null,
      createdAt: isStr(it.createdAt) ? it.createdAt : now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // ── Goals: one active goal per metric ──
  const goalIds = new Set(existing.goals.map((g) => g.id));
  const activeOn = new Set(existing.goals.filter((g) => !g.archivedAt).map((g) => g.metricId));
  for (const raw of arr(backup.goals)) {
    if (
      !isObj(raw) || !isStr(raw.id) || typeof raw.targetTotal !== 'number' || !(raw.targetTotal > 0) ||
      !isStr(raw.startDate) || !DATE.test(raw.startDate) || !isStr(raw.deadline) || !DATE.test(raw.deadline) || raw.deadline < raw.startDate
    ) {
      plan.invalid++;
      continue;
    }
    if (goalIds.has(raw.id)) {
      plan.skipped.goals++;
      continue;
    }
    const metric = metricFor(raw.metricId);
    if (!metric || metric.targetDirection !== 'at_least') {
      plan.invalid++;
      continue;
    }
    goalIds.add(raw.id);
    const g = raw as unknown as Goal;
    let archivedAt = strOrNull(g.archivedAt);
    if (!archivedAt && activeOn.has(metric.id)) {
      archivedAt = now;
      plan.archivedGoals++;
    }
    if (!archivedAt) activeOn.add(metric.id);
    plan.goals.push({
      id: g.id,
      metricId: metric.id,
      name: isStr(g.name) ? g.name : 'Goal',
      nameEdited: g.nameEdited === true,
      targetTotal: g.targetTotal,
      priorProgress: typeof g.priorProgress === 'number' && g.priorProgress > 0 ? g.priorProgress : 0,
      startDate: g.startDate,
      deadline: g.deadline,
      paceSchedule: isObj(g.paceSchedule) ? g.paceSchedule : { kind: 'daily' },
      archivedAt,
      createdAt: isStr(g.createdAt) ? g.createdAt : now,
      updatedAt: now,
    });
  }

  return { ok: true, plan };
}

export function importIsEmpty(p: ImportPlan): boolean {
  return p.metrics.length + p.entries.length + p.items.length + p.goals.length === 0;
}

import type { CalendarItem, CollectedAchievement, Entry, Goal, Metric, Plan, PlanSection, PlanTask, Review, Settings } from './types';

/** Plans travel together: the plan docs, their sections and tasks. */
export interface PlanExport {
  plans: Plan[];
  planSections: PlanSection[];
  planTasks: PlanTask[];
}

function download(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportJson(
  metrics: Metric[],
  entries: Entry[],
  items: CalendarItem[],
  goals: Goal[],
  settings: Settings | null,
  plans?: PlanExport,
  achievements: CollectedAchievement[] = [],
  reviews: Review[] = [],
): void {
  const payload = {
    format: 'personal-tracker/1',
    exportedAt: new Date().toISOString(),
    units: { duration: 'seconds', count: 'integer' },
    settings,
    metrics,
    entries,
    items,
    // Raw inputs only; progress and status are derived, never exported.
    goals,
    plans: plans?.plans ?? [],
    planSections: plans?.planSections ?? [],
    planTasks: plans?.planTasks ?? [],
    // Collected cards only; what's unlocked is worked out from the data.
    achievements,
    // Phrase reviews; the phrases themselves are entries with text.
    reviews,
  };
  download(`logbook-${stamp()}.json`, 'application/json', JSON.stringify(payload, null, 2));
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function entriesCsv(metrics: Metric[], entries: Entry[]): string {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const header = ['entry_id', 'local_date', 'metric', 'metric_id', 'metric_archived', 'type', 'value', 'value_unit', 'source', 'occurred_at', 'note', 'phrase', 'reference', 'created_at', 'updated_at'];
  const rows = [...entries]
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.occurredAt.localeCompare(b.occurredAt))
    .map((e) => {
      const m = byId.get(e.metricId);
      return [
        e.id, e.localDate, m?.name ?? '', e.metricId, m?.archivedAt ? 'yes' : 'no', m?.type ?? '',
        e.value, m?.type === 'duration' ? 'seconds' : m?.type === 'check' ? 'done' : m?.type === 'phrase' ? 'phrases' : (m?.unit ?? ''), e.source, e.occurredAt,
        e.note, e.text ?? '', e.reference ?? '', e.createdAt, e.updatedAt,
      ];
    });
  return toCsv([header, ...rows]);
}

export function metricsCsv(metrics: Metric[]): string {
  const header = ['metric_id', 'name', 'type', 'unit', 'target', 'target_direction', 'target_min', 'schedule', 'timer_enabled', 'quick_add', 'color', 'icon', 'order', 'archived_at', 'created_at', 'updated_at'];
  const rows = metrics.map((m) => [
    m.id, m.name, m.type, m.unit, m.target, m.targetDirection, m.targetMin ?? null,
    m.schedule.kind === 'daily' ? 'daily' : `days:${m.schedule.days.join(' ')}`,
    m.timerEnabled, m.quickAdd.join(' '), m.color, m.icon, m.order, m.archivedAt, m.createdAt, m.updatedAt,
  ]);
  return toCsv([header, ...rows]);
}

export function itemsCsv(items: CalendarItem[]): string {
  const header = ['item_id', 'kind', 'local_date', 'time', 'title', 'note', 'done_at', 'created_at', 'updated_at'];
  const rows = [...items]
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.time ?? '').localeCompare(b.time ?? ''))
    .map((i) => [i.id, i.kind, i.localDate, i.time, i.title, i.note, i.doneAt, i.createdAt, i.updatedAt]);
  return toCsv([header, ...rows]);
}

export function goalsCsv(metrics: Metric[], goals: Goal[]): string {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const header = ['goal_id', 'name', 'metric', 'metric_id', 'target_total', 'prior_progress', 'value_unit', 'start_date', 'deadline', 'pace_schedule', 'archived_at', 'created_at', 'updated_at'];
  const rows = goals.map((g) => {
    const m = byId.get(g.metricId);
    return [
      g.id, g.name, m?.name ?? '', g.metricId, g.targetTotal, g.priorProgress,
      m?.type === 'duration' ? 'seconds' : (m?.unit ?? ''), g.startDate, g.deadline,
      g.paceSchedule.kind === 'daily' ? 'daily' : `days:${g.paceSchedule.days.join(' ')}`,
      g.archivedAt, g.createdAt, g.updatedAt,
    ];
  });
  return toCsv([header, ...rows]);
}

/** One row per task: plan, section, task, target date, done date and note. */
export function tasksCsv(p: PlanExport, dayOf: (iso: string) => string): string {
  const plans = new Map(p.plans.map((x) => [x.id, x]));
  const sections = new Map(p.planSections.map((x) => [x.id, x]));
  const header = ['task_id', 'plan', 'plan_id', 'section', 'position', 'task', 'details', 'target_date', 'done_date', 'done_at', 'note', 'created_at', 'updated_at'];
  const rows = [...p.planTasks]
    .sort((a, b) => a.planId.localeCompare(b.planId) || (sections.get(a.sectionId ?? '')?.order ?? -1) - (sections.get(b.sectionId ?? '')?.order ?? -1) || a.order - b.order)
    .map((t) => [
      t.id, plans.get(t.planId)?.name ?? '', t.planId, sections.get(t.sectionId ?? '')?.title ?? '', t.order, t.title, t.details,
      t.targetDate, t.doneAt ? dayOf(t.doneAt) : '', t.doneAt, t.note, t.createdAt, t.updatedAt,
    ]);
  return toCsv([header, ...rows]);
}

export function exportCsv(metrics: Metric[], entries: Entry[], items: CalendarItem[], goals: Goal[], plans?: PlanExport, dayOf?: (iso: string) => string): void {
  download(`logbook-entries-${stamp()}.csv`, 'text/csv', entriesCsv(metrics, entries));
  // Separate file so each CSV is a plain rectangular table.
  setTimeout(() => download(`logbook-metrics-${stamp()}.csv`, 'text/csv', metricsCsv(metrics)), 300);
  setTimeout(() => download(`logbook-calendar-${stamp()}.csv`, 'text/csv', itemsCsv(items)), 600);
  setTimeout(() => download(`logbook-goals-${stamp()}.csv`, 'text/csv', goalsCsv(metrics, goals)), 900);
  if (plans && dayOf && plans.planTasks.length) setTimeout(() => download(`logbook-plan-tasks-${stamp()}.csv`, 'text/csv', tasksCsv(plans, dayOf)), 1200);
}

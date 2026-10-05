import { describe, expect, it } from 'vitest';
import { importIsEmpty, planImport, type ExistingData } from './importer';
import type { Goal, Metric } from './types';

const NOW = '2026-10-06T12:00:00.000Z';

function metric(id: string, name: string, over: Partial<Metric> = {}): Metric {
  return {
    id, name, type: 'duration', unit: '', target: 3600, targetDirection: 'at_least', schedule: { kind: 'daily' },
    timerEnabled: true, quickAdd: [900], color: '#fff', icon: 'book', order: 0, archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over,
  };
}
const entry = (id: string, metricId: string, value = 600, over: Record<string, unknown> = {}) => ({
  id, metricId, localDate: '2026-09-01', value, source: 'timer', note: null, occurredAt: '2026-09-01T10:00:00Z',
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', deletedAt: null, ...over,
});
const goal = (id: string, metricId: string, over: Partial<Goal> = {}): Goal => ({
  id, metricId, name: 'G', nameEdited: false, targetTotal: 360000, priorProgress: 0, startDate: '2026-09-01',
  deadline: '2026-12-15', paceSchedule: { kind: 'daily' }, archivedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
});
const empty = (over: Partial<ExistingData> = {}): ExistingData => ({ metrics: [], entryIds: new Set(), itemIds: new Set(), goals: [], ...over });
const backup = (o: Record<string, unknown>) => ({ format: 'personal-tracker/1', metrics: [], entries: [], items: [], goals: [], ...o });

function plan(b: unknown, e: ExistingData) {
  const r = planImport(b, e, NOW);
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe('planImport', () => {
  it('rejects files that are not exports', () => {
    expect(planImport({ hello: 1 }, empty(), NOW).ok).toBe(false);
    expect(planImport([], empty(), NOW).ok).toBe(false);
  });

  it('into an empty account: everything is added, deletedAt written as null', () => {
    const p = plan(backup({
      metrics: [metric('m1', 'Studying')],
      entries: [entry('e1', 'm1'), entry('e2', 'm1', 300, { note: 'Ch 3' })],
      items: [{ id: 'i1', kind: 'reminder', title: 'Book exam', localDate: '2026-10-10', time: null, note: null, doneAt: null }],
      goals: [goal('g1', 'm1')],
    }), empty());
    expect(p.metrics.map((m) => m.id)).toEqual(['m1']);
    expect(p.entries.map((e) => [e.id, e.note, e.deletedAt])).toEqual([['e1', null, null], ['e2', 'Ch 3', null]]);
    expect(p.items[0].deletedAt).toBeNull();
    expect(p.goals).toHaveLength(1);
    expect(importIsEmpty(p)).toBe(false);
  });

  it('skips ids already in the account, including deleted ones', () => {
    const p = plan(
      backup({ metrics: [metric('m1', 'Studying')], entries: [entry('e1', 'm1'), entry('gone', 'm1'), entry('e3', 'm1')] }),
      empty({ metrics: [metric('m1', 'Studying')], entryIds: new Set(['e1', 'gone']) }),
    );
    expect(p.metrics).toEqual([]);
    expect(p.skipped).toMatchObject({ metrics: 1, entries: 2 });
    expect(p.entries.map((e) => e.id)).toEqual(['e3']);
  });

  it('merges a metric with the same name and type into the existing one', () => {
    const seeded = metric('new-id', 'Studying', { order: 4 });
    const p = plan(
      backup({ metrics: [metric('old-id', ' studying '), metric('old-cal', 'Calories', { type: 'count' })], entries: [entry('e1', 'old-id')] }),
      empty({ metrics: [seeded, metric('x', 'Calories')] }), // duration "Calories" doesn't match a count one
    );
    expect(p.mergedMetrics).toBe(1);
    expect(p.entries[0].metricId).toBe('new-id');
    expect(p.metrics.map((m) => [m.name, m.order])).toEqual([['Calories', 5]]);
  });

  it('drops malformed rows and entries whose metric is missing', () => {
    const p = plan(backup({
      metrics: [metric('m1', 'A')],
      entries: [entry('bad', 'm1', 0), entry('neg', 'm1', -5), entry('orphan', 'nope'), { id: 'x' }, entry('ok', 'm1')],
    }), empty());
    expect(p.entries.map((e) => e.id)).toEqual(['ok']);
    expect(p.invalid).toBe(4);
  });

  it('keeps one active goal per metric by archiving the incoming one', () => {
    const p = plan(
      backup({ metrics: [metric('m1', 'A')], goals: [goal('g2', 'm1'), goal('g3', 'm1', { archivedAt: '2026-09-01T00:00:00Z' })] }),
      empty({ metrics: [metric('m1', 'A')], goals: [goal('g1', 'm1')] }),
    );
    expect(p.goals.map((g) => [g.id, g.archivedAt])).toEqual([['g2', NOW], ['g3', '2026-09-01T00:00:00Z']]);
    expect(p.archivedGoals).toBe(1);
  });

  it('a goal on a ceiling metric is invalid', () => {
    const p = plan(backup({ metrics: [metric('k', 'Calories', { type: 'count', targetDirection: 'at_most' })], goals: [goal('g', 'k')] }), empty());
    expect(p.goals).toEqual([]);
    expect(p.invalid).toBe(1);
  });

  it('importing the same backup twice adds nothing the second time', () => {
    const b = backup({ metrics: [metric('m1', 'A')], entries: [entry('e1', 'm1')], goals: [goal('g1', 'm1')] });
    const first = plan(b, empty());
    const second = plan(b, empty({ metrics: first.metrics, entryIds: new Set(first.entries.map((e) => e.id)), goals: first.goals }));
    expect(importIsEmpty(second)).toBe(true);
  });
});

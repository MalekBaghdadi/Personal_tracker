import { describe, expect, it } from 'vitest';
import { entryRows, mergedLabel } from './entryRows';
import type { Entry } from './types';

let n = 0;
function entry(value: number, time: string, patch: Partial<Entry> = {}): Entry {
  n++;
  return {
    id: `e${n}`,
    metricId: 'm',
    localDate: '2026-10-06',
    value,
    source: 'quick_add',
    note: null,
    occurredAt: `2026-10-06T${time}:00.000Z`,
    createdAt: `2026-10-06T${time}:00.000Z`,
    updatedAt: `2026-10-06T${time}:00.000Z`,
    deletedAt: null,
    ...patch,
  };
}

describe('entryRows', () => {
  it('merges several quick adds into one row with their sum', () => {
    const rows = entryRows([entry(500, '08:10'), entry(250, '12:40'), entry(100, '19:05')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'merged', total: 850 });
  });

  it('leaves a single entry as its own row', () => {
    const rows = entryRows([entry(500, '08:10')]);
    expect(rows).toEqual([{ kind: 'entry', entry: expect.objectContaining({ value: 500 }) }]);
  });

  it('merges manual amounts with quick adds', () => {
    const rows = entryRows([entry(500, '08:10'), entry(300, '09:00', { source: 'manual' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'merged', total: 800 });
  });

  it('keeps timer sessions and noted entries separate, in time order', () => {
    const timer = entry(1800, '07:00', { source: 'timer' });
    const noted = entry(600, '13:00', { source: 'manual', note: 'chapter 3' });
    const rows = entryRows([entry(900, '10:00'), noted, timer, entry(900, '15:00')]);
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'merged', 'entry']);
    expect(rows[0]).toMatchObject({ entry: { id: timer.id } });
    expect(rows[1]).toMatchObject({ total: 1800 });
    expect(rows[2]).toMatchObject({ entry: { id: noted.id } });
  });

  it('does not merge when only one entry is mergeable', () => {
    const rows = entryRows([entry(1800, '07:00', { source: 'timer' }), entry(900, '10:00')]);
    expect(rows.every((r) => r.kind === 'entry')).toBe(true);
  });
});

describe('mergedLabel', () => {
  it('names the source when they all share it', () => {
    expect(mergedLabel([entry(1, '01:00'), entry(1, '02:00')])).toBe('2 quick adds');
    expect(mergedLabel([entry(1, '01:00', { source: 'manual' }), entry(1, '02:00', { source: 'manual' })])).toBe('2 manual entries');
    expect(mergedLabel([entry(1, '01:00'), entry(1, '02:00', { source: 'manual' })])).toBe('2 entries');
  });
});

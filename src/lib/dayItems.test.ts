import { describe, expect, it } from 'vitest';
import { cellItemLine } from './dayItems';
import type { CalendarItem } from './types';

function item(over: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'i', kind: 'event', title: 'Dentist', localDate: '2026-12-15', time: null, note: null, doneAt: null,
    createdAt: '2026-12-01T00:00:00Z', updatedAt: '2026-12-01T00:00:00Z', deletedAt: null, ...over,
  };
}

describe('cellItemLine', () => {
  it('a day with nothing has no line', () => {
    expect(cellItemLine([])).toBeNull();
  });
  it('one item shows its title and nothing more', () => {
    expect(cellItemLine([item({ title: 'Flight to Paris' })])).toEqual({ title: 'Flight to Paris', more: 0, done: false });
  });
  it('shows the first item and counts the rest', () => {
    const line = cellItemLine([item({ title: 'Flight' }), item({ id: 'b', title: 'Dentist' }), item({ id: 'c', kind: 'reminder', title: 'Passport' })]);
    expect(line).toEqual({ title: 'Flight', more: 2, done: false });
  });
  it('skips a ticked-off reminder for one that is still open', () => {
    const line = cellItemLine([item({ kind: 'reminder', title: 'Pay rent', doneAt: '2026-12-15T08:00:00Z' }), item({ id: 'b', title: 'Dentist' })]);
    expect(line).toEqual({ title: 'Dentist', more: 1, done: false });
  });
  it('when everything is ticked off it shows the first, marked done', () => {
    const line = cellItemLine([
      item({ kind: 'reminder', title: 'Pay rent', doneAt: '2026-12-15T08:00:00Z' }),
      item({ id: 'b', kind: 'reminder', title: 'Call mum', doneAt: '2026-12-15T09:00:00Z' }),
    ]);
    expect(line).toEqual({ title: 'Pay rent', more: 1, done: true });
  });
  it('an event is never done, even with a stray doneAt', () => {
    expect(cellItemLine([item({ doneAt: '2026-12-15T08:00:00Z' })])?.done).toBe(false);
  });
});

import { useMemo, useRef } from 'react';
import { Check, Circle } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addEntry, softDeleteEntry, subtractFromDay, undoSubtraction } from '../lib/repo';
import { instantAt } from '../lib/dates';
import { cx } from './ui';
import type { Metric } from '../lib/types';

/**
 * A check metric's one control: tap to mark the day done, tap again to undo.
 * Done is one entry of 1; unticking soft-deletes everything logged that day
 * (two taps from two offline devices, or the minutes of a metric switched to
 * check), so the day is cleanly not done again. Each tap reports a message
 * and an undo; Today shows it in the toast, the Yesterday sheet inline.
 */
export function CheckButton({
  metric,
  date,
  onDone,
  suffix = '',
  tour,
}: {
  metric: Metric;
  date: string;
  onDone: (text: string, undo: () => void) => void;
  /** Spoken after the name, e.g. " yesterday". */
  suffix?: string;
  tour?: string;
}) {
  const { uid, entries, today, tz } = useData();
  const hue = useHue(metric.color);
  const dayEntries = useMemo(() => entries.filter((e) => e.metricId === metric.id && e.localDate === date), [entries, metric.id, date]);
  const done = dayEntries.length > 0;
  const lastTap = useRef(0);

  const toggle = () => {
    // UI-only guard against an accidental double tap, as on the quick-add chips.
    const now = Date.now();
    if (now - lastTap.current < 350) return;
    lastTap.current = now;
    if (!done) {
      const occurredAt = date === today ? new Date().toISOString() : instantAt(date, '12:00:00', tz).toISOString();
      const id = addEntry(uid, { metricId: metric.id, value: 1, source: 'manual', localDate: date, occurredAt });
      onDone(`${metric.name} done${suffix}`, () => softDeleteEntry(uid, id));
    } else {
      const undo = subtractFromDay(uid, dayEntries, dayEntries.reduce((s, e) => s + e.value, 0));
      onDone(`${metric.name} unchecked${suffix}`, () => undoSubtraction(uid, undo));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-tour={tour}
      aria-pressed={done}
      aria-label={done ? `${metric.name} done${suffix}. Tap to undo` : `Mark ${metric.name} done${suffix}`}
      className={cx('press inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[15px] font-medium', !done && 'bg-s2 text-ink hover:bg-s3')}
      style={done ? { background: hue, color: '#0e1420' } : undefined}
    >
      {done ? <Check size={18} strokeWidth={2.8} aria-hidden /> : <Circle size={18} aria-hidden />}
      {done ? 'Done' : 'Mark done'}
    </button>
  );
}

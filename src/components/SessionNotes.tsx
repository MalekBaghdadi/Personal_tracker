import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useData } from '../state/DataContext';
import { formatLocalDate } from '../lib/dates';
import { formatValue } from '../lib/format';
import { EntrySheet, type EntrySheetState } from './EntrySheet';
import type { Metric } from '../lib/types';

const SHOWN = 5;

/**
 * Entries of one metric that carry a note, newest first: a journal of what
 * each session was for. `from`/`to` are inclusive localDates. Tapping a note
 * opens the entry to edit it.
 */
export function SessionNotes({
  metric,
  from,
  to,
  title = 'Session notes',
  emptyHint,
}: {
  metric: Metric;
  from?: string;
  to?: string;
  title?: string;
  /** Shown when there are no notes; without it the section is hidden. */
  emptyHint?: string;
}) {
  const { entries, today } = useData();
  const [all, setAll] = useState(false);
  const [edit, setEdit] = useState<EntrySheetState | null>(null);

  const notes = useMemo(
    () =>
      entries
        .filter((e) => e.metricId === metric.id && e.note && (!from || e.localDate >= from) && (!to || e.localDate <= to))
        .sort((a, b) => b.localDate.localeCompare(a.localDate) || b.occurredAt.localeCompare(a.occurredAt)),
    [entries, metric.id, from, to],
  );

  if (notes.length === 0 && !emptyHint) return null;
  const shown = all ? notes : notes.slice(0, SHOWN);
  const headingId = `notes-${metric.id}`;

  return (
    <section className="mt-6" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-[15px] font-medium">
        {title}
        {notes.length > 0 && <span className="font-normal text-ink-3"> · {notes.length}</span>}
      </h2>
      {notes.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-3">{emptyHint}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEdit({ mode: 'edit', metric, entry: e })}
                className="flex min-h-12 w-full items-start gap-3 py-2.5 text-left hover:bg-s2/50"
              >
                <span className="w-20 shrink-0 pt-px text-[13px] text-ink-3">
                  {formatLocalDate(e.localDate, e.localDate.slice(0, 4) === today.slice(0, 4) ? 'EEE d MMM' : 'd MMM yyyy')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] break-words">{e.note}</span>
                  <span className="block text-[13px] text-ink-3">{formatValue(metric, e.value)}</span>
                </span>
                <Pencil size={15} className="mt-1 shrink-0 text-ink-3" aria-label="Edit" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {notes.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-11 text-[14px] font-medium text-ink-2 hover:text-ink">
          {all ? 'Show fewer' : `Show all ${notes.length}`}
        </button>
      )}
      <EntrySheet state={edit} onClose={() => setEdit(null)} />
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Button, FieldError, Label, Sheet, inputClass, useToast } from './ui';
import { CountInput, DurationInput, parseCount, parseDuration, splitDuration } from './inputs';
import { useData } from '../state/DataContext';
import { addEntry, restoreEntry, softDeleteEntry, subtractFromDay, undoSubtraction, updateEntry } from '../lib/repo';
import { formatTimeIn, instantAt } from '../lib/dates';
import { formatDuration, formatValue } from '../lib/format';
import type { Entry, Metric } from '../lib/types';

const LONG_DURATION_S = 12 * 3600;

export type EntrySheetState =
  | { mode: 'add'; metric: Metric; date?: string; subtract?: boolean }
  | { mode: 'edit'; metric: Metric; entry: Entry };

/**
 * Manual add and edit share one form. Edits are field-level updates, so a
 * correction on one device and a different correction on another both land.
 */
export function EntrySheet({ state, onClose }: { state: EntrySheetState | null; onClose: () => void }) {
  return (
    <Sheet
      open={state !== null}
      onClose={onClose}
      title={
        !state ? ''
          : state.mode === 'edit' ? `Edit ${state.metric.name} entry`
          : state.subtract ? `Subtract from ${state.metric.name}`
          : `Add to ${state.metric.name}`
      }
    >
      {state && <EntryForm key={state.mode === 'edit' ? state.entry.id : `${state.metric.id}-${state.date}-${state.subtract ? 'sub' : 'add'}`} state={state} onDone={onClose} />}
    </Sheet>
  );
}

function EntryForm({ state, onDone }: { state: EntrySheetState; onDone: () => void }) {
  const { uid, tz, today, entries } = useData();
  const toast = useToast();
  const metric = state.metric;
  const existing = state.mode === 'edit' ? state.entry : null;
  const isDuration = metric.type === 'duration';

  const initial = existing ? splitDuration(existing.value) : { hours: '', minutes: '' };
  const [hours, setHours] = useState(initial.hours);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [count, setCount] = useState(existing && !isDuration ? String(existing.value) : '');
  const [date, setDate] = useState(existing?.localDate ?? (state.mode === 'add' ? state.date : undefined) ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmLong, setConfirmLong] = useState(false);
  // Set by the row's +/− toggle; the sheet itself has no switch.
  const subtracting = state.mode === 'add' && state.subtract === true;

  const value = isDuration ? parseDuration(hours, minutes) : parseCount(count);
  useEffect(() => setConfirmLong(false), [hours, minutes]);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.metricId === metric.id && e.localDate === date),
    [entries, metric.id, date],
  );
  const dayTotal = dayEntries.reduce((s, e) => s + e.value, 0);

  const submit = () => {
    if (!Number.isFinite(value) || value <= 0) {
      setError(isDuration ? 'Enter a duration above zero.' : `Enter a whole number of ${metric.unit} above zero.`);
      return;
    }
    if (!date) {
      setError('Choose a date.');
      return;
    }

    if (subtracting) {
      if (dayTotal === 0) {
        setError('Nothing is logged on this day, so there’s nothing to subtract.');
        return;
      }
      if (value > dayTotal) {
        setError(`Only ${formatValue(metric, dayTotal)} is logged on this day.`);
        return;
      }
      const undo = subtractFromDay(uid, dayEntries, value);
      toast(`Removed ${formatValue(metric, value)} from ${metric.name}`, { label: 'Undo', run: () => undoSubtraction(uid, undo) });
      onDone();
      return;
    }

    if (isDuration && value > LONG_DURATION_S && !confirmLong && (!existing || existing.value !== value)) {
      setConfirmLong(true);
      return;
    }

    if (existing) {
      const patch: Parameters<typeof updateEntry>[2] = {};
      if (value !== existing.value) patch.value = value;
      if (date !== existing.localDate) {
        patch.localDate = date;
        // Keep the time of day, move the calendar day.
        patch.occurredAt = instantAt(date, formatTimeIn(existing.occurredAt, tz) + ':00', tz).toISOString();
      }
      const n = note.trim() || null;
      if (n !== existing.note) patch.note = n;
      if (Object.keys(patch).length) updateEntry(uid, existing.id, patch);
      onDone();
      return;
    }

    // Past dates get a midday timestamp; today gets "now".
    const occurredAt = date === today ? new Date().toISOString() : instantAt(date, '12:00:00', tz).toISOString();
    const id = addEntry(uid, { metricId: metric.id, value, source: 'manual', localDate: date, occurredAt, note });
    toast(`Logged ${formatValue(metric, value)} to ${metric.name}`, { label: 'Undo', run: () => softDeleteEntry(uid, id) });
    onDone();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-2 flex flex-col gap-4"
    >
      <div>
        <Label htmlFor={isDuration ? 'entry-m' : 'entry-count'}>
          {subtracting ? (isDuration ? 'Time to remove' : 'Amount to remove') : isDuration ? 'Duration' : 'Amount'}
        </Label>
        {isDuration ? (
          <DurationInput idPrefix="entry" hours={hours} minutes={minutes} onHours={(v) => { setHours(v); setError(null); }} onMinutes={(v) => { setMinutes(v); setError(null); }} autoFocus />
        ) : (
          <CountInput id="entry-count" value={count} onChange={(v) => { setCount(v); setError(null); }} unit={metric.unit} autoFocus />
        )}
        <FieldError>{error}</FieldError>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="entry-date">Date</Label>
          <input id="entry-date" type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        {existing ? (
          <div>
            <Label>Logged</Label>
            <p className="flex min-h-11 items-center text-[15px] text-ink-2">
              {sourceLabel(existing.source)} · {formatTimeIn(existing.occurredAt, tz)}
            </p>
          </div>
        ) : subtracting ? (
          <div>
            <Label>Logged that day</Label>
            <p className="flex min-h-11 items-center text-[15px] font-medium">{formatValue(metric, dayTotal)}</p>
          </div>
        ) : null}
      </div>

      {subtracting ? (
        <p className="text-[13px] text-ink-3">Takes the time off that day’s most recent entries. An entry trimmed to nothing is removed.</p>
      ) : (
        <div>
          <Label htmlFor="entry-note">Note</Label>
          <input id="entry-note" className={inputClass} value={note} maxLength={280} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {confirmLong && (
        <p role="alert" className="rounded-lg bg-s2 px-3 py-2.5 text-[14px] text-ink-2">
          That's {formatDuration(value)} in one entry. Tap again to confirm.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">
          {subtracting
            ? value > 0 ? `Subtract ${formatValue(metric, value)}` : 'Subtract'
            : confirmLong ? `Yes, log ${formatDuration(value)}` : existing ? 'Save changes' : 'Log it'}
        </Button>
        {existing && (
          <Button
            variant="danger"
            onClick={() => {
              softDeleteEntry(uid, existing.id);
              toast('Entry deleted', { label: 'Undo', run: () => restoreEntry(uid, existing.id) });
              onDone();
            }}
          >
            Delete entry
          </Button>
        )}
      </div>
    </form>
  );
}

export function sourceLabel(s: Entry['source']): string {
  return s === 'timer' ? 'Timer' : s === 'quick_add' ? 'Quick add' : 'Manual';
}

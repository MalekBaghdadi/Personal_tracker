import { useMemo, useRef, useState } from 'react';
import { Keyboard, Minus, Plus } from 'lucide-react';
import { statsFor, useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addEntry, softDeleteEntry, subtractFromDay, undoSubtraction } from '../lib/repo';
import { addDays, formatLocalDate } from '../lib/dates';
import { isHit, isScheduled, streakDays } from '../lib/streaks';
import { formatChip, formatValue } from '../lib/format';
import { iconFor } from '../lib/icons';
import { EntrySheet, type EntrySheetState } from './EntrySheet';
import { Sheet, cx } from './ui';
import type { Metric } from '../lib/types';

type Notice = { text: string; undo?: () => void; id: number };

/**
 * Catch up on yesterday from Today: every metric scheduled yesterday, with its
 * total and the same +/−, quick-add and custom controls. Entries land on
 * yesterday's date, so streaks recompute on their own; a row says when a
 * little more would rejoin a streak the miss broke. Undo lives inside the
 * sheet, because the app's toast sits behind a modal.
 */
export function YesterdaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { metrics, today } = useData();
  const yesterday = addDays(today, -1);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [entry, setEntry] = useState<EntrySheetState | null>(null);

  // Like Today: only what was scheduled yesterday.
  const ordered = metrics.filter((m) => !m.archivedAt && isScheduled(m.schedule, yesterday));
  const show = (text: string, undo?: () => void) => setNotice({ text, undo, id: Date.now() });

  return (
    <>
      <Sheet
        open={open}
        onClose={() => {
          setNotice(null);
          onClose();
        }}
        title={`Yesterday · ${formatLocalDate(yesterday, 'EEE d MMM')}`}
      >
        {open && (
          <div>
            <p className="text-[14px] text-ink-2">Add what you missed. Anything logged here counts for yesterday, streaks included.</p>
            <ul className={ordered.length ? 'mt-2 divide-y divide-line border-y border-line' : 'hidden'}>
              {ordered.map((m) => (
                <Row
                  key={m.id}
                  metric={m}
                  date={yesterday}
                  onNotice={show}
                  onManual={(subtract) => setEntry({ mode: 'add', metric: m, date: yesterday, subtract })}
                />
              ))}
            </ul>
            {ordered.length === 0 && <p className="py-4 text-[14px] text-ink-3">Nothing was scheduled yesterday.</p>}
            <div aria-live="polite" className="mt-3 min-h-11">
              {notice && (
                <div key={notice.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-s2 py-1 pr-1 pl-3 text-[14px]">
                  <span>{notice.text}</span>
                  {notice.undo && (
                    <button
                      type="button"
                      className="press min-h-9 rounded-lg px-3 font-semibold hover:bg-s3"
                      onClick={() => {
                        notice.undo!();
                        setNotice(null);
                      }}
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>
      <EntrySheet state={entry} onClose={() => setEntry(null)} />
    </>
  );
}

function Row({
  metric,
  date,
  onNotice,
  onManual,
}: {
  metric: Metric;
  date: string;
  onNotice: (text: string, undo?: () => void) => void;
  onManual: (subtract: boolean) => void;
}) {
  const data = useData();
  const { uid, today } = data;
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);
  const stats = statsFor(data, metric.id);
  const day = stats.get(date);
  const total = day?.total ?? 0;
  const scheduled = isScheduled(metric.schedule, date);
  const hit = isHit(metric, total, day?.count ?? 0);
  const [minus, setMinus] = useState(false);
  const lastTap = useRef(0);

  // The run that ended on the scheduled day before yesterday: what a hit
  // yesterday would carry on (and today then extends).
  const priorRun = useMemo(() => {
    if (metric.target == null || !scheduled) return 0;
    const runs = streakDays(metric, stats, addDays(date, -14), addDays(date, -1), today);
    for (let d = addDays(date, -1); d >= addDays(date, -14); d = addDays(d, -1)) {
      if (runs.has(d)) return runs.get(d)!;
    }
    return 0;
  }, [metric, stats, date, today, scheduled]);

  const guard = () => {
    const now = Date.now();
    if (now - lastTap.current < 350) return false;
    lastTap.current = now;
    return true;
  };
  const add = (value: number) => {
    if (!guard()) return;
    const id = addEntry(uid, { metricId: metric.id, value, source: 'quick_add', localDate: date });
    onNotice(`Logged ${formatValue(metric, value)} to ${metric.name} yesterday`, () => softDeleteEntry(uid, id));
  };
  const subtract = (value: number) => {
    if (!guard() || total === 0) return;
    const removed = Math.min(value, total);
    const dayEntries = data.entries.filter((e) => e.metricId === metric.id && e.localDate === date);
    const undo = subtractFromDay(uid, dayEntries, removed);
    onNotice(`Removed ${removed < value ? 'all ' : ''}${formatValue(metric, removed)} from ${metric.name} yesterday`, () => undoSubtraction(uid, undo));
  };

  let status: string;
  if (metric.target == null) status = 'No target';
  else if (hit) status = priorRun > 0 ? `Target met · streak kept (${priorRun + 1} days)` : 'Target met';
  else if (metric.targetDirection === 'at_least') {
    const short = formatValue(metric, metric.target - total);
    status = priorRun > 0 ? `${short} more restores your ${priorRun}-day streak` : `${short} short of the target`;
  } else {
    status = total === 0 ? (priorRun > 0 ? `Log it to restore your ${priorRun}-day streak` : 'Nothing logged') : `${formatValue(metric, total - metric.target)} over the ceiling`;
  }

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
          <Icon size={16} className="shrink-0 self-center" style={{ color: hue }} aria-hidden />
          <span className="truncate">{metric.name}</span>
        </h3>
        <span className={cx('shrink-0 text-[17px] font-medium', total === 0 && 'text-ink-3')}>
          {formatValue(metric, total)}
          {metric.target != null && <span className="text-[13px] font-normal text-ink-3"> / {formatValue(metric, metric.target)}</span>}
        </span>
      </div>
      <p className={cx('mt-0.5 text-[13px]', !hit && priorRun > 0 ? 'text-ink' : 'text-ink-3')}>{status}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMinus((v) => !v)}
          aria-pressed={minus}
          aria-label={minus ? `Subtracting from ${metric.name} yesterday. Switch to adding` : `Adding to ${metric.name} yesterday. Switch to subtracting`}
          className={cx(
            'press inline-flex size-11 shrink-0 items-center justify-center rounded-lg',
            minus ? 'bg-raise text-danger ring-1 ring-danger/50' : 'bg-s2 text-ink hover:bg-s3',
          )}
        >
          {minus ? <Minus size={20} strokeWidth={2.4} /> : <Plus size={20} strokeWidth={2.4} />}
        </button>
        {metric.quickAdd.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => (minus ? subtract(v) : add(v))}
            disabled={minus && total === 0}
            aria-label={minus ? `Subtract ${formatValue(metric, v)} from ${metric.name} yesterday` : `Add ${formatValue(metric, v)} to ${metric.name} yesterday`}
            className={cx('press min-h-11 min-w-12 rounded-lg bg-s2 px-2.5 text-[14px] font-medium hover:bg-s3 disabled:opacity-40', minus ? 'text-danger' : 'text-ink')}
          >
            {formatChip(metric, v, minus ? '−' : '+')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onManual(minus)}
          aria-label={minus ? `Subtract a custom amount from ${metric.name} yesterday` : `Add a custom amount to ${metric.name} yesterday`}
          className={cx('press inline-flex size-11 items-center justify-center rounded-lg bg-s2 hover:bg-s3', minus ? 'text-danger' : 'text-ink')}
        >
          <Keyboard size={18} />
        </button>
      </div>
    </li>
  );
}

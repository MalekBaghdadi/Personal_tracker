import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Play, Plus, Square } from 'lucide-react';
import { statsFor, useData } from '../state/DataContext';
import { useTimerActions } from '../state/TimerContext';
import { useHue } from '../state/theme';
import { addEntry, softDeleteEntry } from '../lib/repo';
import { computeStreaks, isHit, isScheduled } from '../lib/streaks';
import { formatChip, formatValue, formatValueParts } from '../lib/format';
import { formatLocalDate } from '../lib/dates';
import { iconFor } from '../lib/icons';
import { EntrySheet, type EntrySheetState } from '../components/EntrySheet';
import { InstallCard, SyncDot } from '../components/Chrome';
import { cx, useToast } from '../components/ui';
import type { Metric } from '../lib/types';

export function Today() {
  const data = useData();
  const { metrics, today } = data;
  const [sheet, setSheet] = useState<EntrySheetState | null>(null);
  const [showOther, setShowOther] = useState(false);

  const active = metrics.filter((m) => !m.archivedAt);
  const scheduled = active.filter((m) => isScheduled(m.schedule, today));
  const other = active.filter((m) => !isScheduled(m.schedule, today));

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">{formatLocalDate(today, 'EEEE d MMMM')}</h1>
        <span className="md:hidden"><SyncDot /></span>
      </header>

      <InstallCard />

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-[16px] font-medium">Nothing to track yet</p>
          <p className="mt-1 text-[14px] text-ink-2">Add a metric, and it shows up here ready to log.</p>
          <a href="#/metrics" className="press mt-4 inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-[15px] font-medium text-bg">
            Add a metric
          </a>
        </div>
      ) : (
        <>
          {scheduled.length === 0 && (
            <p className="py-4 text-[14px] text-ink-2">Nothing is scheduled today. Anything you do can still be logged below.</p>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {scheduled.map((m) => (
              <MetricRow key={m.id} metric={m} onManual={() => setSheet({ mode: 'add', metric: m })} />
            ))}
          </ul>

          {other.length > 0 && (
            <section className="mt-6">
              <button
                type="button"
                aria-expanded={showOther || scheduled.length === 0}
                onClick={() => setShowOther((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between text-[14px] font-medium text-ink-2 hover:text-ink"
              >
                Not scheduled today · {other.length}
                <ChevronDown size={18} className={cx('transition-transform', (showOther || scheduled.length === 0) && 'rotate-180')} />
              </button>
              {(showOther || scheduled.length === 0) && (
                <ul className="divide-y divide-line border-y border-line">
                  {other.map((m) => (
                    <MetricRow key={m.id} metric={m} unscheduled onManual={() => setSheet({ mode: 'add', metric: m })} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <EntrySheet state={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function MetricRow({ metric, onManual, unscheduled }: { metric: Metric; onManual: () => void; unscheduled?: boolean }) {
  const data = useData();
  const { uid, today, timer } = data;
  const { start, stop } = useTimerActions();
  const toast = useToast();
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);

  const stats = statsFor(data, metric.id);
  const day = stats.get(today);
  const total = day?.total ?? 0;
  const count = day?.count ?? 0;
  const streak = useMemo(() => computeStreaks(metric, stats, today), [metric, stats, today]);
  const hit = isHit(metric, total, count);
  const running = timer?.metricId === metric.id;
  const parts = formatValueParts(metric, total);

  // UI-only guard against an accidental double tap. Two deliberate taps
  // still produce two entries; the data layer never dedupes.
  const lastTap = useRef(0);
  const quickAdd = (value: number) => {
    const now = Date.now();
    if (now - lastTap.current < 350) return;
    lastTap.current = now;
    const id = addEntry(uid, { metricId: metric.id, value, source: 'quick_add', localDate: today });
    toast(`Logged ${formatValue(metric, value)} to ${metric.name}`, { label: 'Undo', run: () => softDeleteEntry(uid, id) });
  };

  const progress = metric.target ? Math.min(1, total / metric.target) : 0;
  const over = metric.targetDirection === 'at_most' && metric.target != null && total > metric.target;

  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-1 shrink-0" style={{ color: hue }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-[15px] font-medium">{metric.name}</h2>
            <p className="shrink-0 text-right">
              <span className={cx('text-[26px] leading-none font-medium tracking-tight', total === 0 && 'text-ink-3')}>{parts.num}</span>
              {parts.unit && <span className="ml-1 text-[13px] text-ink-3">{parts.unit}</span>}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-ink-3">
            <span>
              {metric.target == null
                ? 'No target'
                : `${metric.targetDirection === 'at_most' ? 'Under' : 'Target'} ${formatValue(metric, metric.target)}`}
              {over && <span className="text-ink-2"> · {formatValue(metric, total - metric.target!)} over</span>}
              {/* A ceiling isn't "done" until the day is; only floors get this. */}
              {hit && metric.targetDirection === 'at_least' && <span className="text-ink-2"> · done</span>}
              {unscheduled && ' · not scheduled'}
            </span>
            {streak && <span>{streak.current} in a row</span>}
          </div>
          {metric.target != null && (
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-s3" role="presentation">
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: over ? 'var(--danger)' : hue }} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[30px]">
        {metric.quickAdd.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => quickAdd(v)}
            aria-label={`Add ${formatValue(metric, v)} to ${metric.name}`}
            className="press min-h-11 min-w-12 rounded-lg bg-s2 px-3 text-[14px] font-medium text-ink hover:bg-s3"
          >
            {formatChip(metric, v)}
          </button>
        ))}
        <button
          type="button"
          onClick={onManual}
          aria-label={`Add a custom amount to ${metric.name}`}
          className="press inline-flex size-11 items-center justify-center rounded-lg bg-s2 text-ink hover:bg-s3"
        >
          <Plus size={18} />
        </button>
        {metric.timerEnabled && (
          <button
            type="button"
            onClick={() => (running ? stop() : start(metric.id))}
            aria-label={running ? `Stop ${metric.name} timer` : `Start ${metric.name} timer`}
            aria-pressed={running}
            className="press ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[14px] font-medium"
            style={running ? { background: hue, color: '#0e1420' } : { background: 'var(--s2)', color: 'var(--ink)' }}
          >
            {running ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            {running ? 'Stop' : 'Start'}
          </button>
        )}
      </div>
    </li>
  );
}

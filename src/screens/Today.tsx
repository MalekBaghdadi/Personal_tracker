import { useMemo, useRef, useState } from 'react';
import { ChevronRight, History as HistoryIcon, Keyboard, Minus, Play, Plus, Square } from 'lucide-react';
import { itemsOn, statsFor, useData } from '../state/DataContext';
import { useTimerActions } from '../state/TimerContext';
import { useHue } from '../state/theme';
import { addEntry, softDeleteEntry, subtractFromDay, undoSubtraction } from '../lib/repo';
import { computeStreaks, isHit, isScheduled } from '../lib/streaks';
import { formatChip, formatValue, formatValueParts } from '../lib/format';
import { formatLocalDate } from '../lib/dates';
import { iconFor } from '../lib/icons';
import { EntrySheet, type EntrySheetState } from '../components/EntrySheet';
import { InstallCard, SyncDot } from '../components/Chrome';
import { itemSummary } from '../components/Items';
import { GoalCard, GoalPaceLine } from '../components/Goals';
import { StartEarlierSheet, useLongPress } from '../components/StartEarlier';
import { YesterdaySheet } from '../components/YesterdaySheet';
import { cx, useToast } from '../components/ui';
import type { Metric } from '../lib/types';

export function Today() {
  const data = useData();
  const { metrics, today } = data;
  const [sheet, setSheet] = useState<EntrySheetState | null>(null);
  const [yesterday, setYesterday] = useState(false);

  const active = metrics.filter((m) => !m.archivedAt);
  // Already ordered by nearest deadline.
  const activeGoals = data.goals.filter((g) => !g.archivedAt);
  const scheduled = active.filter((m) => isScheduled(m.schedule, today));

  // "Network+ exam 14:00 · Dentist · 2 reminders": events by name, open reminders as a count.
  const todaysItems = itemsOn(data, today);
  const events = todaysItems.filter((it) => it.kind === 'event');
  const openReminders = todaysItems.filter((it) => it.kind === 'reminder' && !it.doneAt).length;
  const daySummary = [
    ...events.slice(0, 2).map(itemSummary),
    ...(events.length > 2 ? [`+${events.length - 2} more`] : []),
    ...(openReminders ? [`${openReminders} ${openReminders === 1 ? 'reminder' : 'reminders'}`] : []),
  ].join(' · ');
  // Long dates ("Wednesday 30 September") use the short month so the Yesterday button fits beside them.
  const longDate = formatLocalDate(today, 'EEEE d MMMM');
  const headerDate = longDate.length > 18 ? formatLocalDate(today, 'EEEE d MMM') : longDate;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        {/* The date opens today in History: events, reminders and entries. */}
        <a
          href={`#/history/${today}`}
          data-tour="today-date"
          className="group -mx-2 -my-1 block min-w-0 rounded-lg px-2 py-1 hover:bg-s1"
          aria-label={`${formatLocalDate(today, 'EEEE d MMMM')}. ${daySummary || 'No events or reminders'}. Open this day in History`}
        >
          <h1 className="flex min-w-0 items-center gap-1 text-[22px] font-semibold tracking-tight">
            <span className="truncate">{headerDate}</span>
            <ChevronRight size={18} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </h1>
          {daySummary && <p className="mt-0.5 truncate text-[13px] text-ink-2">{daySummary}</p>}
        </a>
        <div className="flex shrink-0 items-center gap-2">
          {/* Catch up on anything missed yesterday, without leaving Today. */}
          {active.length > 0 && (
            <button
              type="button"
              onClick={() => setYesterday(true)}
              data-tour="today-yesterday"
              aria-label="Add to yesterday"
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-s2 px-2.5 text-[13px] font-medium text-ink-2 hover:bg-s3 hover:text-ink"
            >
              <HistoryIcon size={15} aria-hidden />
              Yesterday
            </button>
          )}
          <span className="md:hidden"><SyncDot /></span>
        </div>
      </header>

      <InstallCard />

      {activeGoals.length > 0 && (
        <section aria-label="Deadline goals" data-tour="today-goals" className="mb-4 flex flex-col gap-2">
          {activeGoals.map((g) => <GoalCard key={g.id} goal={g} />)}
        </section>
      )}

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
          {/* Only what's scheduled today. A metric's off days don't show here
              at all; History can still log to any day. */}
          {scheduled.length === 0 ? (
            <p className="py-4 text-[14px] text-ink-2">Nothing is scheduled today.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {scheduled.map((m) => (
                <MetricRow key={m.id} metric={m} onManual={(subtract) => setSheet({ mode: 'add', metric: m, subtract })} />
              ))}
            </ul>
          )}
        </>
      )}

      <EntrySheet state={sheet} onClose={() => setSheet(null)} />
      <YesterdaySheet open={yesterday} onClose={() => setYesterday(false)} />
    </div>
  );
}

function MetricRow({ metric, onManual }: { metric: Metric; onManual: (subtract: boolean) => void }) {
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
  const goal = data.goals.find((g) => g.metricId === metric.id && !g.archivedAt);
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

  // The row's +/− toggle. Subtracting trims today's entries; it never stores
  // a negative value and never takes the day below zero.
  const [minus, setMinus] = useState(false);
  const quickSubtract = (value: number) => {
    const now = Date.now();
    if (now - lastTap.current < 350) return;
    lastTap.current = now;
    if (total === 0) return;
    // More than is logged just empties the day; it never goes below zero.
    const removed = Math.min(value, total);
    const todays = data.entries.filter((e) => e.metricId === metric.id && e.localDate === today);
    const undo = subtractFromDay(uid, todays, removed);
    toast(
      removed < value ? `Removed all ${formatValue(metric, removed)} from ${metric.name}` : `Removed ${formatValue(metric, removed)} from ${metric.name}`,
      { label: 'Undo', run: () => undoSubtraction(uid, undo) },
    );
  };

  // Hold ▶ (or right-click it) to start the timer earlier than now.
  const [startEarlier, setStartEarlier] = useState(false);
  const hold = useLongPress(() => setStartEarlier(true));

  const progress = metric.target ? Math.min(1, total / metric.target) : 0;
  const over = metric.targetDirection === 'at_most' && metric.target != null && total > metric.target;

  return (
    <li className="py-3.5" data-tour="today-row">
      {/* A modal; first so the controls stay the row's last block. */}
      {metric.timerEnabled && <StartEarlierSheet metric={metric} open={startEarlier} onClose={() => setStartEarlier(false)} />}
      {/* One column: icon sits on the name line so the text, progress bar and
          controls all share the row's left and right edges. */}
      <div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
              <Icon size={17} className="shrink-0 self-center" style={{ color: hue }} aria-hidden />
              <span className="truncate">{metric.name}</span>
            </h2>
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
            </span>
            {streak && <span>{streak.current} in a row</span>}
          </div>
          {goal && <GoalPaceLine goal={goal} metric={metric} />}
          {metric.target != null && (
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-s3" role="presentation">
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: over ? 'var(--danger)' : hue }} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMinus((v) => !v)}
          data-tour="today-toggle"
          aria-pressed={minus}
          aria-label={minus ? `Subtracting from ${metric.name}. Switch to adding` : `Adding to ${metric.name}. Switch to subtracting`}
          className={cx(
            'press inline-flex size-11 shrink-0 items-center justify-center rounded-lg',
            minus ? 'bg-raise text-danger ring-1 ring-danger/50' : 'bg-s2 text-ink hover:bg-s3',
          )}
        >
          {minus ? <Minus size={20} strokeWidth={2.4} /> : <Plus size={20} strokeWidth={2.4} />}
        </button>
        {metric.quickAdd.map((v, i) => (
          <button
            key={v}
            data-tour={i === 0 ? 'today-chip' : undefined}
            type="button"
            onClick={() => (minus ? quickSubtract(v) : quickAdd(v))}
            disabled={minus && total === 0}
            aria-label={minus ? `Subtract ${formatValue(metric, v)} from ${metric.name}` : `Add ${formatValue(metric, v)} to ${metric.name}`}
            className={cx(
              'press min-h-11 min-w-12 rounded-lg bg-s2 px-2.5 text-[14px] font-medium hover:bg-s3 disabled:opacity-40',
              minus ? 'text-danger' : 'text-ink',
            )}
          >
            {formatChip(metric, v, minus ? '−' : '+')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onManual(minus)}
          data-tour="today-custom"
          aria-label={minus ? `Subtract a custom amount from ${metric.name}` : `Add a custom amount to ${metric.name}`}
          className={cx('press inline-flex size-11 items-center justify-center rounded-lg bg-s2 hover:bg-s3', minus ? 'text-danger' : 'text-ink')}
        >
          <Keyboard size={18} />
        </button>
        {metric.timerEnabled && (
          <button
            type="button"
            onClick={running ? () => stop() : hold.guard(() => start(metric.id))}
            data-tour="today-timer"
            {...(running ? {} : hold.handlers)}
            aria-label={running ? `Stop ${metric.name} timer` : `Start ${metric.name} timer`}
            aria-pressed={running}
            title={running ? undefined : 'Hold to start earlier'}
            // Icon-only on phones so the row stays on one line; labelled when there's room.
            // No iOS callout or text selection, so press-and-hold reaches the app.
            className="press ml-auto inline-flex size-11 items-center justify-center gap-2 rounded-lg text-[14px] font-medium select-none [-webkit-touch-callout:none] sm:w-auto sm:px-3.5"
            style={running ? { background: hue, color: '#0e1420' } : { background: 'var(--s2)', color: 'var(--ink)' }}
          >
            {running ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            <span className="hidden sm:inline">{running ? 'Stop' : 'Start'}</span>
          </button>
        )}
      </div>
    </li>
  );
}

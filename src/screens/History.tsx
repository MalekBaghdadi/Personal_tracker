import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { statsFor, useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate, formatTimeIn, localDateOf, weekdayOf } from '../lib/dates';
import { isHit, isScheduled } from '../lib/streaks';
import { formatValue } from '../lib/format';
import { EntrySheet, sourceLabel, type EntrySheetState } from '../components/EntrySheet';
import { Button, IconButton, Sheet, WEEKDAYS, cx } from '../components/ui';
import { MetricPicker } from '../components/MetricPicker';
import type { Metric } from '../lib/types';

function monthStart(localDate: string): string {
  return `${localDate.slice(0, 8)}01`;
}
function shiftMonth(first: string, n: number): string {
  const [y, m] = first.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function History() {
  const { metrics, today } = useData();
  const [metricId, setMetricId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthStart(today));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const metric = metrics.find((m) => m.id === metricId) ?? metrics.find((m) => !m.archivedAt) ?? metrics[0];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">History</h1>
      {!metric ? (
        <p className="text-[14px] text-ink-2">Add a metric to see its history here.</p>
      ) : (
        <>
          <MetricPicker metrics={metrics} value={metric.id} onChange={setMetricId} />
          <MonthHeatmap metric={metric} month={month} setMonth={setMonth} onDay={setOpenDay} />
          <DaySheet metric={metric} date={openDay} onClose={() => setOpenDay(null)} />
        </>
      )}
    </div>
  );
}

function MonthHeatmap({
  metric,
  month,
  setMonth,
  onDay,
}: {
  metric: Metric;
  month: string;
  setMonth: (m: string) => void;
  onDay: (d: string) => void;
}) {
  const data = useData();
  const { today, settings } = data;
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const hue = useHue(metric.color);
  const stats = statsFor(data, metric.id);

  const days = useMemo(() => {
    const out: string[] = [];
    const next = shiftMonth(month, 1);
    for (let d = month; d < next; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const lead = (weekdayOf(month) - weekStartsOn + 7) % 7;
  const monthMax = Math.max(1, ...days.map((d) => stats.get(d)?.total ?? 0));
  // Days before the metric existed (or its earliest backfilled entry) aren't misses.
  const since = [...stats.keys()].reduce((min, d) => (d < min ? d : min), localDateOf(metric.createdAt, data.tz));
  const summary = days.reduce(
    (acc, d) => {
      const s = stats.get(d);
      if (s) acc.total += s.total;
      if (d <= today && d >= since && isScheduled(metric.schedule, d)) {
        const h = isHit(metric, s?.total ?? 0, s?.count ?? 0);
        if (h) acc.hits++;
        if (d < today || h) acc.scheduled++;
      }
      return acc;
    },
    { total: 0, hits: 0, scheduled: 0 },
  );

  const weekdayOrder = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const canGoForward = month < monthStart(today);

  return (
    <section className="mt-5" aria-label={`${metric.name}, ${formatLocalDate(month, 'MMMM yyyy')}`}>
      <div className="mb-3 flex items-center justify-between">
        <IconButton label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <h2 className="text-[15px] font-medium">{formatLocalDate(month, 'MMMM yyyy')}</h2>
        <IconButton label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canGoForward} className="disabled:opacity-30">
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekdayOrder.map((d) => (
          <div key={d} className="pb-1 text-center text-[12px] text-ink-3">{WEEKDAYS[d].slice(0, 2)}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} />)}
        {days.map((d) => {
          const s = stats.get(d);
          const total = s?.total ?? 0;
          const future = d > today;
          const scheduled = isScheduled(metric.schedule, d);
          const hit = isHit(metric, total, s?.count ?? 0);
          let ratio = 0;
          if (total > 0) {
            if (metric.target == null) ratio = total / monthMax;
            else if (metric.targetDirection === 'at_least') ratio = Math.min(1, total / metric.target);
            else ratio = hit ? 1 : 0.3;
          }
          const fill = total > 0 ? `color-mix(in oklab, ${hue} ${Math.round(22 + ratio * 78)}%, var(--s2))` : undefined;
          const label = `${formatLocalDate(d, 'EEEE d MMMM')}: ${total > 0 ? formatValue(metric, total) : 'nothing logged'}${hit ? ', target met' : ''}${!scheduled ? ', not scheduled' : ''}`;
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => onDay(d)}
              aria-label={label}
              className={cx(
                'press relative aspect-square min-h-11 rounded-md text-[12px] font-medium disabled:cursor-default',
                total === 0 && (scheduled ? 'bg-s2' : 'bg-s1'),
                future && 'opacity-35',
                d === today && 'ring-1 ring-ink-2 ring-offset-1 ring-offset-bg',
              )}
              style={fill ? { background: fill } : undefined}
            >
              <span className={cx('absolute top-1 left-1.5', ratio > 0.6 ? 'text-[#0e1420]' : 'text-ink-2')}>
                {Number(d.slice(8))}
              </span>
              {hit && <span aria-hidden className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-[#0e1420]/70" />}
            </button>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
        <div>
          <dt className="text-ink-3">Month total</dt>
          <dd className="text-[18px] font-medium">{formatValue(metric, summary.total)}</dd>
        </div>
        {metric.target != null && (
          <div>
            <dt className="text-ink-3">Target met</dt>
            <dd className="text-[18px] font-medium">
              {summary.hits}<span className="text-ink-3"> / {summary.scheduled} days</span>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-[12px] text-ink-3">Tap a day to see, edit, or add entries.</p>
    </section>
  );
}

function DaySheet({ metric, date, onClose }: { metric: Metric; date: string | null; onClose: () => void }) {
  const { entries, tz } = useData();
  const [edit, setEdit] = useState<EntrySheetState | null>(null);
  const dayEntries = useMemo(
    () => (date ? entries.filter((e) => e.metricId === metric.id && e.localDate === date).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) : []),
    [entries, metric.id, date],
  );
  const total = dayEntries.reduce((s, e) => s + e.value, 0);

  return (
    <>
      <Sheet open={date !== null && edit === null} onClose={onClose} title={date ? `${metric.name} · ${formatLocalDate(date, 'EEE d MMM')}` : ''}>
        {dayEntries.length === 0 ? (
          <p className="py-2 text-[14px] text-ink-2">Nothing logged this day.</p>
        ) : (
          <>
            <p className="mb-2 text-[14px] text-ink-2">
              Total <span className="font-medium text-ink">{formatValue(metric, total)}</span> from {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
            </p>
            <ul className="divide-y divide-line border-y border-line">
              {dayEntries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEdit({ mode: 'edit', metric, entry: e })}
                    className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-s2/50"
                  >
                    <span className="w-12 shrink-0 text-[14px] text-ink-3">{formatTimeIn(e.occurredAt, tz)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{formatValue(metric, e.value)}</span>
                      <span className="block truncate text-[13px] text-ink-3">
                        {sourceLabel(e.source)}{e.note ? ` · ${e.note}` : ''}
                      </span>
                    </span>
                    <Pencil size={16} className="shrink-0 text-ink-3" aria-label="Edit" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button className="mt-4 w-full" onClick={() => date && setEdit({ mode: 'add', metric, date })}>
          <Plus size={18} /> Add an entry for this day
        </Button>
      </Sheet>
      <EntrySheet state={edit} onClose={() => setEdit(null)} />
    </>
  );
}

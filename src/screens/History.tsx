import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { itemsOn, statsFor, useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate, formatTimeIn, localDateOf, weekdayOf } from '../lib/dates';
import { isHit, isScheduled } from '../lib/streaks';
import { formatValue } from '../lib/format';
import { EntrySheet, sourceLabel, type EntrySheetState } from '../components/EntrySheet';
import { Button, IconButton, Sheet, WEEKDAYS, cx } from '../components/ui';
import { ALL, MetricPicker } from '../components/MetricPicker';
import { AddItemButtons, ItemList, ItemSheet, type ItemSheetState } from '../components/Items';
import type { DayStats, Entry, Metric } from '../lib/types';

function monthStart(localDate: string): string {
  return `${localDate.slice(0, 8)}01`;
}
function shiftMonth(first: string, n: number): string {
  const [y, m] = first.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function monthDays(month: string): string[] {
  const out: string[] = [];
  const next = shiftMonth(month, 1);
  for (let d = month; d < next; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Days before the metric existed (or its earliest backfilled entry) aren't misses. */
function sinceOf(metric: Metric, stats: DayStats, tz: string): string {
  return [...stats.keys()].reduce((min, d) => (d < min ? d : min), localDateOf(metric.createdAt, tz));
}

function monthSummary(metric: Metric, stats: DayStats, days: string[], today: string, since: string) {
  return days.reduce(
    (acc, d) => {
      const s = stats.get(d);
      if (s) acc.total += s.total;
      if (d <= today && d >= since && isScheduled(metric.schedule, d)) {
        const h = isHit(metric, s?.total ?? 0, s?.count ?? 0);
        if (h) acc.hits++;
        // Today only counts once it's a hit, so the month doesn't dip every morning.
        if (d < today || h) acc.scheduled++;
      }
      return acc;
    },
    { total: 0, hits: 0, scheduled: 0 },
  );
}

/** `openDate` comes from a `#/history/YYYY-MM-DD` link (the date on Today). */
export function History({ openDate }: { openDate?: string | null }) {
  const { metrics, today } = useData();
  const [selection, setSelection] = useState<string>(ALL);
  const [month, setMonth] = useState(() => monthStart(openDate ?? today));
  const [openDay, setOpenDay] = useState<string | null>(openDate ?? null);

  useEffect(() => {
    if (!openDate) return;
    setSelection(ALL);
    setMonth(monthStart(openDate));
    setOpenDay(openDate);
  }, [openDate]);

  const closeDay = () => {
    setOpenDay(null);
    // Drop the day from the URL so the back button and reloads land on the calendar.
    if (window.location.hash !== '#/history') history.replaceState(null, '', '#/history');
  };

  const metric = selection === ALL ? null : metrics.find((m) => m.id === selection) ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">History</h1>
      {metrics.length > 0 && <MetricPicker metrics={metrics} value={metric ? metric.id : ALL} onChange={setSelection} showAll />}
      <MonthNav month={month} setMonth={setMonth} />
      {metric ? (
        <>
          <MetricMonth metric={metric} month={month} onDay={setOpenDay} />
          <DaySheet metric={metric} date={openDay} onClose={closeDay} />
        </>
      ) : (
        <>
          <AllMonth month={month} onDay={setOpenDay} />
          <AllDaySheet date={openDay} onClose={closeDay} />
        </>
      )}
      <p className="mt-3 text-[12px] text-ink-3">
        {metric ? 'Tap a day to see, edit, or add entries.' : 'Tap a day to see entries, or to add events and reminders.'}
      </p>
    </div>
  );
}

// ── Shared month chrome ────────────────────────────────────────────────────

function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { today } = useData();
  const isCurrent = month === monthStart(today);
  return (
    <div className="mt-5 mb-3 flex items-center justify-between">
      <IconButton label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
        <ChevronLeft size={20} />
      </IconButton>
      <button
        type="button"
        onClick={() => setMonth(monthStart(today))}
        disabled={isCurrent}
        aria-label={isCurrent ? undefined : `${formatLocalDate(month, 'MMMM yyyy')}. Go to this month`}
        className="min-h-11 rounded-lg px-3 text-[15px] font-medium enabled:hover:bg-s2 disabled:cursor-default"
      >
        {formatLocalDate(month, 'MMMM yyyy')}
      </button>
      {/* Future months are open now: events and reminders can be planned ahead. */}
      <IconButton label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  );
}

function CalendarGrid({ month, label, cell }: { month: string; label: string; cell: (d: string) => ReactNode }) {
  const { settings } = useData();
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const days = useMemo(() => monthDays(month), [month]);
  const lead = (weekdayOf(month) - weekStartsOn + 7) % 7;
  const weekdayOrder = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <section aria-label={label} className="grid grid-cols-7 gap-1.5">
      {weekdayOrder.map((d) => (
        <div key={d} className="pb-1 text-center text-[12px] text-ink-3">{WEEKDAYS[d].slice(0, 2)}</div>
      ))}
      {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} />)}
      {days.map((d) => cell(d))}
    </section>
  );
}

function DayCell({
  date,
  label,
  onDay,
  fill,
  darkText,
  muted,
  allowFuture,
  children,
}: {
  date: string;
  label: string;
  onDay: (d: string) => void;
  fill?: string;
  darkText?: boolean;
  muted?: boolean;
  /** The All view opens future days, for planning events and reminders. */
  allowFuture?: boolean;
  children?: ReactNode;
}) {
  const data = useData();
  const { today } = data;
  const future = date > today;
  const items = itemsOn(data, date);
  // Marker counts what's still open; ticked-off reminders don't nag.
  const open = items.filter((it) => !(it.kind === 'reminder' && it.doneAt)).length;
  const itemsLabel = items.length ? `; ${items.length} ${items.length === 1 ? 'event or reminder' : 'events and reminders'}` : '';
  return (
    <button
      type="button"
      disabled={future && !allowFuture}
      onClick={() => onDay(date)}
      aria-label={label + itemsLabel}
      className={cx(
        'press relative aspect-square min-h-11 rounded-md text-[12px] font-medium disabled:cursor-default',
        !fill && (muted ? 'bg-s1' : 'bg-s2'),
        future && !items.length && 'opacity-50',
        future && !allowFuture && 'opacity-35',
        date === today && 'ring-1 ring-ink-2 ring-offset-1 ring-offset-bg',
      )}
      style={fill ? { background: fill } : undefined}
    >
      <span className={cx('absolute top-1 left-1.5', darkText ? 'text-[#0e1420]' : 'text-ink-2')}>{Number(date.slice(8))}</span>
      {items.length > 0 && (
        <span
          aria-hidden
          className={cx(
            'absolute top-1.5 right-1.5 h-1.5 w-2.5 rounded-sm',
            open > 0 ? (darkText ? 'bg-[#0e1420]/80' : 'bg-ink') : (darkText ? 'bg-[#0e1420]/35' : 'bg-ink-3'),
          )}
        />
      )}
      {children}
    </button>
  );
}

// ── One metric ─────────────────────────────────────────────────────────────

function MetricMonth({ metric, month, onDay }: { metric: Metric; month: string; onDay: (d: string) => void }) {
  const data = useData();
  const { today, tz } = data;
  const hue = useHue(metric.color);
  const stats = statsFor(data, metric.id);
  const days = useMemo(() => monthDays(month), [month]);
  const monthMax = Math.max(1, ...days.map((d) => stats.get(d)?.total ?? 0));
  const summary = monthSummary(metric, stats, days, today, sinceOf(metric, stats, tz));

  return (
    <>
      <CalendarGrid
        month={month}
        label={`${metric.name}, ${formatLocalDate(month, 'MMMM yyyy')}`}
        cell={(d) => {
          const s = stats.get(d);
          const total = s?.total ?? 0;
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
            <DayCell key={d} date={d} label={label} onDay={onDay} fill={fill} darkText={ratio > 0.6} muted={!scheduled}>
              {hit && <span aria-hidden className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-[#0e1420]/70" />}
            </DayCell>
          );
        }}
      />

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
    </>
  );
}

// ── All metrics ────────────────────────────────────────────────────────────

/** Active metrics, plus archived ones that have entries in the given days. */
function visibleMetrics(metrics: Metric[], dayStats: Map<string, DayStats>, days: string[]): Metric[] {
  return metrics.filter((m) => !m.archivedAt || days.some((d) => dayStats.get(m.id)?.has(d)));
}

function MetricDot({ metric, state }: { metric: Metric; state: 'met' | 'logged' }) {
  const hue = useHue(metric.color);
  // Filled: logged and not a miss. Ring: logged but the target wasn't met.
  return (
    <span
      aria-hidden
      className="size-1.5 rounded-full"
      style={state === 'met' ? { background: hue } : { boxShadow: `inset 0 0 0 1.5px ${hue}` }}
    />
  );
}

function AllMonth({ month, onDay }: { month: string; onDay: (d: string) => void }) {
  const data = useData();
  const { metrics, dayStats, today, tz } = data;
  const days = useMemo(() => monthDays(month), [month]);
  const shown = useMemo(() => visibleMetrics(metrics, dayStats, days), [metrics, dayStats, days]);
  const sinces = useMemo(
    () => new Map(shown.map((m) => [m.id, sinceOf(m, dayStats.get(m.id) ?? new Map(), tz)])),
    [shown, dayStats, tz],
  );

  return (
    <>
      <CalendarGrid
        month={month}
        label={`All metrics, ${formatLocalDate(month, 'MMMM yyyy')}`}
        cell={(d) => {
          const logged: { metric: Metric; met: boolean; total: number }[] = [];
          let due = 0;
          let met = 0;
          for (const m of shown) {
            const s = statsFor(data, m.id).get(d);
            const hit = isHit(m, s?.total ?? 0, s?.count ?? 0);
            const counts = m.target != null && isScheduled(m.schedule, d) && d >= sinces.get(m.id)! && (d < today || hit);
            if (counts) {
              due++;
              if (hit) met++;
            }
            if (s) logged.push({ metric: m, met: hit !== false, total: s.total });
          }
          // Neutral shading by share of the day's targets met; the dots carry identity.
          const ratio = due > 0 ? met / due : 0;
          const fill = logged.length > 0 ? `color-mix(in oklab, var(--ink) ${Math.round(5 + ratio * 22)}%, var(--s2))` : undefined;
          const parts = logged.map((l) => `${l.metric.name} ${formatValue(l.metric, l.total)}`);
          const logText = parts.length ? `: ${parts.join(', ')}` : d > today ? '' : ': nothing logged';
          const label = `${formatLocalDate(d, 'EEEE d MMMM')}${logText}${due > 0 ? `; ${met} of ${due} targets met` : ''}`;
          return (
            <DayCell key={d} date={d} label={label} onDay={onDay} fill={fill} allowFuture>
              {logged.length > 0 && (
                <span className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-[3px]">
                  {logged.slice(0, 6).map((l) => (
                    <MetricDot key={l.metric.id} metric={l.metric} state={l.met ? 'met' : 'logged'} />
                  ))}
                </span>
              )}
            </DayCell>
          );
        }}
      />
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ink-2" />Logged, target met or none set</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full shadow-[inset_0_0_0_1.5px_var(--ink-2)]" />Logged, target not met</span>
      </p>

      <table className="mt-4 w-full border-t border-line text-[14px]">
        <caption className="sr-only">Month summary for all metrics</caption>
        <thead>
          <tr className="text-left text-[12px] text-ink-3">
            <th scope="col" className="pt-3 pb-1.5 font-normal">Metric</th>
            <th scope="col" className="pt-3 pb-1.5 text-right font-normal">Month total</th>
            <th scope="col" className="pt-3 pb-1.5 text-right font-normal">Target met</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((m) => {
            const s = monthSummary(m, statsFor(data, m.id), days, today, sinces.get(m.id)!);
            return <SummaryRow key={m.id} metric={m} total={s.total} hits={s.hits} scheduled={s.scheduled} />;
          })}
        </tbody>
      </table>
    </>
  );
}

function SummaryRow({ metric, total, hits, scheduled }: { metric: Metric; total: number; hits: number; scheduled: number }) {
  const hue = useHue(metric.color);
  return (
    <tr>
      <th scope="row" className="py-2.5 text-left font-medium">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full" style={{ background: hue }} />
          {metric.name}
          {metric.archivedAt && <span className="text-[12px] font-normal text-ink-3">archived</span>}
        </span>
      </th>
      <td className="py-2.5 text-right">{total > 0 ? formatValue(metric, total) : <span className="text-ink-3">–</span>}</td>
      <td className="py-2.5 text-right">
        {metric.target == null || scheduled === 0 ? (
          <span className="text-ink-3">–</span>
        ) : (
          <>{hits}<span className="text-ink-3"> / {scheduled}</span></>
        )}
      </td>
    </tr>
  );
}

// ── Day sheets ─────────────────────────────────────────────────────────────

function EntryList({ metric, entries, onEdit }: { metric: Metric; entries: Entry[]; onEdit: (e: Entry) => void }) {
  const { tz } = useData();
  return (
    <ul className="divide-y divide-line border-y border-line">
      {entries.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={() => onEdit(e)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-s2/50">
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
  );
}

const byTime = (a: Entry, b: Entry) => a.occurredAt.localeCompare(b.occurredAt);

function DaySheet({ metric, date, onClose }: { metric: Metric; date: string | null; onClose: () => void }) {
  const { entries } = useData();
  const [edit, setEdit] = useState<EntrySheetState | null>(null);
  const dayEntries = useMemo(
    () => (date ? entries.filter((e) => e.metricId === metric.id && e.localDate === date).sort(byTime) : []),
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
            <EntryList metric={metric} entries={dayEntries} onEdit={(e) => setEdit({ mode: 'edit', metric, entry: e })} />
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

function AllDaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const data = useData();
  const { entries, metrics, today } = data;
  const [edit, setEdit] = useState<EntrySheetState | null>(null);
  const [itemEdit, setItemEdit] = useState<ItemSheetState | null>(null);
  const groups = useMemo(() => {
    if (!date) return [];
    const day = entries.filter((e) => e.localDate === date);
    return metrics
      .map((m) => ({ metric: m, entries: day.filter((e) => e.metricId === m.id).sort(byTime) }))
      .filter((g) => g.entries.length > 0);
  }, [entries, metrics, date]);
  const active = metrics.filter((m) => !m.archivedAt);
  const items = date ? itemsOn(data, date) : [];
  // Entries are records of what happened, so only today and earlier take them.
  const loggable = date !== null && date <= today;

  return (
    <>
      <Sheet open={date !== null && edit === null && itemEdit === null} onClose={onClose} title={date ? formatLocalDate(date, 'EEEE d MMMM') : ''}>
        <section aria-labelledby="day-items-h">
          <h3 id="day-items-h" className="mb-1.5 text-[13px] font-medium text-ink-2">Events and reminders</h3>
          {items.length > 0 ? (
            <ItemList items={items} onEdit={(it) => setItemEdit({ mode: 'edit', item: it })} />
          ) : (
            <p className="pb-1 text-[14px] text-ink-3">Nothing planned.</p>
          )}
          <div className="mt-2.5">
            <AddItemButtons onAdd={(kind) => date && setItemEdit({ mode: 'add', date, kind })} />
          </div>
        </section>

        {loggable && (
          <section aria-labelledby="day-entries-h" className="mt-6">
            <h3 id="day-entries-h" className="mb-1.5 text-[13px] font-medium text-ink-2">Logged</h3>
            {groups.length === 0 ? (
              <p className="pb-1 text-[14px] text-ink-3">Nothing logged this day.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((g) => (
                  <DayGroup key={g.metric.id} metric={g.metric} entries={g.entries} date={date!} onEdit={(e) => setEdit({ mode: 'edit', metric: g.metric, entry: e })} />
                ))}
              </div>
            )}
            {active.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] text-ink-2">Add an entry for this day</p>
                <div className="flex flex-wrap gap-1.5">
                  {active.map((m) => (
                    <AddChip key={m.id} metric={m} onClick={() => date && setEdit({ mode: 'add', metric: m, date })} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </Sheet>
      <EntrySheet state={edit} onClose={() => setEdit(null)} />
      <ItemSheet state={itemEdit} onClose={() => setItemEdit(null)} />
    </>
  );
}

function DayGroup({ metric, entries, date, onEdit }: { metric: Metric; entries: Entry[]; date: string; onEdit: (e: Entry) => void }) {
  const hue = useHue(metric.color);
  const total = entries.reduce((s, e) => s + e.value, 0);
  const hit = isHit(metric, total, entries.length);
  const { today } = useData();
  return (
    <section aria-label={metric.name}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-[15px] font-medium">
          <span aria-hidden className="size-2 rounded-full" style={{ background: hue }} />
          {metric.name}
        </h3>
        <span className="text-[14px]">
          <span className="font-medium">{formatValue(metric, total)}</span>
          {hit === true && (metric.targetDirection === 'at_least' || date < today) && <span className="text-ink-3"> · target met</span>}
          {hit === false && date < today && <span className="text-ink-3"> · target missed</span>}
        </span>
      </div>
      <EntryList metric={metric} entries={entries} onEdit={onEdit} />
    </section>
  );
}

function AddChip({ metric, onClick }: { metric: Metric; onClick: () => void }) {
  const hue = useHue(metric.color);
  return (
    <button type="button" onClick={onClick} className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-3 text-[14px] font-medium hover:bg-s3">
      <Plus size={15} style={{ color: hue }} aria-hidden />
      {metric.name}
    </button>
  );
}

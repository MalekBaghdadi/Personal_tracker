import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { statsFor, useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addDays, dateRange, formatLocalDate } from '../lib/dates';
import { computeStreaks, hitRate } from '../lib/streaks';
import { formatDuration, formatNumber, formatValue } from '../lib/format';
import { iconFor } from '../lib/icons';
import { SessionNotes } from '../components/SessionNotes';
import { WeekReviewCard } from '../components/WeekReview';
import type { Metric } from '../lib/types';

const PERIOD = 30;

export function Stats() {
  const { metrics } = useData();
  const ordered = [...metrics.filter((m) => !m.archivedAt), ...metrics.filter((m) => m.archivedAt)];
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">Stats</h1>
      <div data-tour="stats-week">
        <WeekReviewCard />
      </div>
      {metrics.length > 0 && <h2 className="mt-6 mb-2 text-[14px] text-ink-3">Last {PERIOD} days</h2>}
      {ordered.length === 0 && <p className="text-[14px] text-ink-2">Add a metric to see stats here.</p>}
      <div className="divide-y divide-line">
        {ordered.map((m) => <MetricStats key={m.id} metric={m} />)}
      </div>
    </div>
  );
}

/** Round tick steps: 15m/30m/1h/2h… for time, 1/2/5×10ⁿ for counts. */
function niceTicks(metric: Metric, max: number): number[] {
  const top = Math.max(max, 1);
  const steps = metric.type === 'duration'
    ? [300, 900, 1800, 3600, 7200, 10800, 14400, 21600]
    : [1, 2, 5].flatMap((m) => [1, 10, 100, 1000, 10000].map((p) => m * p)).sort((a, b) => a - b);
  const step = steps.find((s) => top / s <= 3) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let v = 0; v <= top + step - 1 && ticks.length < 5; v += step) ticks.push(v);
  return ticks;
}

function axisValue(metric: Metric, v: number): string {
  if (metric.type === 'duration') {
    if (v === 0) return '0';
    return v % 3600 === 0 ? `${v / 3600}h` : formatDuration(v).replace(' ', '');
  }
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v);
}

function MetricStats({ metric }: { metric: Metric }) {
  const data = useData();
  const { today, dayOf } = data;
  const hue = useHue(metric.color);
  const stats = statsFor(data, metric.id);
  const Icon = iconFor(metric.icon);

  const { rows, periodTotal } = useMemo(() => {
    const start = addDays(today, -(PERIOD - 1));
    // Pull 6 extra days so the first rolling-average point is a full week.
    const days = dateRange(addDays(start, -6), today);
    const totals = days.map((d) => stats.get(d)?.total ?? 0);
    const rows = days.slice(6).map((d, i) => {
      const window = totals.slice(i, i + 7);
      return {
        date: d,
        label: formatLocalDate(d, 'd MMM'),
        total: totals[i + 6],
        avg: window.reduce((a, b) => a + b, 0) / 7,
      };
    });
    return { rows, periodTotal: rows.reduce((s, r) => s + r.total, 0) };
  }, [stats, today]);

  const streaks = useMemo(() => computeStreaks(metric, stats, today), [metric, stats, today]);
  // Don't judge days before the metric existed (or before its first entry, if backfilled).
  const rate = useMemo(() => {
    const first = [...stats.keys()].reduce((min, d) => (d < min ? d : min), dayOf(metric.createdAt));
    const periodStart = addDays(today, -(PERIOD - 1));
    return hitRate(metric, stats, first > periodStart ? first : periodStart, today);
  }, [metric, stats, today, dayOf]);
  const ticks = useMemo(() => niceTicks(metric, Math.max(metric.target ?? 0, ...rows.map((r) => r.total))), [metric, rows]);
  const fmt = (v: number) => (metric.type === 'duration' ? formatDuration(v) : `${formatNumber(Math.round(v))} ${metric.unit}`);

  return (
    <section className="py-5" data-tour="stats-metric" aria-labelledby={`stats-${metric.id}`}>
      <div className="flex items-center gap-2">
        <Icon size={17} style={{ color: hue }} aria-hidden />
        <h2 id={`stats-${metric.id}`} className="text-[16px] font-medium">{metric.name}</h2>
        {metric.archivedAt && <span className="rounded bg-s2 px-1.5 py-0.5 text-[12px] text-ink-3">Archived</span>}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="Current streak" value={streaks ? String(streaks.current) : '–'} />
        <Stat label="Longest streak" value={streaks ? String(streaks.longest) : '–'} />
        <Stat label={`${PERIOD}-day total`} value={formatValue(metric, periodTotal)} />
        <Stat
          label="Target met"
          value={rate && rate.scheduled > 0 ? `${Math.round((rate.hits / rate.scheduled) * 100)}%` : '–'}
          suffix={rate && rate.scheduled > 0 ? `${rate.hits} of ${rate.scheduled}` : undefined}
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm" style={{ background: hue }} />Daily total</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ink-2" />7-day average</span>
        {metric.target != null && (
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-ink-3" />{metric.targetDirection === 'at_most' ? 'Ceiling' : 'Target'}</span>
        )}
      </div>

      <div className="mt-2 h-40" role="img" aria-label={`${metric.name}: daily totals for the last ${PERIOD} days, ${formatValue(metric, periodTotal)} in total`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={6}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            />
            <YAxis
              width={46}
              tickLine={false}
              axisLine={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              interval={0}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickFormatter={(v: number) => axisValue(metric, v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--s2)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <div className="rounded-lg border border-line bg-s3 px-3 py-2 text-[13px] shadow-lg">
                    <div className="text-ink-3">{formatLocalDate(r.date, 'EEE d MMM')}</div>
                    <div className="font-medium text-ink">{fmt(r.total)}</div>
                    <div className="text-ink-2">7-day avg {fmt(r.avg)}</div>
                  </div>
                );
              }}
            />
            {metric.target != null && <ReferenceLine y={metric.target} stroke="var(--ink-3)" strokeDasharray="4 3" />}
            <Bar dataKey="total" fill={hue} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            <Line dataKey="avg" type="monotone" stroke="var(--ink-2)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <SessionNotes metric={metric} title="Notes" />
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-0.5">
        <span className="text-[20px] font-medium tracking-tight">{value}</span>
        {suffix && <span className="ml-1 text-[12px] text-ink-3">{suffix}</span>}
      </dd>
    </div>
  );
}

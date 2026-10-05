import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ChevronLeft, Pencil, TriangleAlert } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate } from '../lib/dates';
import { isScheduled } from '../lib/streaks';
import { setGoalArchived } from '../lib/repo';
import { Button, useToast } from '../components/ui';
import { SessionNotes } from '../components/SessionNotes';
import {
  GoalBar, GoalSheet, daysLeftLabel, fmtDay, fmtGoal, statusLabel, todayNeedLabel, useGoalResult, type GoalSheetState,
} from '../components/Goals';
import type { GoalResult } from '../lib/goals';
import type { Goal, Metric } from '../lib/types';

export function GoalDetail({ id }: { id: string | null }) {
  const { goals, metricById } = useData();
  const goal = goals.find((g) => g.id === id);
  const metric = goal ? metricById.get(goal.metricId) : undefined;
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <a href="#/metrics" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[14px] text-ink-2 hover:bg-s1 hover:text-ink">
        <ChevronLeft size={18} aria-hidden /> Goals
      </a>
      {goal && metric ? (
        <Detail goal={goal} metric={metric} />
      ) : (
        <p className="text-[15px] text-ink-2">This goal no longer exists.</p>
      )}
    </div>
  );
}

function Detail({ goal, metric }: { goal: Goal; metric: Metric }) {
  const { uid, today } = useData();
  const toast = useToast();
  const hue = useHue(metric.color);
  const r = useGoalResult(goal);
  const [sheet, setSheet] = useState<GoalSheetState | null>(null);
  const need = todayNeedLabel(goal, metric, r, today);
  const archive = (v: boolean) => {
    setGoalArchived(uid, goal.id, v);
    toast(v ? `Archived ${goal.name}` : `${goal.name} is active again`);
  };

  return (
    <>
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">{goal.name}</h1>
        <p className="mt-0.5 text-[14px] text-ink-3">
          {metric.name}{metric.archivedAt ? ' (archived)' : ''} · {fmtDay(goal.startDate, today)} to {fmtDay(goal.deadline, today)}
          {goal.archivedAt ? ' · Archived' : r.status !== 'achieved' && r.status !== 'missed' ? ` · ${daysLeftLabel(r)}` : ''}
        </p>
      </header>

      <section className="mt-5" aria-label="Progress">
        <p>
          <span className="text-[34px] leading-none font-medium tracking-tight">{fmtGoal(metric, r.done)}</span>
          <span className="text-[16px] text-ink-3"> of {fmtGoal(metric, goal.targetTotal)}</span>
        </p>
        <div className="mt-4"><GoalBar goal={goal} r={r} color={hue} tall /></div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[16px] font-medium">{statusLabel(goal, metric, r, today)}</span>
          {need && <span className="text-[15px] text-ink-2">{need}</span>}
        </div>
        {r.status !== 'achieved' && r.status !== 'missed' && r.status !== 'not_started' && (
          <p className="mt-1 text-[12px] text-ink-3">The thin mark on the bar is where a steady pace would have you by now.</p>
        )}
      </section>

      <Terminal goal={goal} metric={metric} r={r} onEdit={(focus) => setSheet({ mode: 'edit', goal, focus })} onArchive={() => archive(true)} />

      {r.overloaded && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-s1 px-3 py-2.5 text-[14px] text-ink-2">
          <TriangleAlert size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">The pace needed is now more than double the original plan.</span>
          <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setSheet({ mode: 'edit', goal, focus: 'deadline' })}>
            Change deadline or target
          </button>
        </div>
      )}

      <Figures goal={goal} metric={metric} r={r} />
      <BurnUp goal={goal} metric={metric} r={r} hue={hue} />
      <SessionNotes
        metric={metric}
        from={goal.startDate}
        to={goal.deadline}
        emptyHint="Stop a timer after more than 10 minutes and note what you did. Notes on this goal’s sessions collect here."
      />

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button onClick={() => setSheet({ mode: 'edit', goal })}><Pencil size={16} /> Edit</Button>
        {goal.archivedAt ? (
          <Button onClick={() => archive(false)}><ArchiveRestore size={16} /> Unarchive</Button>
        ) : (
          <Button onClick={() => archive(true)}><Archive size={16} /> Archive</Button>
        )}
      </div>

      <GoalSheet state={sheet} onClose={() => setSheet(null)} onSwitch={setSheet} />
    </>
  );
}

/** Achieved and missed: a quiet summary and the obvious next step. No confetti, no scolding. */
function Terminal({ goal, metric, r, onEdit, onArchive }: { goal: Goal; metric: Metric; r: GoalResult; onEdit: (f: 'deadline' | 'target') => void; onArchive: () => void }) {
  const { today } = useData();
  if (r.status === 'achieved') {
    let early = '';
    if (r.achievedDate && r.achievedDate < goal.deadline) {
      let n = 0;
      for (let d = r.achievedDate; d < goal.deadline; d = addDays(d, 1)) n++;
      early = `, ${n} ${n === 1 ? 'day' : 'days'} before the deadline`;
    }
    return (
      <section className="mt-5 rounded-lg bg-s1 px-4 py-3.5">
        <p className="text-[15px]">
          Reached {fmtGoal(metric, goal.targetTotal)} {r.achievedDate ? (r.achievedDate === today ? 'today' : `on ${fmtDay(r.achievedDate, today)}`) : ''}{early}.
        </p>
        {!goal.archivedAt && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={onArchive}>Archive</Button>
            <Button onClick={() => onEdit('target')}>Raise the target</Button>
          </div>
        )}
      </section>
    );
  }
  if (r.status === 'missed') {
    return (
      <section className="mt-5 rounded-lg bg-s1 px-4 py-3.5">
        <p className="text-[15px]">
          The deadline was {fmtDay(goal.deadline, today)}. Final total {fmtGoal(metric, r.done)}, {fmtGoal(metric, r.remaining)} short of {fmtGoal(metric, goal.targetTotal)}.
        </p>
        {!goal.archivedAt && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => onEdit('deadline')}>Extend deadline</Button>
            <Button onClick={onArchive}>Archive</Button>
          </div>
        )}
      </section>
    );
  }
  return null;
}

function Figures({ goal, metric, r }: { goal: Goal; metric: Metric; r: GoalResult }) {
  const { today } = useData();
  const live = r.status !== 'achieved' && r.status !== 'missed';
  const projection = (() => {
    switch (r.projection.kind) {
      case 'insufficient': return 'Not enough data yet';
      case 'no_recent': return 'No recent activity';
      case 'short': return `${fmtGoal(metric, r.projection.projectedTotal)}, ${fmtGoal(metric, r.projection.shortfall)} short`;
      case 'finishes': return r.projection.finishDate < goal.deadline ? `Finishes ${fmtDay(r.projection.finishDate, today)}` : 'Finishes on the deadline';
      default: return '–';
    }
  })();
  const rows: [string, string][] = [
    ['Required pace', live && r.requiredPerDay !== null ? `${fmtGoal(metric, r.requiredPerDay, 'up')} a day` : '–'],
    ['Planned pace', r.totalPaceDays ? `${fmtGoal(metric, r.idealPerDay, 'up')} a day` : '–'],
    ['Recent rate (14 days)', r.recentRate !== null ? `${fmtGoal(metric, r.recentRate)} a day` : '–'],
    ['Projection', live ? projection : '–'],
    ['Work days left', live ? `${r.paceDaysLeft} of ${r.totalPaceDays}` : `${r.totalPaceDays} in total`],
    ['Remaining', fmtGoal(metric, r.remaining)],
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] text-ink-3">{k}</dt>
          <dd className="mt-0.5 text-[16px] font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Burn-up: cumulative done, the steady-pace line, and the projection ────

function niceStep(metric: Metric, max: number): number {
  const unit = metric.type === 'duration' ? 3600 : 1;
  const top = Math.max(max / unit, 1);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return (steps.find((s) => top / s <= 4) ?? steps[steps.length - 1]) * unit;
}

function BurnUp({ goal, metric, r, hue }: { goal: Goal; metric: Metric; r: GoalResult; hue: string }) {
  const { entries, today } = useData();

  const rows = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of entries) {
      if (e.metricId !== goal.metricId || e.localDate < goal.startDate || e.localDate > goal.deadline) continue;
      byDate.set(e.localDate, (byDate.get(e.localDate) ?? 0) + e.value);
    }
    const projecting = r.projection.kind === 'short' || r.projection.kind === 'finishes';
    const rate = r.recentRate ?? 0;
    const todayRemainder = r.todayIsPaceDay ? Math.max(0, rate - r.doneToday) : 0;
    const out: { date: string; actual: number | null; ideal: number; projected: number | null }[] = [];
    let actual = goal.priorProgress;
    let paceSoFar = 0;
    let projected: number | null = null;
    for (let d = goal.startDate; d <= goal.deadline; d = addDays(d, 1)) {
      if (isScheduled(goal.paceSchedule, d)) paceSoFar++;
      actual += byDate.get(d) ?? 0;
      const ideal = goal.priorProgress + r.idealPerDay * paceSoFar;
      if (projecting && d === today) projected = actual;
      else if (projecting && projected !== null && d > today) {
        projected += (d === addDays(today, 1) ? todayRemainder : 0) + (isScheduled(goal.paceSchedule, d) ? rate : 0);
      }
      out.push({ date: d, actual: d <= today ? actual : null, ideal, projected: projecting && d >= today ? projected : null });
    }
    return out;
  }, [entries, goal, r, today]);

  const max = Math.max(goal.targetTotal, ...rows.map((x) => Math.max(x.actual ?? 0, x.projected ?? 0)));
  const step = niceStep(metric, max);
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(v);
  const axis = (v: number) => (metric.type === 'duration' ? `${v / 3600}h` : formatTick(v));
  const showProjection = rows.some((x) => x.projected !== null);
  const lastActualIndex = rows.reduce((last, x, i) => (x.actual !== null ? i : last), -1);
  const todayInRange = today >= goal.startDate && today <= goal.deadline;

  return (
    <section className="mt-6" aria-labelledby="burnup-h">
      <h2 id="burnup-h" className="text-[15px] font-medium">Progress over time</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: hue }} />Done</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ink-3" />Steady pace</span>
        {showProjection && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: hue }} />Projected</span>}
      </div>
      <div
        className="mt-2 h-56"
        role="img"
        aria-label={`Burn-up chart: ${fmtGoal(metric, r.done)} done of ${fmtGoal(metric, goal.targetTotal)}, against a steady pace from ${fmtDay(goal.startDate, today)} to ${fmtDay(goal.deadline, today)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickFormatter={(d: string) => formatLocalDate(d, 'd MMM')}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              interval={0}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickFormatter={axis}
            />
            {todayInRange && <ReferenceLine x={today} stroke="var(--ink-3)" strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fill: 'var(--ink-3)', fontSize: 11 }} />}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof rows)[number];
                return (
                  <div className="rounded-lg border border-line bg-s3 px-3 py-2 text-[13px] shadow-lg">
                    <div className="text-ink-3">{formatLocalDate(p.date, 'EEE d MMM')}</div>
                    {p.actual !== null && <div className="font-medium text-ink">Done {fmtGoal(metric, p.actual)}</div>}
                    {p.projected !== null && p.date > today && <div className="text-ink-2">Projected {fmtGoal(metric, p.projected)}</div>}
                    <div className="text-ink-2">Steady pace {fmtGoal(metric, p.ideal)}</div>
                  </div>
                );
              }}
            />
            <Line dataKey="ideal" type="linear" stroke="var(--ink-3)" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
            <Line dataKey="projected" type="linear" stroke={hue} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            <Line
              dataKey="actual"
              type="linear"
              stroke={hue}
              strokeWidth={2}
              // Mark where "done" stands now; on a goal's first day the line is a single point.
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                p.index === lastActualIndex && p.cx != null && p.cy != null ? (
                  <circle key="now" cx={p.cx} cy={p.cy} r={4} fill={hue} stroke="var(--bg)" strokeWidth={2} />
                ) : (
                  <g key={`d${p.index}`} />
                )
              }
              activeDot={{ r: 4, stroke: 'var(--bg)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function formatTick(v: number): string {
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v);
}

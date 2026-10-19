import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronRight, FileText, Flag, GripVertical, ListChecks, Plus } from 'lucide-react';
import { useData } from '../state/DataContext';
import { usePlans } from '../state/PlansContext';
import { useHue } from '../state/theme';
import { reorderMetrics } from '../lib/repo';
import { iconFor } from '../lib/icons';
import { formatTarget } from '../lib/format';
import { Sheet, WEEKDAYS, cx } from '../components/ui';
import { PlanFormSheet, PlanLine } from '../components/Plans';
import { PlanImportSheet } from '../components/PlanImport';
import { MetricEditor } from '../components/MetricEditor';
import { GoalSheet, fmtGoal, statusLabel, useGoalResult, type GoalSheetState } from '../components/Goals';
import type { Goal, Metric } from '../lib/types';

export function Metrics() {
  const { metrics } = useData();
  const [editing, setEditing] = useState<Metric | 'new' | null>(null);
  const [goalSheet, setGoalSheet] = useState<GoalSheetState | null>(null);
  // "New goal" asks which kind first: an amount by a date, or a Plan of tasks.
  const [newKind, setNewKind] = useState(false);
  const [planSheet, setPlanSheet] = useState<'import' | 'empty' | null>(null);
  const active = metrics.filter((m) => !m.archivedAt);
  const archived = metrics.filter((m) => m.archivedAt);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">Metrics</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          data-tour="metrics-new"
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-ink px-4 text-[15px] font-medium text-bg"
        >
          <Plus size={18} /> New metric
        </button>
      </div>

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[14px] text-ink-2">
          Create a metric for anything you want to count or time. It’s ready to log as soon as you save it.
        </p>
      ) : (
        <ReorderList metrics={active} onOpen={setEditing} />
      )}
      {active.length > 1 && <p className="mt-2 text-[12px] text-ink-3">Drag the handle to change the order on Today.</p>}

      <GoalsSection onNew={() => setNewKind(true)} />

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-medium text-ink-2">Archived</h2>
          <p className="mb-2 text-[13px] text-ink-3">Hidden from Today. History and stats are kept.</p>
          <ul className="divide-y divide-line border-y border-line">
            {archived.map((m) => (
              <MetricLine key={m.id} metric={m} onOpen={() => setEditing(m)} />
            ))}
          </ul>
        </section>
      )}

      <MetricEditor
        target={editing}
        onClose={() => setEditing(null)}
        onGoal={(metricId) => {
          setEditing(null);
          setGoalSheet({ mode: 'new', metricId });
        }}
      />
      <GoalSheet state={goalSheet} onClose={() => setGoalSheet(null)} onSwitch={setGoalSheet} />
      <Sheet open={newKind} onClose={() => setNewKind(false)} title="New goal">
        <div className="mt-2 flex flex-col gap-2" data-testid="goal-kinds">
          <KindButton icon={<Flag size={18} />} title="Amount goal" body="A total to reach by a date, like 120 hours of Network+ by 15 December." onClick={() => { setNewKind(false); setGoalSheet({ mode: 'new' }); }} />
          <KindButton icon={<FileText size={18} />} title="Plan: import from Markdown" body="Paste a plan’s checklist. Its sections, tasks, dates and checkpoints come along." onClick={() => { setNewKind(false); setPlanSheet('import'); }} />
          <KindButton icon={<ListChecks size={18} />} title="Plan: start empty" body="A list of tasks to get through by a date. Add the tasks yourself." onClick={() => { setNewKind(false); setPlanSheet('empty'); }} />
        </div>
      </Sheet>
      <PlanImportSheet open={planSheet === 'import'} onClose={() => setPlanSheet(null)} />
      <PlanFormSheet plan={null} open={planSheet === 'empty'} onClose={() => setPlanSheet(null)} />
    </div>
  );
}

function KindButton({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex w-full items-start gap-3 rounded-xl border border-line px-3 py-3 text-left hover:bg-s2">
      <span className="mt-0.5 text-ink-2">{icon}</span>
      <span>
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-ink-3">{body}</span>
      </span>
    </button>
  );
}

/** Active goals and plans first (nearest deadline), then archived ones with how they ended. */
function GoalsSection({ onNew }: { onNew: () => void }) {
  const { goals } = useData();
  const { plans } = usePlans();
  const activePlans = plans.filter((p) => !p.archivedAt);
  const archivedPlans = plans.filter((p) => p.archivedAt);
  const active = goals.filter((g) => !g.archivedAt);
  const archived = goals.filter((g) => g.archivedAt).sort((a, b) => b.deadline.localeCompare(a.deadline));
  return (
    <section className="mt-8" data-tour="metrics-goals" aria-labelledby="goals-h">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="goals-h" className="text-[16px] font-medium">Deadline goals</h2>
        <button type="button" onClick={onNew} className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-s2 px-3 text-[14px] font-medium hover:bg-s3">
          <Plus size={16} /> New goal
        </button>
      </div>
      {goals.length === 0 && plans.length === 0 ? (
        <p className="text-[14px] text-ink-3">
          A total to reach by a date, like 120 hours of Network+ by 15 December, or a plan of tasks to get through. The app tracks whether you’re on pace.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {active.map((g) => <GoalLine key={g.id} goal={g} />)}
          {activePlans.map((p) => <PlanLine key={p.id} plan={p} />)}
          {archived.map((g) => <GoalLine key={g.id} goal={g} />)}
          {archivedPlans.map((p) => <PlanLine key={p.id} plan={p} />)}
        </ul>
      )}
    </section>
  );
}

function GoalLine({ goal }: { goal: Goal }) {
  const { metricById, today } = useData();
  const metric = metricById.get(goal.metricId)!;
  const hue = useHue(metric.color);
  const r = useGoalResult(goal);
  let detail: string;
  if (!goal.archivedAt) detail = `${statusLabel(goal, metric, r, today)} · ${fmtGoal(metric, r.done)} of ${fmtGoal(metric, goal.targetTotal)}`;
  else if (r.status === 'achieved' || r.status === 'missed') detail = `Archived · ${statusLabel(goal, metric, r, today)}`;
  else detail = `Archived early · ${fmtGoal(metric, r.done)} of ${fmtGoal(metric, goal.targetTotal)}`;
  return (
    <li>
      <a href={`#/goals/${goal.id}`} className="flex min-h-14 items-center gap-3 py-2 pr-1 hover:bg-s1/60">
        <Flag size={17} style={{ color: hue }} aria-hidden className="ml-1 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[15px] font-medium', goal.archivedAt && 'text-ink-2')}>{goal.name}</span>
          <span className="block truncate text-[13px] text-ink-3">{detail}</span>
        </span>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </a>
    </li>
  );
}

function ReorderList({ metrics, onOpen }: { metrics: Metric[]; onOpen: (m: Metric) => void }) {
  const { uid } = useData();
  const [order, setOrder] = useState(() => metrics.map((m) => m.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Follow upstream changes (new metric, other device) when not mid-drag.
  const key = metrics.map((m) => m.id).join(',');
  useEffect(() => {
    if (!dragId) setOrder(metrics.map((m) => m.id));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(metrics.map((m) => [m.id, m]));
  const commit = (ids: string[]) => {
    if (ids.join(',') !== metrics.map((m) => m.id).join(',')) reorderMetrics(uid, ids);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!dragId) return;
    const y = e.clientY;
    setOrder((cur) => {
      const from = cur.indexOf(dragId);
      let to = from;
      cur.forEach((id, i) => {
        if (id === dragId) return;
        const r = rowRefs.current.get(id)?.getBoundingClientRect();
        if (!r) return;
        const mid = r.top + r.height / 2;
        if (i < from && y < mid) to = Math.min(to, i);
        if (i > from && y > mid) to = Math.max(to, i);
      });
      if (to === from) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };

  const move = (id: string, delta: number) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    commit(next);
  };

  return (
    <ul className="divide-y divide-line border-y border-line" data-tour="metrics-list">
      {order.map((id) => {
        const m = byId.get(id);
        if (!m) return null;
        return (
          <MetricLine
            key={id}
            metric={m}
            dragging={dragId === id}
            liRef={(el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            onOpen={() => onOpen(m)}
            handle={
              <button
                type="button"
                aria-label={`Reorder ${m.name}. Use arrow keys to move.`}
                className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-3 hover:bg-s2 active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDragId(id);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={() => {
                  setDragId(null);
                  commit(order);
                }}
                onPointerCancel={() => {
                  setDragId(null);
                  setOrder(metrics.map((x) => x.id));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(id, -1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(id, 1); }
                }}
              >
                <GripVertical size={18} />
              </button>
            }
          />
        );
      })}
    </ul>
  );
}

function scheduleText(m: Metric): string {
  if (m.schedule.kind === 'daily') return 'Daily';
  if (m.schedule.days.length === 0) return 'No days';
  return m.schedule.days.map((d) => WEEKDAYS[d]).join(' ');
}

function MetricLine({
  metric,
  onOpen,
  handle,
  dragging,
  liRef,
}: {
  metric: Metric;
  onOpen: () => void;
  handle?: ReactNode;
  dragging?: boolean;
  liRef?: (el: HTMLLIElement | null) => void;
}) {
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);
  return (
    <li ref={liRef} className={cx('flex items-center gap-1', dragging && 'relative z-10 rounded-lg bg-s2')}>
      {handle}
      <button type="button" onClick={onOpen} className="flex min-h-14 flex-1 items-center gap-3 py-2 pr-1 text-left">
        <Icon size={18} style={{ color: hue }} aria-hidden className={handle ? '' : 'ml-3'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{metric.name}</span>
          <span className="block truncate text-[13px] text-ink-3">
            {scheduleText(metric)} ·{' '}
            {formatTarget(metric) ?? 'no target'}
            {metric.timerEnabled && ' · timer'}
          </span>
        </span>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </button>
    </li>
  );
}

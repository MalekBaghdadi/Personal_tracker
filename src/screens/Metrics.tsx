import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { reorderMetrics } from '../lib/repo';
import { iconFor } from '../lib/icons';
import { formatValue } from '../lib/format';
import { WEEKDAYS, cx } from '../components/ui';
import { MetricEditor } from '../components/MetricEditor';
import type { Metric } from '../lib/types';

export function Metrics() {
  const { metrics } = useData();
  const [editing, setEditing] = useState<Metric | 'new' | null>(null);
  const active = metrics.filter((m) => !m.archivedAt);
  const archived = metrics.filter((m) => m.archivedAt);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">Metrics</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
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

      <MetricEditor target={editing} onClose={() => setEditing(null)} />
    </div>
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
    <ul className="divide-y divide-line border-y border-line">
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
            {metric.target == null
              ? 'no target'
              : `${metric.targetDirection === 'at_most' ? 'at most' : 'at least'} ${formatValue(metric, metric.target)}`}
            {metric.timerEnabled && ' · timer'}
          </span>
        </span>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </button>
    </li>
  );
}

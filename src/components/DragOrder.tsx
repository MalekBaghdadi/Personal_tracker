import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * Pointer-based drag to reorder (works on iOS, unlike HTML5 drag and drop),
 * with arrow keys on the handle. The same approach as the Metrics list.
 * `onCommit` gets the new order once, when the drag ends.
 */
export function useDragOrder(ids: string[], onCommit: (ids: string[]) => void) {
  const [order, setOrder] = useState(ids);
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const key = ids.join(',');
  useEffect(() => {
    if (!dragId) setOrder(ids);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: string[]) => {
    if (next.join(',') !== key) onCommit(next);
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
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!dragId) return;
    const y = e.clientY;
    setOrder((cur) => {
      const from = cur.indexOf(dragId);
      let to = from;
      cur.forEach((id, i) => {
        if (id === dragId) return;
        const r = rows.current.get(id)?.getBoundingClientRect();
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

  return {
    order,
    dragging: dragId,
    rowRef: (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    handle: (id: string, label: string) => (
      <button
        type="button"
        aria-label={`${label}. Use arrow keys to move.`}
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-3 hover:bg-s2 active:cursor-grabbing"
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
          setOrder(ids);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); move(id, -1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); move(id, 1); }
        }}
      >
        <GripVertical size={17} />
      </button>
    ),
  };
}

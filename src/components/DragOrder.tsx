import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { orderByX } from '../lib/reorder';

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

/** The centre of an item's slot in its row, in page coordinates. Ignores transforms, so a card being dragged doesn't skew it. */
const slotMid = (el: HTMLElement) => (el.offsetParent?.getBoundingClientRect().left ?? 0) + el.offsetLeft + el.offsetWidth / 2;

/**
 * Press and hold to reorder a row of items (the Profile showcase): hold one for `ms`, then drag it sideways
 * and let go. Moving before the hold is up is a plain touch (a tap, or a page scroll), so nothing changes.
 * Shift + Left/Right on the focused item moves it too. `onCommit` gets the new order once, on release.
 * The row's parent must be positioned (`relative`), since slots are measured from it.
 *
 * Spread `item(id)` on each item (the one that moves) and wrap the inner button's click in `guard`, so
 * letting go after a drag doesn't also open it.
 */
export function useHoldDragOrder(ids: string[], onCommit: (ids: string[]) => void, ms = 400) {
  const [order, setOrder] = useState(ids);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [drag, setDrag] = useState<{ id: string; x: number } | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const lefts = useRef(new Map<string, number>());
  const press = useRef<{ id: string; x: number; y: number; pointerId: number; grab: number; timer: number; active: boolean } | null>(null);
  const swallow = useRef(false);
  const focusId = useRef<string | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!press.current?.active) {
      orderRef.current = ids;
      setOrder(ids);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  };
  const commit = (next: string[]) => {
    if (next.join(',') !== key) onCommit(next);
  };

  // After every render: the dragged item follows the finger, the others slide to their new slots, a moved item keeps focus.
  useLayoutEffect(() => {
    items.current.forEach((el, id) => {
      const left = el.offsetLeft;
      const prev = lefts.current.get(id);
      if (drag?.id === id) el.style.transform = `translateX(${drag.x - slotMid(el)}px) scale(1.06)`;
      else if (prev !== undefined && prev !== left) el.animate([{ transform: `translateX(${prev - left}px)` }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
      lefts.current.set(id, left);
    });
    if (focusId.current) {
      items.current.get(focusId.current)?.querySelector('button')?.focus();
      focusId.current = null;
    }
  });
  // Once a card is lifted the finger belongs to it: stop the page scrolling under it.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, [dragging]);

  const release = (id: string) => {
    const el = items.current.get(id);
    const last = el?.style.transform;
    if (el) el.style.transform = '';
    if (el && last) el.animate([{ transform: last }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    setDrag(null);
  };
  const cancel = () => {
    const p = press.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    press.current = null;
    if (p.active) {
      release(p.id);
      put(ids);
    }
  };
  const move = (id: string, delta: number) => {
    const cur = orderRef.current;
    const to = cur.indexOf(id) + delta;
    if (to < 0 || to >= cur.length) return;
    const next = [...cur];
    next.splice(cur.indexOf(id), 1);
    next.splice(to, 0, id);
    focusId.current = id;
    put(next);
    commit(next);
  };

  return {
    order,
    /** Wrap the inner button's onClick, so the release after a drag doesn't open it. */
    guard: (fn: () => void) => () => {
      if (swallow.current) {
        swallow.current = false;
        return;
      }
      fn();
    },
    /** Spread onto each item. With fewer than two there is nothing to reorder. */
    item: (id: string) => {
      const ref = (el: HTMLElement | null) => {
        if (el) items.current.set(id, el);
        else items.current.delete(id);
      };
      if (ids.length < 2) return { ref };
      return {
        ref,
        'data-dragging': drag?.id === id,
        // pan-y: the page still scrolls from here; sideways belongs to the drag. No iOS callout or text selection while holding.
        style: { touchAction: 'pan-y', userSelect: 'none', WebkitTouchCallout: 'none', zIndex: drag?.id === id ? 10 : undefined } as const,
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
          swallow.current = false;
          if (e.button !== 0) return;
          cancel();
          const el = items.current.get(id);
          if (!el) return;
          const p = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, grab: e.clientX - slotMid(el), timer: 0, active: false };
          p.timer = window.setTimeout(() => {
            p.active = true;
            el.setPointerCapture(p.pointerId);
            navigator.vibrate?.(12);
            setDrag({ id, x: p.x - p.grab });
          }, ms);
          press.current = p;
        },
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
          const p = press.current;
          if (!p || p.id !== id) return;
          if (!p.active) {
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancel();
            return;
          }
          const x = e.clientX - p.grab;
          const mids: Record<string, number> = {};
          for (const o of orderRef.current) if (o !== id) mids[o] = slotMid(items.current.get(o)!);
          put(orderByX(orderRef.current, id, x, mids));
          setDrag({ id, x });
        },
        onPointerUp: () => {
          const p = press.current;
          if (!p) return;
          window.clearTimeout(p.timer);
          press.current = null;
          if (!p.active) return;
          swallow.current = true;
          release(p.id);
          commit(orderRef.current);
        },
        onPointerCancel: cancel,
        // Android sends a context menu after a long press; the hold is ours.
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            move(id, e.key === 'ArrowLeft' ? -1 : 1);
          }
        },
      };
    },
  };
}

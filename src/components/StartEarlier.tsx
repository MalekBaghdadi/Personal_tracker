import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useData } from '../state/DataContext';
import { ABANDONED_AFTER_S, useTimerActions } from '../state/TimerContext';
import { addDays, instantAt, todayIn } from '../lib/dates';
import { Button, FieldError, Label, Sheet, inputClass } from './ui';
import type { Metric } from '../lib/types';

const AGO_MINUTES = [5, 10, 15, 30, 45, 60];

/**
 * Press-and-hold for a button. `onLong` fires after `ms`; the click that
 * follows the release is swallowed so the button's normal action doesn't run.
 * Right-click does the same on desktop.
 */
export function useLongPress(onLong: () => void, ms = 500) {
  const t = useRef<number>();
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(t.current);
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      if (e.button !== 0) return;
      cancel();
      t.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      if (fired.current) return; // Android also sends contextmenu after a long press
      fired.current = true;
      onLong();
    },
  };
  return {
    /** Spread onto the button. */
    handlers,
    /** Wrap the button's onClick with this. */
    guard: (fn: () => void) => () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      fn();
    },
  };
}

/** "Forgot to press start": begin the timer a few minutes, or at a set time, in the past. */
export function StartEarlierSheet({ metric, open, onClose }: { metric: Metric; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Start ${metric.name} earlier`}>
      {open && <Form metric={metric} onDone={onClose} />}
    </Sheet>
  );
}

function Form({ metric, onDone }: { metric: Metric; onDone: () => void }) {
  const { tz } = useData();
  const { start } = useTimerActions();
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (startedAt: Date) => {
    start(metric.id, startedAt.toISOString());
    onDone();
  };

  return (
    <div>
      <p className="text-[15px] text-ink-2">Forgot to press start? The timer picks up from when you actually began.</p>
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Started this long ago">
        {AGO_MINUTES.map((m) => (
          <Button key={m} onClick={() => go(new Date(Date.now() - m * 60_000))} aria-label={`Started ${m} minutes ago`}>
            {m === 60 ? '1h' : `${m}m`} ago
          </Button>
        ))}
      </div>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{2}:\d{2}$/.test(time)) return setError('Pick the time you started.');
          // A clock time on today's calendar date (not the tracking day, which may
          // still be yesterday after midnight). Later than now means last night,
          // e.g. 23:30 when it's now 00:20.
          const calendarToday = todayIn(tz);
          let at = instantAt(calendarToday, time, tz);
          if (at.getTime() > Date.now()) at = instantAt(addDays(calendarToday, -1), time, tz);
          if ((Date.now() - at.getTime()) / 1000 > ABANDONED_AFTER_S) return setError('That’s more than 12 hours ago. Add it as a manual entry instead.');
          go(at);
        }}
      >
        <Label htmlFor="start-at">Or started at</Label>
        <div className="flex gap-2">
          <input
            id="start-at"
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" variant="primary" className="shrink-0 px-5">Start</Button>
        </div>
        <FieldError>{error}</FieldError>
      </form>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useData } from './DataContext';
import { addEntry, discardTimer, softDeleteEntry, startTimer, stopTimer } from '../lib/repo';
import { formatDuration } from '../lib/format';
import { localDateOf } from '../lib/dates';
import { Button, Sheet, useToast } from '../components/ui';
import { DurationInput, parseDuration } from '../components/inputs';

export const ABANDONED_AFTER_S = 12 * 3600;

/**
 * Elapsed seconds since an ISO instant, recomputed every animation frame and
 * re-rendering only when the whole second changes. No counter is ever stored,
 * so backgrounding, locking or suspending the app can't make it drift.
 */
export function useElapsed(startedAt: string | null | undefined): number {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  const calc = () => (Number.isNaN(start) ? 0 : Math.floor((Date.now() - start) / 1000));
  const [elapsed, setElapsed] = useState(calc);
  useEffect(() => {
    if (Number.isNaN(start)) return;
    let raf = 0;
    let last = -Infinity;
    const loop = () => {
      const v = Math.floor((Date.now() - start) / 1000);
      if (v !== last) {
        last = v;
        setElapsed(v);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    // rAF pauses in background tabs; recompute the moment we're visible again.
    const onVis = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [start]);
  return Number.isNaN(start) ? 0 : elapsed;
}

interface TimerActions {
  /** Start a timer, prompting if another one is running. */
  start: (metricId: string) => void;
  stop: () => boolean;
}

const Ctx = createContext<TimerActions | null>(null);
export function useTimerActions(): TimerActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTimerActions outside TimerProvider');
  return v;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { uid, timer, metricById, tz } = useData();
  const toast = useToast();
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const elapsed = useElapsed(timer?.startedAt);

  const metricName = (id: string) => metricById.get(id)?.name ?? 'Deleted metric';

  /** Returns false when the stop was diverted to the recovery prompt. */
  const doStop = useCallback((): boolean => {
    if (!timer) return true;
    const raw = Math.floor((Date.now() - Date.parse(timer.startedAt)) / 1000);
    if (raw > ABANDONED_AFTER_S) {
      setRecovering(true);
      return false;
    }
    if (raw < 0) {
      // §8.6: clock skew between devices. Never record a negative value.
      discardTimer(uid, timer);
      toast("This device's clock is behind the one that started the timer, so nothing was recorded.");
      return true;
    }
    const id = stopTimer(uid, timer, raw, tz);
    const name = metricName(timer.metricId);
    if (id) toast(`Logged ${formatDuration(raw)} to ${name}`, { label: 'Undo', run: () => softDeleteEntry(uid, id) });
    else toast('Timer stopped. Under a second, so nothing was logged.');
    return true;
  }, [timer, uid, tz, toast, metricById]);

  const start = useCallback(
    (metricId: string) => {
      if (timer) {
        if (timer.metricId !== metricId) setSwitchTo(metricId);
        return;
      }
      startTimer(uid, metricId);
    },
    [timer, uid],
  );

  // §8.5: on open (or whenever it's noticed), a timer past 12h asks rather than records.
  const abandoned = timer != null && elapsed > ABANDONED_AFTER_S;
  useEffect(() => {
    if (abandoned) setRecovering(true);
  }, [abandoned]);
  useEffect(() => {
    if (!timer) setRecovering(false);
  }, [timer]);

  const actions = useMemo(() => ({ start, stop: doStop }), [start, doStop]);

  return (
    <Ctx.Provider value={actions}>
      {children}

      <Sheet open={switchTo !== null && timer !== null} onClose={() => setSwitchTo(null)} title="Another timer is running">
        {timer && switchTo && (
          <>
            <p className="text-[15px] text-ink-2">
              {metricName(timer.metricId)} has been running for {formatDuration(Math.max(0, elapsed))}. Stop it and
              start {metricName(switchTo)}?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (doStop()) startTimer(uid, switchTo);
                  setSwitchTo(null);
                }}
              >
                Stop {metricName(timer.metricId)} and start {metricName(switchTo)}
              </Button>
              <Button onClick={() => setSwitchTo(null)}>Keep {metricName(timer.metricId)} running</Button>
            </div>
          </>
        )}
      </Sheet>

      {timer && recovering && (
        <AbandonedTimerSheet
          metricName={metricName(timer.metricId)}
          startedAt={timer.startedAt}
          tz={tz}
          onDiscard={() => {
            discardTimer(uid, timer);
            setRecovering(false);
            toast('Timer discarded');
          }}
          onSave={(seconds) => {
            discardTimer(uid, timer);
            const id = addEntry(uid, {
              metricId: timer.metricId,
              value: seconds,
              source: 'manual',
              localDate: localDateOf(timer.startedAt, tz),
              occurredAt: timer.startedAt,
            });
            setRecovering(false);
            toast(`Logged ${formatDuration(seconds)} to ${metricName(timer.metricId)}`, {
              label: 'Undo',
              run: () => softDeleteEntry(uid, id),
            });
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function AbandonedTimerSheet({
  metricName,
  startedAt,
  tz,
  onDiscard,
  onSave,
}: {
  metricName: string;
  startedAt: string;
  tz: string;
  onDiscard: () => void;
  onSave: (seconds: number) => void;
}) {
  // Deliberately empty: the elapsed time is almost certainly wrong.
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [error, setError] = useState<string | null>(null);
  const started = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(startedAt));

  return (
    <Sheet open onClose={() => {}} dismissable={false} title={`${metricName} timer was left running`}>
      <p className="text-[15px] text-ink-2">
        It started {started} and has run for over 12 hours. Enter how long you actually spent, or discard it.
      </p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const s = parseDuration(h, m);
          if (!(s > 0)) return setError('Enter a duration above zero.');
          onSave(s);
        }}
      >
        <DurationInput hours={h} minutes={m} onHours={setH} onMinutes={setM} autoFocus />
        {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <Button type="submit" variant="primary">Log this duration</Button>
          <Button variant="danger" onClick={onDiscard}>Discard the timer</Button>
        </div>
      </form>
    </Sheet>
  );
}

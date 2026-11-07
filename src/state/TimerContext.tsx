import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData } from './DataContext';
import { useCompete } from './CompeteContext';
import { usePlans } from './PlansContext';
import { addEntry, discardTimer, finishLockStop, forgetOwnTimer, ownTimer, softDeleteEntry, startTimer, stopTimer, updateEntry } from '../lib/repo';
import { setTaskDone, updateTask } from '../lib/plansRepo';
import { formatDuration } from '../lib/format';
import { formatTimeIn } from '../lib/dates';
import { local } from '../lib/device';
import { LockTimer, isNative, onNativeWake, quietly, type LockStop } from '../lib/native';
import { lockFollowUp, nextLockStep } from '../lib/lockStops';
import { Button, Sheet, useToast } from '../components/ui';
import { DurationInput, parseDuration } from '../components/inputs';

export const ABANDONED_AFTER_S = 12 * 3600;
/** Timer sessions longer than this ask what was accomplished. */
export const NOTE_PROMPT_AFTER_S = 10 * 60;

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
  /** Start a timer, prompting if another one is running. `startedAt` backdates it. */
  start: (metricId: string, startedAt?: string) => void;
  stop: () => boolean;
}

const Ctx = createContext<TimerActions | null>(null);
export function useTimerActions(): TimerActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTimerActions outside TimerProvider');
  return v;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { uid, timer, metricById, tz, dayOf, entries, timerKnown, timerFromServer } = useData();
  const { sharedWith } = useCompete();
  const { plans, resultOf } = usePlans();
  const toast = useToast();
  const [switchTo, setSwitchTo] = useState<{ metricId: string; startedAt?: string } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const elapsed = useElapsed(timer?.startedAt);

  const metricName = (id: string) => metricById.get(id)?.name ?? 'Deleted metric';

  /** The toast after a timer session: Undo, and over 10 minutes "What did you accomplish?". */
  const announce = useCallback((id: string | null, metricId: string, startedAt: string, raw: number, where = '') => {
    const name = metricName(metricId);
    const partner = sharedWith(metricId, dayOf(startedAt));
    // A Plan linked to this metric offers its current task in the note prompt.
    const linked = plans.find((p) => p.metricId === metricId && !p.archivedAt && resultOf(p.id).current);
    const current = linked ? resultOf(linked.id).current : null;
    const task = linked && current
      ? {
        title: `${current.title.replace(/[*`_]/g, '')}`,
        mark: (done: boolean) => setTaskDone(uid, current.id, done),
        saveNote: (note: string) => updateTask(uid, current.id, { note }),
      }
      : undefined;
    if (id)
      toast(
        `Logged ${formatDuration(raw)} to ${name}${where}`,
        { label: 'Undo', run: () => softDeleteEntry(uid, id) },
        raw > NOTE_PROMPT_AFTER_S ? { note: { prompt: 'What did you accomplish?', hint: partner ? `${partner} sees this note (challenge day)` : undefined, save: (note) => updateEntry(uid, id, { note }), task } } : undefined,
      );
    else toast('Timer stopped. Under a second, so nothing was logged.');
  }, [uid, dayOf, toast, metricById, sharedWith, plans, resultOf]);

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
    announce(stopTimer(uid, timer, raw, dayOf), timer.metricId, timer.startedAt, raw);
    return true;
  }, [timer, uid, dayOf, toast, announce]);

  const start = useCallback(
    (metricId: string, startedAt?: string) => {
      if (timer) {
        if (timer.metricId !== metricId) setSwitchTo({ metricId, startedAt });
        return;
      }
      startTimer(uid, metricId, startedAt);
      // Android app: the lock-screen Stop needs notifications. Ask once, when it's first useful.
      if (isNative && local.get('pt.notificationsAsked') !== '1') {
        local.set('pt.notificationsAsked', '1');
        void quietly(LockTimer.requestNotifications());
      }
    },
    [timer, uid],
  );

  // ── Android: the running timer on the lock screen (src/lib/native.ts) ──────
  const [wake, setWake] = useState(0);
  useEffect(() => onNativeWake(() => setWake((w) => w + 1)), []);
  const shownMetric = timer ? metricById.get(timer.metricId) : undefined;
  const shownName = shownMetric?.name ?? 'Timer';
  const shownColor = shownMetric?.color ?? '#8590a3';
  useEffect(() => {
    if (!isNative || !timerKnown) return;
    if (!timer) {
      void quietly(LockTimer.clear());
      return;
    }
    // Shown again on every wake: Android 14+ lets the notification be swiped away.
    void quietly(LockTimer.show({
      uid,
      metricId: timer.metricId,
      metricName: shownName,
      color: shownColor,
      startedAt: timer.startedAt,
      // Never a whole number: APKs up to android-1.1 read it with Capacitor's getDouble(), which
      // refuses one this big (the bridge parses it as a Long), so no notification ever showed.
      // The native side drops the half. Remove once no phone runs android-1.1 or older.
      startedAtMs: Date.parse(timer.startedAt) + 0.5,
      localDate: dayOf(timer.startedAt),
      sinceText: formatTimeIn(timer.startedAt, tz),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKnown, timer?.startedAt, timer?.metricId, shownName, shownColor, uid, dayOf, tz, wake]);

  // A timer stopped from the lock screen: finish it if the APK couldn't, then owe what the lock
  // screen couldn't ask (the note prompt, or the over-12-hours sheet). See lib/lockStops.ts.
  const [heldStops, setHeldStops] = useState<LockStop[]>([]);
  const live = useRef({ uid, timer, timerFromServer, entries, announce });
  live.current = { uid, timer, timerFromServer, entries, announce };
  const processing = useRef(false);
  const again = useRef(false);
  const followedUp = useRef(new Set<string>());
  const processStops = useCallback(async function run(): Promise<void> {
    if (!isNative) return;
    // A stop that lands mid-run gets its own pass straight after.
    if (processing.current) {
      again.current = true;
      return;
    }
    processing.current = true;
    try {
      const res = await quietly(LockTimer.getStops());
      let waiting = 0;
      for (const s of res?.stops ?? []) {
        const now = live.current;
        const step = nextLockStep(s, {
          uid: now.uid,
          timer: now.timer,
          timerFromServer: now.timerFromServer,
          hasEntry: (id) => now.entries.some((e) => e.id === id),
        });
        if (step.do === 'skip') continue;
        if (step.do === 'wait') {
          waiting++;
          continue;
        }
        let stop: LockStop = s;
        if (step.do === 'complete' || step.do === 'settle') {
          const outcome = step.do === 'complete' ? 'saved' : step.outcome;
          // Claimed before writing, so the APK's own retry never acts on it too.
          const r = await quietly(LockTimer.markStop({ id: s.id, outcome }));
          if (!r) {
            waiting++;
            continue;
          }
          if (r.changed && step.do === 'complete') finishLockStop(now.uid, s);
          stop = r.changed ? { ...s, synced: true, outcome } : { ...s, ...r };
        }
        if (!stop.synced) {
          waiting++;
          continue;
        }
        if (ownTimer()?.startedAt === stop.startedAt) forgetOwnTimer();
        const owed = lockFollowUp(stop);
        if (owed === 'held') {
          // Removed once answered, so a closed app asks again next time.
          if (!followedUp.current.has(stop.id)) {
            followedUp.current.add(stop.id);
            setHeldStops((q) => [...q, stop]);
          }
          continue;
        }
        if (owed === 'logged' && !followedUp.current.has(stop.id)) {
          followedUp.current.add(stop.id);
          now.announce(stop.id, stop.metricId, stop.startedAt, stop.seconds, ' from the lock screen');
        }
        void quietly(LockTimer.removeStop({ id: stop.id }));
      }
      if (waiting === 0) void quietly(LockTimer.dismissNotice());
    } finally {
      processing.current = false;
      if (again.current) {
        again.current = false;
        void run();
      }
    }
  }, []);
  useEffect(() => {
    if (isNative && timerKnown) void processStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKnown, timer?.startedAt, timerFromServer, entries.length, wake, processStops]);
  const held = heldStops[0];
  const settleHeld = (stop: LockStop) => {
    setHeldStops((q) => q.filter((x) => x.id !== stop.id));
    void quietly(LockTimer.removeStop({ id: stop.id }));
  };

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
              start {metricName(switchTo.metricId)}?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (doStop()) startTimer(uid, switchTo.metricId, switchTo.startedAt);
                  setSwitchTo(null);
                }}
              >
                Stop {metricName(timer.metricId)} and start {metricName(switchTo.metricId)}
              </Button>
              <Button onClick={() => setSwitchTo(null)}>Keep {metricName(timer.metricId)} running</Button>
            </div>
          </>
        )}
      </Sheet>

      {held && (
        <AbandonedTimerSheet
          key={held.id}
          metricName={metricName(held.metricId)}
          startedAt={held.startedAt}
          stoppedAfter={held.seconds}
          tz={tz}
          onDiscard={() => {
            settleHeld(held);
            toast('Timer discarded');
          }}
          onSave={(seconds) => {
            const id = addEntry(uid, {
              metricId: held.metricId,
              value: seconds,
              source: 'manual',
              localDate: held.localDate,
              occurredAt: held.startedAt,
            });
            settleHeld(held);
            toast(`Logged ${formatDuration(seconds)} to ${metricName(held.metricId)}`, {
              label: 'Undo',
              run: () => softDeleteEntry(uid, id),
            });
          }}
        />
      )}

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
              localDate: dayOf(timer.startedAt),
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
  stoppedAfter,
  tz,
  onDiscard,
  onSave,
}: {
  metricName: string;
  startedAt: string;
  /** Stopped from the Android lock screen after this many seconds. */
  stoppedAfter?: number;
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
        {stoppedAfter === undefined
          ? <>It started {started} and has run for over 12 hours.</>
          : <>It started {started} and ran {formatDuration(stoppedAfter)} before you stopped it from the lock screen.</>}{' '}
        Enter how long you actually spent, or discard it.
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

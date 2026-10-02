import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDocFromServer, onSnapshot, query, where, type SnapshotMetadata } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { deviceId } from '../lib/device';
import { deviceTimezone, todayIn } from '../lib/dates';
import { forgetOwnTimer, ownTimer, paths, reassertOwnTimer, timerClosedRef } from '../lib/repo';
import { seedAccount } from '../lib/seed';
import type { ActiveTimer, CalendarItem, DayStats, Entry, Metric, Settings } from '../lib/types';

export type SyncState = 'synced' | 'pending' | 'offline';

interface Data {
  uid: string;
  user: User;
  /** All metrics including archived, in display order. */
  metrics: Metric[];
  metricById: Map<string, Metric>;
  /** Non-deleted entries. */
  entries: Entry[];
  /** Non-deleted events and reminders. */
  items: CalendarItem[];
  /** localDate → that day's items, sorted (all-day first, then by time). */
  itemsByDate: Map<string, CalendarItem[]>;
  /** metricId → localDate → aggregate. */
  dayStats: Map<string, DayStats>;
  settings: Settings | null;
  timer: ActiveTimer | null;
  tz: string;
  today: string;
  sync: SyncState;
  /** Metrics and settings have been read at least once (from cache or server). */
  ready: boolean;
}

const Ctx = createContext<Data | null>(null);

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

const EMPTY_STATS: DayStats = new Map();
export function statsFor(data: Data, metricId: string): DayStats {
  return data.dayStats.get(metricId) ?? EMPTY_STATS;
}

type Meta = { pending: boolean; cache: boolean };
const metaOf = (m: SnapshotMetadata): Meta => ({ pending: m.hasPendingWrites, cache: m.fromCache });

export function DataProvider({ user, children }: { user: User; children: ReactNode }) {
  const uid = user.uid;
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [entriesFromServer, setEntriesFromServer] = useState(false);
  const seeded = useRef(false);
  const serverEmpty = useRef({ metrics: false, settings: false });
  const entriesSeen = useRef(false);
  const serverTimer = useRef<{ value: ActiveTimer | null; seq: number }>({ value: null, seq: 0 });
  const [serverTimerSeq, setServerTimerSeq] = useState(0);

  // Five listeners for the whole app: entries is a single query over all
  // non-deleted entries; everything else is derived in memory.
  useEffect(() => {
    const track = (key: string) => (m: SnapshotMetadata) =>
      setMeta((prev) => {
        const next = metaOf(m);
        const cur = prev[key];
        return cur && cur.pending === next.pending && cur.cache === next.cache ? prev : { ...prev, [key]: next };
      });

    const maybeSeed = () => {
      // Seed only when the *server* confirms the account is empty; an empty
      // cache on a new device must never produce a second set of metrics.
      if (!seeded.current && serverEmpty.current.metrics && serverEmpty.current.settings) {
        seeded.current = true;
        seedAccount(uid);
      }
    };

    const opts = { includeMetadataChanges: true } as const;
    const unsubs = [
      onSnapshot(paths.metrics(uid), opts, (snap) => {
        track('metrics')(snap.metadata);
        setMetrics(snap.docs.map((d) => d.data() as Metric).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)));
        if (!snap.metadata.fromCache && snap.empty) {
          serverEmpty.current.metrics = true;
          maybeSeed();
        }
      }, (err) => console.error('[metrics]', err)),
      onSnapshot(query(paths.entries(uid), where('deletedAt', '==', null)), opts, (snap) => {
        track('entries')(snap.metadata);
        if (!snap.metadata.fromCache) setEntriesFromServer(true);
        // Metadata-only snapshots carry no document changes; skip the recompute.
        if (entriesSeen.current && snap.docChanges().length === 0) return;
        entriesSeen.current = true;
        setEntries(snap.docs.map((d) => d.data() as Entry));
      }, (err) => console.error('[entries]', err)),
      onSnapshot(query(paths.items(uid), where('deletedAt', '==', null)), opts, (snap) => {
        track('items')(snap.metadata);
        setItems(snap.docs.map((d) => d.data() as CalendarItem));
      }, (err) => console.error('[items]', err)),
      onSnapshot(paths.timer(uid), opts, (snap) => {
        track('timer')(snap.metadata);
        setTimer(snap.exists() ? (snap.data() as ActiveTimer) : null);
        if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
          serverTimer.current = { value: snap.exists() ? (snap.data() as ActiveTimer) : null, seq: serverTimer.current.seq + 1 };
          setServerTimerSeq(serverTimer.current.seq);
        }
      }, (err) => console.error('[timer]', err)),
      onSnapshot(paths.settings(uid), opts, (snap) => {
        track('settings')(snap.metadata);
        setSettings(snap.exists() ? (snap.data() as Settings) : null);
        if (!snap.metadata.fromCache && !snap.exists()) {
          serverEmpty.current.settings = true;
          maybeSeed();
        }
      }, (err) => console.error('[settings]', err)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  // §8.7: if two devices raced, the earlier startedAt wins.
  useEffect(() => {
    if (serverTimerSeq === 0 || !entriesFromServer) return;
    const own = ownTimer();
    if (!own) return;
    const server = serverTimer.current.value;
    if (server && server.startedAt === own.startedAt) return; // in sync
    if (server && server.startedAt < own.startedAt) {
      forgetOwnTimer(); // theirs is earlier; it stands
      return;
    }
    const alreadyStopped = entries.some((e) => e.source === 'timer' && e.occurredAt === own.startedAt);
    if (alreadyStopped || !server) {
      forgetOwnTimer();
      return;
    }
    // Server holds a later timer from another device. Re-assert ours unless it
    // was closed while this device wasn't looking.
    if (server.deviceId === deviceId()) return;
    let cancelled = false;
    getDocFromServer(timerClosedRef(uid))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists() && snap.data().startedAt === own.startedAt) forgetOwnTimer();
        else reassertOwnTimer(uid, own);
      })
      .catch(() => { /* offline; try again on the next server snapshot */ });
    return () => { cancelled = true; };
  }, [serverTimerSeq, entriesFromServer, entries, uid]);

  const tz = settings?.timezone ?? deviceTimezone();
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    const update = () => setToday(todayIn(tz));
    update();
    const id = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, [tz]);

  const dayStats = useMemo(() => {
    const out = new Map<string, DayStats>();
    for (const e of entries) {
      let m = out.get(e.metricId);
      if (!m) out.set(e.metricId, (m = new Map()));
      const s = m.get(e.localDate);
      if (s) {
        s.total += e.value;
        s.count += 1;
      } else m.set(e.localDate, { total: e.value, count: 1 });
    }
    return out;
  }, [entries]);

  const metricById = useMemo(() => new Map((metrics ?? []).map((m) => [m.id, m])), [metrics]);

  const itemsByDate = useMemo(() => {
    const out = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const list = out.get(it.localDate);
      if (list) list.push(it);
      else out.set(it.localDate, [it]);
    }
    for (const list of out.values()) list.sort(compareItems);
    return out;
  }, [items]);

  const sync: SyncState = useMemo(() => {
    const vals = Object.values(meta);
    if (vals.length === 0 || vals.some((v) => v.cache)) return 'offline';
    if (vals.some((v) => v.pending)) return 'pending';
    return 'synced';
  }, [meta]);

  const value = useMemo<Data>(
    () => ({
      uid,
      user,
      metrics: metrics ?? [],
      metricById,
      entries,
      items,
      itemsByDate,
      dayStats,
      settings: settings ?? null,
      timer,
      tz,
      today,
      sync,
      ready: metrics !== null && settings !== undefined,
    }),
    [uid, user, metrics, metricById, entries, items, itemsByDate, dayStats, settings, timer, tz, today, sync],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** All-day items first, then by time, then by when they were added. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.time !== b.time) {
    if (a.time === null) return -1;
    if (b.time === null) return 1;
    return a.time.localeCompare(b.time);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

const NO_ITEMS: CalendarItem[] = [];
export function itemsOn(data: { itemsByDate: Map<string, CalendarItem[]> }, date: string): CalendarItem[] {
  return data.itemsByDate.get(date) ?? NO_ITEMS;
}

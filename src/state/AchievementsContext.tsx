import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDocFromCache, onSnapshot, setDoc } from 'firebase/firestore';
import { useData } from './DataContext';
import { usePlans } from './PlansContext';
import { useCompete } from './CompeteContext';
import { collectAchievements, paths } from '../lib/repo';
import { competePaths, publishProfile, unpublishProfile } from '../lib/competeRepo';
import { evaluate, type CompeteWin, type Evaluation, type Unlock } from '../lib/achievements';
import { SECRETS, achievementById } from '../lib/achievementCatalog';
import { computeGoal } from '../lib/goals';
import { challengeResult, challengeSpan, challengeWindow, nameFromEmail, race, sideAt, sideForChallenge } from '../lib/compete';
import { formatValue } from '../lib/format';
import { local } from '../lib/device';
import { nowIso } from '../lib/dates';
import { sameProfile, sharedProfile, summarize, type ProfileSummary, type SharedProfile } from '../lib/profile';
import type { CollectedAchievement } from '../lib/types';

interface Achievements {
  /** Data and collected cards have been read at least once. */
  ready: boolean;
  evaluation: Evaluation;
  collected: Map<string, CollectedAchievement>;
  /** Unlocked and not collected yet: rarest first, then newest. */
  waiting: Unlock[];
  /** Cards that apply to this account, collected or not. */
  total: number;
  summary: ProfileSummary;
  /** The name on the profile. */
  name: string;
  collect: (ids: string[]) => void;
  /** Just unlocked (or, the first time on a device, everything waiting), for the banner. */
  announcement: { ids: string[]; backlog: boolean } | null;
  dismissAnnouncement: () => void;
  /** The Compete partner's profile, if they share it. */
  partnerProfile: SharedProfile | null;
  /** Mine is up on the pair right now. */
  sharing: boolean;
}

const Ctx = createContext<Achievements | null>(null);

export function useAchievements(): Achievements {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAchievements outside AchievementsProvider');
  return v;
}

const EMPTY = new Map<string, CollectedAchievement>();
const PUBLISH_DELAY_MS = 2000;

/** Browser tests opt in to the banner, like tours, so it never covers what other suites tap. */
function announceEnabled(): boolean {
  if (import.meta.env.VITE_USE_EMULATORS !== '1') return true;
  try {
    return localStorage.getItem('logbook:e2e-ach') === '1';
  } catch {
    return false;
  }
}

/**
 * Achievements for the whole signed-in app: unlocks derived from live data,
 * the collected cards (one listener), the "just unlocked" banner, and the
 * profile summary published to the Compete pair while sharing is on.
 */
export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { uid, user, metrics, entries, dayStats, today, tz, dayOf, weekStartsOn, goals, settings, metricById, ready: dataReady, entriesReady } = useData();
  const plans = usePlans();
  const { pair, links, challenges, sides, theirScore, now, partnerName, partnerUid } = useCompete();
  const [collected, setCollected] = useState<Map<string, CollectedAchievement> | null>(null);

  useEffect(() => onSnapshot(paths.achievements(uid), (snap) => {
    setCollected(new Map(snap.docs.map((d) => [d.id, d.data() as CollectedAchievement])));
  }, (err) => {
    console.error('[achievements]', err);
    setCollected(new Map());
  }), [uid]);

  // Weeks and challenges won, the same way the Compete tab works them out.
  // Keyed as text so the 30-second clock there doesn't re-run everything here.
  const winsKey = useMemo(() => {
    const out: CompeteWin[] = [];
    if (pair) {
      for (const l of links) {
        if (!l.acceptedAt || !l.startDate) continue;
        const s = sides(l);
        const r = race(s.mine, s.theirs, l.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn);
        for (const w of r.past) {
          if (w.outcome !== 'me') continue;
          const m = sideAt(s.mine, w.end) ?? metricById.get(l.metrics[uid]);
          const fmt = (v: number) => (m ? formatValue(m, v) : String(v));
          out.push({
            kind: 'week',
            on: w.end,
            label: `Beat ${partnerName} ${fmt(w.me.total)} to ${fmt(w.them.total)}`,
            margin: w.me.total > 0 ? (w.me.total - w.them.total) / w.me.total : 0,
          });
        }
      }
      for (const c of challenges) {
        const link = links.find((l) => l.id === c.linkId);
        if (!link) continue;
        const s = sides(link);
        const r = challengeResult(c, s.mine, s.theirs, today, theirScore?.asOf ?? null, now, theirScore?.updatedAt ?? null);
        if (r.status !== 'finished' || r.winner !== 'me') continue;
        const first = c.kind === 'first_to' ? [r.reached.me, r.reached.them].filter((d): d is string => !!d).sort()[0] : undefined;
        const decided = first ? (challengeWindow(c) ? dayOf(first) : first) : challengeSpan(c, dayOf).end;
        const m = sideForChallenge(s.mine, c);
        const what = c.kind === 'first_to'
          ? `First to ${m && c.amount ? formatValue(m, c.amount) : 'the target'}${m ? ` of ${m.name}` : ''}`
          : c.kind === 'most_total' ? `Most ${m?.name ?? 'logged'}` : `Most ${m ? `${m.name} ` : ''}target days`;
        out.push({ kind: 'challenge', on: decided, label: `${what}, against ${partnerName}`, stake: c.stake ?? null });
      }
    }
    return JSON.stringify(out);
  }, [pair, links, challenges, sides, theirScore, now, partnerName, uid, today, dayOf, metricById]);
  const wins = useMemo(() => JSON.parse(winsKey) as CompeteWin[], [winsKey]);

  const goalsDone = useMemo(
    () => goals.map((g) => ({ name: g.name, deadline: g.deadline, on: computeGoal(g, entries, today).achievedDate })),
    [goals, entries, today],
  );
  const plansDone = useMemo(
    () => plans.plans.map((p) => ({ name: p.name, deadline: p.deadline, on: plans.resultOf(p.id).achievedDate })),
    [plans],
  );

  const evaluation = useMemo(
    () => evaluate({ metrics, entries, dayStats, today, tz, dayOf, weekStartsOn, goals: goalsDone, plans: plansDone, tasks: plans.tasks, wins }),
    [metrics, entries, dayStats, today, tz, dayOf, weekStartsOn, goalsDone, plansDone, plans.tasks, wins],
  );

  const col = collected ?? EMPTY;
  const waiting = useMemo(
    () => [...evaluation.unlocked.values()]
      .filter((u) => !col.has(u.id))
      .sort((a, b) => achievementById.get(b.id)!.tier - achievementById.get(a.id)!.tier || b.on.localeCompare(a.on)),
    [evaluation, col],
  );
  const total = useMemo(() => {
    const ids = new Set<string>();
    for (const l of evaluation.ladders) l.steps.forEach((_, i) => ids.add(`${l.id}.${i + 1}`));
    for (const s of SECRETS) ids.add(s.id);
    for (const id of col.keys()) if (achievementById.has(id)) ids.add(id);
    for (const id of evaluation.unlocked.keys()) ids.add(id);
    return ids.size;
  }, [evaluation, col]);
  const summary = useMemo(() => summarize(col, settings?.title, settings?.pinned), [col, settings?.title, settings?.pinned]);
  const name = settings?.displayName?.trim() || (pair && pair.names[uid]) || nameFromEmail(user.email);

  const collect = useCallback((ids: string[]) => {
    const cards = ids.map((id) => evaluation.unlocked.get(id)).filter((u): u is Unlock => !!u && !col.has(u.id));
    if (cards.length) collectAchievements(uid, cards);
  }, [evaluation, col, uid]);

  // ── The banner: anything unlocked since this device last looked ──
  const loaded = dataReady && entriesReady && collected !== null;
  const [announcement, setAnnouncement] = useState<{ ids: string[]; backlog: boolean } | null>(null);
  useEffect(() => {
    if (!loaded || !announceEnabled()) return;
    const key = `pt.ach.seen.${uid}`;
    let seen: string[] | null = null;
    try {
      const raw = local.get(key);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }
    if (!seen) {
      // First look on this device: whatever is already waiting is a backlog, announced once.
      local.set(key, JSON.stringify([...evaluation.unlocked.keys()]));
      if (waiting.length) setAnnouncement({ ids: waiting.map((u) => u.id), backlog: true });
      return;
    }
    const known = new Set(seen);
    const fresh = waiting.filter((u) => !known.has(u.id)).map((u) => u.id);
    if (!fresh.length) return;
    local.set(key, JSON.stringify([...seen, ...fresh].slice(-3000)));
    // Late arrivals (plans or Compete results load after entries) join whatever is showing.
    setAnnouncement((prev) => ({ ids: [...new Set([...(prev?.ids ?? []), ...fresh])], backlog: prev?.backlog ?? false }));
  }, [loaded, evaluation, waiting, uid]);
  const dismissAnnouncement = useCallback(() => setAnnouncement(null), []);

  // ── Sharing with the Compete partner ──
  const pairId = pair?.id ?? null;
  const [profiles, setProfiles] = useState<Map<string, SharedProfile>>(new Map());
  useEffect(() => {
    setProfiles(new Map());
    if (!pairId) return;
    return onSnapshot(competePaths.profiles(pairId), (snap) => {
      setProfiles(new Map(snap.docs.map((d) => [d.id, d.data() as SharedProfile])));
    }, (err) => console.error('[profiles]', err));
  }, [pairId]);
  const share = settings?.shareProfile === true;
  const mineUp = profiles.get(uid);
  const shared = useMemo(
    () => (pairId && share && collected ? sharedProfile(uid, name, col, summary, total, '') : null),
    [pairId, share, collected, uid, name, col, summary, total],
  );
  useEffect(() => {
    if (!pairId || !loaded) return;
    if (!share) {
      if (mineUp) unpublishProfile(pairId, uid);
      return;
    }
    if (!shared || sameProfile(mineUp, shared)) return;
    const t = window.setTimeout(() => publishProfile(pairId, { ...shared, updatedAt: nowIso() }), PUBLISH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [pairId, loaded, share, shared, mineUp, uid]);

  useE2eHooks(uid, pairId);

  const value: Achievements = {
    ready: loaded,
    evaluation,
    collected: col,
    waiting,
    total,
    summary,
    name,
    collect,
    announcement,
    dismissAnnouncement,
    partnerProfile: partnerUid ? profiles.get(partnerUid) ?? null : null,
    sharing: !!mineUp,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Emulator builds only: the partner's side of profile sharing, written into this device's cache. */
function useE2eHooks(uid: string, pairId: string | null) {
  useEffect(() => {
    if (import.meta.env.VITE_USE_EMULATORS !== '1') return;
    (window as unknown as { __e2eAch?: object }).__e2eAch = {
      myShared: async () => {
        if (!pairId) return null;
        try {
          return (await getDocFromCache(competePaths.profile(pairId, uid))).data() ?? null;
        } catch {
          return null;
        }
      },
      partnerProfile: (p: SharedProfile) => {
        if (pairId) void setDoc(competePaths.profile(pairId, p.uid), p);
      },
    };
  }, [uid, pairId]);
}

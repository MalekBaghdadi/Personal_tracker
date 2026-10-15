import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDocFromCache, getDocsFromCache, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useData } from './DataContext';
import { nowIso } from '../lib/dates';
import { competePaths, publishScore } from '../lib/competeRepo';
import { challengeDays, isTimed, sharesLogs, shareLogs, shareMetric, type Challenge, type Invite, type Link, type Pair, type Score, type SharedMetric } from '../lib/compete';

interface Compete {
  /** All listeners have answered at least once (from cache or server). */
  ready: boolean;
  /** This account's open invite, if it made one and nobody has used it yet. */
  invite: Invite | null;
  /** The active pair, if any. */
  pair: Pair | null;
  partnerUid: string | null;
  partnerName: string;
  myName: string;
  /** Links that haven't ended: proposals and accepted ones. */
  links: Link[];
  challenges: Challenge[];
  /** The partner's published summary. */
  theirScore: Score | null;
  /** My linked metrics as they'd be published, from live data (fresher than my own score doc). */
  mine: Record<string, SharedMetric>;
  /** The current instant, updated every 30 seconds: timed challenges start and end by it. */
  now: string;
  /** The partner's name if a log on this metric and day is shared with them (a challenge day), else null. */
  sharedWith: (metricId: string, localDate: string) => string | null;
}

const Ctx = createContext<Compete | null>(null);

export function useCompete(): Compete {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCompete outside CompeteProvider');
  return v;
}

const PUBLISH_DELAY_MS = 2000;

/**
 * Pairing, links, challenges and both members' summaries. Mounted for the
 * whole signed-in app, not just the Compete tab, so logging anywhere keeps
 * this account's published summary current.
 */
export function CompeteProvider({ children }: { children: ReactNode }) {
  const { uid, metricById, dayStats, entries, today, weekStartsOn, dayOf } = useData();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [scores, setScores] = useState<Map<string, Score>>(new Map());

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(competePaths.invites(), where('fromUid', '==', uid)), (snap) => {
        setInvites(snap.docs.map((d) => d.data() as Invite));
      }, (err) => {
        console.error('[invites]', err);
        setInvites([]);
      }),
      onSnapshot(query(competePaths.pairs(), where('members', 'array-contains', uid)), (snap) => {
        setPairs(snap.docs.map((d) => d.data() as Pair));
      }, (err) => {
        console.error('[pairs]', err);
        setPairs([]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  // The newest pair that hasn't been unlinked.
  const pair = useMemo(
    () => (pairs ?? []).filter((p) => p.endedAt === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [pairs],
  );
  const pairId = pair?.id ?? null;

  useEffect(() => {
    setLinks([]);
    setChallenges([]);
    setScores(new Map());
    if (!pairId) return;
    const unsubs = [
      onSnapshot(competePaths.links(pairId), (snap) => {
        setLinks(snap.docs.map((d) => d.data() as Link).filter((l) => !l.endedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      }, (err) => console.error('[links]', err)),
      onSnapshot(competePaths.challenges(pairId), (snap) => {
        setChallenges(snap.docs.map((d) => d.data() as Challenge).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      }, (err) => console.error('[challenges]', err)),
      onSnapshot(competePaths.scores(pairId), (snap) => {
        setScores(new Map(snap.docs.map((d) => [d.id, d.data() as Score])));
      }, (err) => console.error('[scores]', err)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [pairId]);

  // Days whose individual logs are shared, per metric of mine: its link's challenge days.
  const logDays = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const l of links) {
      const metricId = l.metrics[uid];
      if (!l.acceptedAt || !metricId) continue;
      const days = challengeDays(challenges, l.id, today, dayOf);
      if (days.size) out.set(metricId, days);
    }
    return out;
  }, [links, challenges, uid, today, dayOf]);

  // What this account publishes: each accepted link's metric, from the week it
  // started, plus its logs on challenge days.
  const mine = useMemo(() => {
    const out: Record<string, SharedMetric> = {};
    for (const l of links) {
      const metricId = l.metrics[uid];
      const metric = metricId ? metricById.get(metricId) : undefined;
      if (!l.acceptedAt || !l.startDate || !metric) continue;
      const stats = dayStats.get(metric.id) ?? new Map();
      // Like Stats: a metric counts from its creation, or its first entry if backfilled.
      let since = dayOf(metric.createdAt);
      for (const d of stats.keys()) if (d < since) since = d;
      out[metric.id] = shareMetric(metric, stats, l.startDate, today, weekStartsOn, since);
      const days = logDays.get(metric.id);
      if (days) out[metric.id].logs = shareLogs(entries.filter((e) => e.metricId === metric.id), days);
    }
    return out;
  }, [links, uid, metricById, dayStats, entries, logDays, today, weekStartsOn, dayOf]);

  // Timed challenges start and end mid-day, so the screen needs a clock finer than `today`.
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowIso()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Publish when it differs from what's on record, a moment after the last
  // change so a burst of quick adds is one write. Never awaited. Also once a
  // timed challenge has ended since the last publish: the partner's app
  // settles it when my updatedAt is past its end.
  const myScore = scores.get(uid);
  const endedSincePublish = !!myScore && challenges.some(
    (c) => isTimed(c) && sharesLogs(c) && myScore.updatedAt < c.endAt && c.endAt <= now,
  );
  useEffect(() => {
    if (!pairId || Object.keys(mine).length === 0) return;
    if (myScore && myScore.asOf === today && !endedSincePublish && JSON.stringify(myScore.metrics) === JSON.stringify(mine)) return;
    const id = window.setTimeout(() => publishScore(pairId, { uid, asOf: today, updatedAt: nowIso(), metrics: mine }), PUBLISH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [pairId, mine, myScore, uid, today, endedSincePublish]);

  const partnerUid = pair?.members.find((m) => m !== uid) ?? null;
  const invite = (invites ?? []).filter((i) => i.expiresAt > now).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  const value: Compete = {
    ready: invites !== null && pairs !== null,
    invite,
    pair,
    partnerUid,
    partnerName: (partnerUid && pair?.names[partnerUid]) || 'Them',
    myName: pair?.names[uid] || 'You',
    links,
    challenges,
    theirScore: partnerUid ? scores.get(partnerUid) ?? null : null,
    mine,
    now,
    sharedWith: (metricId, localDate) =>
      logDays.get(metricId)?.has(localDate) ? (partnerUid && pair?.names[partnerUid]) || 'Them' : null,
  };

  useE2eHooks(uid, pairId);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Emulator builds only. Firestore is unreachable in the browser tests, so
 * there's no second account to pair with; these play the partner by writing
 * straight into this device's cache.
 */
function useE2eHooks(uid: string, pairId: string | null) {
  useEffect(() => {
    if (import.meta.env.VITE_USE_EMULATORS !== '1') return;
    const w = window as unknown as { __e2eCompete?: object };
    const PARTNER = 'e2e-partner';
    w.__e2eCompete = {
      pair: (name: string, weekStartsOn: 0 | 1 = 1) => {
        const p: Pair = { id: 'E2EPAR', members: [PARTNER, uid], names: { [PARTNER]: name, [uid]: 'Me' }, weekStartsOn, createdAt: nowIso(), endedAt: null };
        void setDoc(competePaths.pair(p.id), p);
      },
      proposeLink: (id: string, metricId: string, type: 'duration' | 'count') => {
        if (!pairId) return;
        const l: Link = { id, metrics: { [PARTNER]: metricId }, type, proposedBy: PARTNER, createdAt: nowIso(), acceptedAt: null, startDate: null, endedAt: null };
        void setDoc(competePaths.link(pairId, id), l);
      },
      /** Accept every link this account proposed, racing it against `metricId`. */
      acceptMine: async (metricId: string, startDate: string) => {
        if (!pairId) return;
        const snap = await getDocsFromCache(competePaths.links(pairId));
        for (const d of snap.docs) {
          const l = d.data() as Link;
          if (l.proposedBy === uid && !l.acceptedAt) void updateDoc(d.ref, { [`metrics.${PARTNER}`]: metricId, acceptedAt: nowIso(), startDate });
        }
      },
      acceptMyChallenges: async () => {
        if (!pairId) return;
        const snap = await getDocsFromCache(competePaths.challenges(pairId));
        for (const d of snap.docs) {
          const c = d.data() as Challenge;
          if (c.createdBy === uid && !c.acceptedAt) void updateDoc(d.ref, { acceptedAt: nowIso() });
        }
      },
      /** Id of the first accepted link, for challenges the partner starts. */
      raceLinkId: async () => {
        if (!pairId) return null;
        const snap = await getDocsFromCache(competePaths.links(pairId));
        return snap.docs.find((d) => (d.data() as Link).acceptedAt)?.id ?? null;
      },
      myScore: async () => {
        if (!pairId) return null;
        try {
          return (await getDocFromCache(competePaths.score(pairId, uid))).data() ?? null;
        } catch {
          return null;
        }
      },
      score: (asOf: string, metrics: Record<string, SharedMetric>) => {
        if (pairId) void setDoc(competePaths.score(pairId, PARTNER), { uid: PARTNER, asOf, updatedAt: nowIso(), metrics });
      },
      proposeChallenge: (c: Challenge) => {
        if (pairId) void setDoc(competePaths.challenge(pairId, c.id), { ...c, createdBy: PARTNER });
      },
      answerChallenge: (id: string, accept: boolean) => {
        if (pairId) void updateDoc(competePaths.challenge(pairId, id), accept ? { acceptedAt: nowIso() } : { declinedAt: nowIso() });
      },
      partnerUid: PARTNER,
    };
  }, [uid, pairId]);
}

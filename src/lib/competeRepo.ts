import { collection, deleteDoc, doc, getDocFromServer, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { uuid } from './device';
import { nowIso } from './dates';
import { laterRounds, newInviteCode, type Challenge, type ChallengeKind, type Invite, type Link, type LinkMember, type Pair, type Score } from './compete';
import type { SharedProfile } from './profile';
import type { MetricType } from './types';

/*
 * Compete writes. Like repo.ts, none are awaited, except joining with a code,
 * which has to read the invite from the server first.
 */
function fire(p: Promise<unknown>): void {
  p.catch((err) => console.error('[compete] write failed', err));
}

const INVITE_DAYS = 7;

export const competePaths = {
  invites: () => collection(db, 'invites'),
  invite: (code: string) => doc(db, 'invites', code),
  pairs: () => collection(db, 'pairs'),
  pair: (id: string) => doc(db, 'pairs', id),
  links: (pairId: string) => collection(db, 'pairs', pairId, 'links'),
  link: (pairId: string, id: string) => doc(db, 'pairs', pairId, 'links', id),
  challenges: (pairId: string) => collection(db, 'pairs', pairId, 'challenges'),
  challenge: (pairId: string, id: string) => doc(db, 'pairs', pairId, 'challenges', id),
  scores: (pairId: string) => collection(db, 'pairs', pairId, 'scores'),
  score: (pairId: string, uid: string) => doc(db, 'pairs', pairId, 'scores', uid),
  profiles: (pairId: string) => collection(db, 'pairs', pairId, 'profiles'),
  profile: (pairId: string, uid: string) => doc(db, 'pairs', pairId, 'profiles', uid),
};

// ── Pairing ────────────────────────────────────────────────────────────────

export function createInvite(uid: string, name: string, weekStartsOn: 0 | 1): Invite {
  const now = new Date();
  const invite: Invite = {
    code: newInviteCode(),
    fromUid: uid,
    fromName: name.trim(),
    weekStartsOn,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  fire(setDoc(competePaths.invite(invite.code), invite));
  return invite;
}

export function cancelInvite(code: string): void {
  fire(deleteDoc(competePaths.invite(code)));
}

export type JoinError = 'offline' | 'not_found' | 'expired' | 'own';

/**
 * Join the inviter: creates the pair (its id is the code) and removes the
 * invite in one batch. Needs a connection, since the invite has to come from
 * the server; it resolves once the write is queued, not acknowledged.
 */
export async function joinWithCode(uid: string, name: string, code: string): Promise<{ ok: true; pairId: string } | { ok: false; error: JoinError }> {
  let invite: Invite;
  try {
    const snap = await Promise.race([
      getDocFromServer(competePaths.invite(code)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
    ]);
    if (!snap.exists()) return { ok: false, error: 'not_found' };
    invite = snap.data() as Invite;
  } catch (err) {
    // Reading a missing code is allowed (it just doesn't exist), so a failure here is the network.
    console.warn('[compete] invite read failed', err);
    return { ok: false, error: 'offline' };
  }
  if (invite.fromUid === uid) return { ok: false, error: 'own' };
  if (invite.expiresAt < nowIso()) return { ok: false, error: 'expired' };

  const pair: Pair = {
    id: code,
    members: [invite.fromUid, uid],
    names: { [invite.fromUid]: invite.fromName, [uid]: name.trim() },
    weekStartsOn: invite.weekStartsOn,
    createdAt: nowIso(),
    endedAt: null,
  };
  const batch = writeBatch(db);
  batch.set(competePaths.pair(code), pair);
  batch.delete(competePaths.invite(code));
  fire(batch.commit());
  return { ok: true, pairId: code };
}

/** The name the other member sees. Each member changes only their own. */
export function renameInPair(pairId: string, uid: string, name: string): void {
  fire(updateDoc(competePaths.pair(pairId), { [`names.${uid}`]: name.trim() }));
}

/** Unlink: the pair stays (for its history) but nothing more is shared. */
export function endPair(pairId: string): void {
  fire(updateDoc(competePaths.pair(pairId), { endedAt: nowIso() }));
}

// ── Links ──────────────────────────────────────────────────────────────────

export function proposeLink(pairId: string, uid: string, metricId: string, type: MetricType): void {
  const link: Link = {
    id: uuid(),
    metrics: { [uid]: metricId },
    type,
    proposedBy: uid,
    createdAt: nowIso(),
    acceptedAt: null,
    startDate: null,
    endedAt: null,
  };
  fire(setDoc(competePaths.link(pairId, link.id), link));
}

/** `startDate` is the first day of this week, so this week's race already counts. */
export function acceptLink(pairId: string, linkId: string, uid: string, metricId: string, startDate: string): void {
  fire(updateDoc(competePaths.link(pairId, linkId), { [`metrics.${uid}`]: metricId, acceptedAt: nowIso(), startDate }));
}

/**
 * Add one of my metrics to my side of a link. Re-adding a removed one starts a new entry. A check-off
 * comes with `worth`: what each checked day counts as, in the race's base unit.
 */
export function addToSide(pairId: string, link: Link, uid: string, metricId: string, today: string, worth?: number): void {
  const member: LinkMember = { metricId, addedOn: today, addedAt: nowIso(), removedOn: null, removedAt: null };
  if (worth != null) member.worth = worth;
  fire(updateDoc(competePaths.link(pairId, link.id), { [`extra.${uid}`]: [...(link.extra?.[uid] ?? []), member] }));
}

/**
 * A new value for a check-off on my side, from today on (`worthOn`): its entry ends today and a new one
 * starts with the new value, so earlier days keep what they were worth.
 */
export function changeWorth(pairId: string, link: Link, uid: string, metricId: string, worth: number, today: string): void {
  const now = nowIso();
  const ended = (link.extra?.[uid] ?? []).map((x) => (x.metricId === metricId && !x.removedOn ? { ...x, removedOn: today, removedAt: now } : x));
  const next: LinkMember = { metricId, addedOn: today, addedAt: now, removedOn: null, removedAt: null, worth };
  fire(updateDoc(competePaths.link(pairId, link.id), { [`extra.${uid}`]: [...ended, next] }));
}

/** Put my side's added metrics back as they were (Undo). */
export function restoreSide(pairId: string, linkId: string, uid: string, members: LinkMember[]): void {
  fire(updateDoc(competePaths.link(pairId, linkId), { [`extra.${uid}`]: members }));
}

/** Take an added metric off my side. The entry stays, so finished weeks and challenges keep counting it. */
export function removeFromSide(pairId: string, link: Link, uid: string, metricId: string, today: string): void {
  const now = nowIso();
  const members = (link.extra?.[uid] ?? []).map((x) => (x.metricId === metricId && !x.removedOn ? { ...x, removedOn: today, removedAt: now } : x));
  fire(updateDoc(competePaths.link(pairId, link.id), { [`extra.${uid}`]: members }));
}

/** Decline a proposal, withdraw one, or stop racing on an accepted link. */
export function endLink(pairId: string, linkId: string): void {
  fire(updateDoc(competePaths.link(pairId, linkId), { endedAt: nowIso() }));
}

// ── Challenges ─────────────────────────────────────────────────────────────

export interface NewChallenge {
  linkId: string;
  kind: ChallengeKind;
  amount: number | null;
  startDate: string;
  endDate: string;
  startAt: string | null;
  endAt: string | null;
  stake: string | null;
  /** A best of this many weeks (3): the dates above are week 1 and the others follow right after. */
  bestOf?: number;
}

/** All of a best of 3's weeks are written in one batch, so they exist together or not at all. */
export function proposeChallenge(pairId: string, uid: string, input: NewChallenge, dayOf: (instant: string) => string): void {
  const { bestOf, ...rest } = input;
  const ch: Challenge = {
    id: uuid(),
    ...rest,
    amount: input.kind === 'first_to' ? input.amount : null,
    createdBy: uid,
    createdAt: nowIso(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
  };
  if (!bestOf) return fire(setDoc(competePaths.challenge(pairId, ch.id), ch));
  const first: Challenge = { ...ch, series: { id: uuid(), round: 1, of: bestOf } };
  const weeks = [first, ...laterRounds(first, Array.from({ length: bestOf - 1 }, uuid), uid, ch.createdAt, dayOf)];
  const batch = writeBatch(db);
  for (const w of weeks) batch.set(competePaths.challenge(pairId, w.id), w);
  fire(batch.commit());
}

/** Accept or decline a challenge; `ids` is every week of a best of 3. */
export function answerChallenge(pairId: string, ids: string[], accept: boolean): void {
  const batch = writeBatch(db);
  for (const id of ids) batch.update(competePaths.challenge(pairId, id), accept ? { acceptedAt: nowIso() } : { declinedAt: nowIso() });
  fire(batch.commit());
}

/** Withdraw or call off; `ids` is every week of a best of 3 not yet settled. */
export function cancelChallenge(pairId: string, ids: string[]): void {
  const batch = writeBatch(db);
  for (const id of ids) batch.update(competePaths.challenge(pairId, id), { cancelledAt: nowIso() });
  fire(batch.commit());
}

/**
 * Turn a running, accepted challenge into week 1 of a best of 3: it's tagged, and weeks 2 and 3 are made
 * right after it, already accepted (the exception to proposing a series up front).
 */
export function makeBestOfThree(pairId: string, uid: string, ch: Challenge, dayOf: (instant: string) => string): void {
  const series = { id: uuid(), round: 1, of: 3, madeBy: uid };
  const now = nowIso();
  const batch = writeBatch(db);
  batch.update(competePaths.challenge(pairId, ch.id), { series });
  for (const w of laterRounds({ ...ch, series }, [uuid(), uuid()], uid, now, dayOf)) batch.set(competePaths.challenge(pairId, w.id), w);
  fire(batch.commit());
}

/** "End it now": stop a running challenge at this moment; whoever's ahead then wins. `today` is my tracking day. */
export function endChallengeNow(pairId: string, id: string, uid: string, today: string): void {
  fire(updateDoc(competePaths.challenge(pairId, id), { endedEarlyAt: nowIso(), endedEarlyOn: today, endedEarlyBy: uid }));
}

/**
 * "Change end": move a challenge's end. `endAt` is null for whole-day challenges; `was` is the end it had.
 * `later` moves the weeks after it in a best of 3 (`shiftedRounds`), in the same batch.
 */
export function changeChallengeEnd(
  pairId: string, id: string, uid: string, end: { endAt: string | null; endDate: string }, was: string,
  later: { id: string; patch: object }[] = [],
): void {
  const batch = writeBatch(db);
  batch.update(competePaths.challenge(pairId, id), {
    endDate: end.endDate,
    ...(end.endAt ? { endAt: end.endAt } : {}),
    endChangedBy: uid,
    endChangedFrom: was,
  });
  for (const l of later) batch.update(competePaths.challenge(pairId, l.id), l.patch);
  fire(batch.commit());
}

// ── Publishing ─────────────────────────────────────────────────────────────

/** Replaces this member's summary; only linked metrics are in it. */
export function publishScore(pairId: string, score: Score): void {
  fire(setDoc(competePaths.score(pairId, score.uid), score));
}

/** The profile summary the partner sees, only while sharing is on. */
export function publishProfile(pairId: string, profile: SharedProfile): void {
  fire(setDoc(competePaths.profile(pairId, profile.uid), profile));
}

/** Sharing switched off: take it down. */
export function unpublishProfile(pairId: string, uid: string): void {
  fire(deleteDoc(competePaths.profile(pairId, uid)));
}

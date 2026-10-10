import { collection, deleteDoc, doc, getDocFromServer, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { uuid } from './device';
import { nowIso } from './dates';
import { newInviteCode, type Challenge, type ChallengeKind, type Invite, type Link, type Pair, type Score } from './compete';
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
}

export function proposeChallenge(pairId: string, uid: string, input: NewChallenge): void {
  const ch: Challenge = {
    id: uuid(),
    ...input,
    amount: input.kind === 'first_to' ? input.amount : null,
    createdBy: uid,
    createdAt: nowIso(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
  };
  fire(setDoc(competePaths.challenge(pairId, ch.id), ch));
}

export function answerChallenge(pairId: string, id: string, accept: boolean): void {
  fire(updateDoc(competePaths.challenge(pairId, id), accept ? { acceptedAt: nowIso() } : { declinedAt: nowIso() }));
}

export function cancelChallenge(pairId: string, id: string): void {
  fire(updateDoc(competePaths.challenge(pairId, id), { cancelledAt: nowIso() }));
}

// ── Publishing ─────────────────────────────────────────────────────────────

/** Replaces this member's summary; only linked metrics are in it. */
export function publishScore(pairId: string, score: Score): void {
  fire(setDoc(competePaths.score(pairId, score.uid), score));
}

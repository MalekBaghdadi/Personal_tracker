import { addDays } from './dates';
import { isHit, isScheduled, restDays, weekOf } from './streaks';
import type { DayStats, Metric, MetricType } from './types';

/*
 * Compete: two linked accounts race on linked metrics. Neither can read the
 * other's data, so each app publishes a small summary of its linked metrics
 * (per-day totals and whether the day's target was met) to the pair, and the
 * race and challenge results are derived from those summaries. Pure: no React,
 * no Firestore.
 *
 * Firestore (rules in firestore.rules):
 *   invites/{code}                      Invite
 *   pairs/{pairId}                      Pair (pairId = the invite code it came from)
 *   pairs/{pairId}/links/{linkId}       Link: one metric of each member, raced on
 *   pairs/{pairId}/challenges/{id}      Challenge
 *   pairs/{pairId}/scores/{uid}         Score: that member's published summary
 */

export interface Invite {
  code: string;
  fromUid: string;
  fromName: string;
  /** The pair's weeks follow the inviter's week start. */
  weekStartsOn: 0 | 1;
  createdAt: string;
  expiresAt: string;
}

export interface Pair {
  id: string;
  /** Always two uids. */
  members: string[];
  names: Record<string, string>;
  weekStartsOn: 0 | 1;
  createdAt: string;
  endedAt: string | null;
}

export interface Link {
  id: string;
  /** uid → that member's metric id. The proposer's is set at once, the other's on accepting. */
  metrics: Record<string, string>;
  type: MetricType;
  proposedBy: string;
  createdAt: string;
  acceptedAt: string | null;
  /** First day of the week it was accepted in: the race and publishing start here. */
  startDate: string | null;
  /** Declined, or removed later. */
  endedAt: string | null;
}

export type ChallengeKind = 'first_to' | 'most_total' | 'most_days';

export interface Challenge {
  id: string;
  linkId: string;
  kind: ChallengeKind;
  /** Base unit; first_to only. */
  amount: number | null;
  /** Both inclusive. */
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
}

/** h = target met, d = due and not met, r = rest day, o = not scheduled, n = metric has no target. */
export type DayStatus = 'h' | 'd' | 'r' | 'o' | 'n';

export interface SharedDay {
  t: number;
  s: DayStatus;
}

/** One linked metric as its owner publishes it. Days not listed: nothing logged, not due. */
export interface SharedMetric {
  name: string;
  type: MetricType;
  unit: string;
  target: number | null;
  color: string;
  icon: string;
  days: Record<string, SharedDay>;
}

export interface Score {
  uid: string;
  /** The owner's tracking day when published; days before it are complete. */
  asOf: string;
  updatedAt: string;
  metrics: Record<string, SharedMetric>;
}

/** A metric can be raced on when more is better; a ceiling (calories) has no sensible winner. */
export const canLink = (m: Metric): boolean => !m.archivedAt && m.targetDirection === 'at_least';

/**
 * What the owner publishes for one metric, from `from` through today. Rest
 * days follow the metric's weekly allowance and the owner's own week start,
 * exactly as their streaks do, so a rest day is never a missed target day.
 * Days before `since` (the metric's creation, or its first entry if
 * backfilled) aren't due, as in Stats: a metric made today hasn't missed
 * the rest of the week.
 */
export function shareMetric(metric: Metric, stats: DayStats, from: string, today: string, weekStartsOn: 0 | 1, since: string = from): SharedMetric {
  const rest = restDays(metric, stats, since > from ? since : from, today, today, weekStartsOn);
  const days: Record<string, SharedDay> = {};
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const s = stats.get(d);
    const t = s?.total ?? 0;
    let status: DayStatus;
    if (metric.target == null) status = 'n';
    else if (!isScheduled(metric.schedule, d) || d < since) status = 'o';
    else if (rest.has(d)) status = 'r';
    else status = isHit(metric, t, s?.count ?? 0) ? 'h' : 'd';
    if (t > 0 || status === 'h' || status === 'd' || status === 'r') days[d] = { t, s: status };
  }
  return { name: metric.name, type: metric.type, unit: metric.unit, target: metric.target, color: metric.color, icon: metric.icon, days };
}

export interface Side {
  total: number;
  /** Days the target was met. */
  hits: number;
  /** Due days so far: met, or missed. The owner's current day counts only once met. */
  due: number;
  hasTarget: boolean;
}

const EMPTY_SIDE: Side = { total: 0, hits: 0, due: 0, hasTarget: false };

/** One side's figures over [from, to]. `asOf` is that side's current day (an unmet day there is still open). */
export function sideFor(m: SharedMetric | undefined, from: string, to: string, asOf: string): Side {
  if (!m) return EMPTY_SIDE;
  let total = 0;
  let hits = 0;
  let due = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = m.days[d];
    if (!day) continue;
    total += day.t;
    if (day.s === 'h') {
      hits++;
      due++;
    } else if (day.s === 'd' && d < asOf) due++;
  }
  return { total, hits, due, hasTarget: m.target != null };
}

export type Outcome = 'me' | 'them' | 'draw';

/** A week: the higher total wins; equal totals go to more target days; then a draw. */
export function weekOutcome(me: Side, them: Side): Outcome {
  if (me.total !== them.total) return me.total > them.total ? 'me' : 'them';
  if (me.hits !== them.hits) return me.hits > them.hits ? 'me' : 'them';
  return 'draw';
}

export interface WeekResult {
  start: string;
  end: string;
  me: Side;
  them: Side;
  /** null: this week (still running), or the other side hasn't published past its end yet. */
  outcome: Outcome | null;
}

export interface Race {
  current: WeekResult;
  /** Finished weeks, newest first. */
  past: WeekResult[];
  wins: number;
  losses: number;
  draws: number;
}

/**
 * The weekly race on one link, from the week it started through this week.
 * A finished week is decided only once the other side has published a day
 * after it; until then its outcome is null and it isn't in the tally.
 */
export function race(
  mine: SharedMetric | undefined,
  theirs: SharedMetric | undefined,
  startDate: string,
  today: string,
  theirAsOf: string | null,
  weekStartsOn: 0 | 1,
): Race {
  const thisWeek = weekOf(today, weekStartsOn);
  const past: WeekResult[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (let w = weekOf(startDate, weekStartsOn); w < thisWeek; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const me = sideFor(mine, w, end, today);
    const them = sideFor(theirs, w, end, theirAsOf ?? w);
    const outcome = theirAsOf !== null && theirAsOf > end ? weekOutcome(me, them) : null;
    if (outcome === 'me') wins++;
    else if (outcome === 'them') losses++;
    else if (outcome === 'draw') draws++;
    past.unshift({ start: w, end, me, them, outcome });
  }
  const end = addDays(thisWeek, 6);
  const current: WeekResult = {
    start: thisWeek,
    end,
    me: sideFor(mine, thisWeek, end, today),
    them: sideFor(theirs, thisWeek, end, theirAsOf ?? thisWeek),
    outcome: null,
  };
  return { current, past, wins, losses, draws };
}

export type ChallengeStatus = 'pending' | 'declined' | 'cancelled' | 'upcoming' | 'active' | 'awaiting' | 'finished';

export interface ChallengeResult {
  status: ChallengeStatus;
  /** first_to and most_total: total in the period. most_days: target days met. */
  me: number;
  them: number;
  meSide: Side;
  themSide: Side;
  /** first_to: the day each side reached the amount, if they have. */
  reached: { me: string | null; them: string | null };
  /** Set when finished. */
  winner: Outcome | null;
}

/** First day the running total from `from` reaches `amount`, through `to`. */
function reachedOn(m: SharedMetric | undefined, from: string, to: string, amount: number): { date: string; total: number } | null {
  if (!m) return null;
  let sum = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    sum += m.days[d]?.t ?? 0;
    if (sum >= amount) return { date: d, total: sum };
  }
  return null;
}

/**
 * Where a challenge stands. A result is final only once the other side has
 * published past the day that decides it (their asOf after it); before that
 * a finished period reads 'awaiting'.
 *  - first_to: the earlier day to reach the amount wins; reaching it the same
 *    day goes to the higher total that day. If nobody reaches it by the end,
 *    the higher total wins.
 *  - most_total: the higher total over the period.
 *  - most_days: more days with the target met (rest days aren't due days).
 */
export function challengeResult(
  ch: Challenge,
  mine: SharedMetric | undefined,
  theirs: SharedMetric | undefined,
  today: string,
  theirAsOf: string | null,
): ChallengeResult {
  const to = today < ch.endDate ? today : ch.endDate;
  const meSide = sideFor(mine, ch.startDate, to, today);
  const themSide = sideFor(theirs, ch.startDate, to, theirAsOf ?? ch.startDate);
  const byDays = ch.kind === 'most_days';
  const base = {
    me: byDays ? meSide.hits : meSide.total,
    them: byDays ? themSide.hits : themSide.total,
    meSide,
    themSide,
    reached: { me: null as string | null, them: null as string | null },
    winner: null as Outcome | null,
  };
  if (ch.cancelledAt) return { ...base, status: 'cancelled' };
  if (ch.declinedAt) return { ...base, status: 'declined' };
  if (!ch.acceptedAt) return { ...base, status: 'pending' };
  if (today < ch.startDate) return { ...base, status: 'upcoming' };

  const theyPast = (d: string) => theirAsOf !== null && theirAsOf > d;
  const higher = (a: number, b: number): Outcome => (a === b ? 'draw' : a > b ? 'me' : 'them');

  if (ch.kind === 'first_to' && ch.amount != null) {
    const meR = reachedOn(mine, ch.startDate, to, ch.amount);
    const themR = reachedOn(theirs, ch.startDate, to, ch.amount);
    const reached = { me: meR?.date ?? null, them: themR?.date ?? null };
    if (meR || themR) {
      // Decided by the earliest day either side got there.
      const day = [meR?.date, themR?.date].filter((d): d is string => !!d).sort()[0];
      const meThen = meR?.date === day ? meR.total : 0;
      const themThen = themR?.date === day ? themR.total : 0;
      // Settled once that day is over for both: mine (it's before today) and,
      // if I got there, theirs too, since they might have got there that day.
      const done = day < today && (meThen === 0 || theyPast(day));
      if (done) return { ...base, reached, status: 'finished', winner: higher(meThen, themThen) };
      return { ...base, reached, status: today > ch.endDate ? 'awaiting' : 'active' };
    }
    if (today <= ch.endDate) return { ...base, reached, status: 'active' };
    if (!theyPast(ch.endDate)) return { ...base, reached, status: 'awaiting' };
    return { ...base, reached, status: 'finished', winner: higher(meSide.total, themSide.total) };
  }

  if (today <= ch.endDate) return { ...base, status: 'active' };
  if (!theyPast(ch.endDate)) return { ...base, status: 'awaiting' };
  return { ...base, status: 'finished', winner: higher(base.me, base.them) };
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Six characters with no 0/O or 1/I/L to misread. */
export function newInviteCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return out;
}

/** Upper-cases and strips spaces and dashes; null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6}$/.test(c) ? c : null;
}

/** "malek.b@gmail.com" → "malek.b": a default display name. */
export const nameFromEmail = (email: string | null | undefined): string => (email ?? '').split('@')[0] || 'Me';

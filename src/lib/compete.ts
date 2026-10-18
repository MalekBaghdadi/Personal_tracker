import { addDays } from './dates';
import { isHit, isScheduled, restDays, weekOf } from './streaks';
import type { DayStats, Entry, Metric, MetricType } from './types';

/*
 * Compete: two linked accounts race on linked metrics. Neither can read the
 * other's data, so each app publishes a small summary of its linked metrics
 * (per-day totals and whether the day's target was met) to the pair, and the
 * race and challenge results are derived from those summaries. Pure: no React,
 * no Firestore.
 *
 * During an accepted challenge the summary also carries that metric's
 * individual logs (amount, time, how, note) for the challenge's days, so each
 * side can see what the other actually did.
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
  /**
   * uid → more of that member's metrics added to their side, each summed into
   * it. A member adds or removes their own freely; see `counts` for which
   * weeks and challenges each one is part of. Absent: just `metrics`.
   */
  extra?: Record<string, LinkMember[]>;
}

/** A metric added to one side of a link after the start. Removing it keeps the entry, with `removedOn` set. */
export interface LinkMember {
  metricId: string;
  /** The adder's tracking day and the instant it was added. */
  addedOn: string;
  addedAt: string;
  removedOn: string | null;
  removedAt: string | null;
}

export type ChallengeKind = 'first_to' | 'most_total' | 'most_days';

export interface Challenge {
  id: string;
  linkId: string;
  kind: ChallengeKind;
  /** Base unit; first_to only. */
  amount: number | null;
  /** Both inclusive. With times, the tracking days startAt and endAt fall on. */
  startDate: string;
  endDate: string;
  /**
   * Exact start and end instants when the challenge has times; then only what
   * happened between them counts (a timer only for its part inside). Absent
   * or null: whole days. Never on most_days, which counts whole days.
   */
  startAt?: string | null;
  endAt?: string | null;
  /** What the winner gets, if they put something at stake. */
  stake?: string | null;
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

/**
 * One log, shared only for days inside an accepted challenge: its value, when
 * it happened (a timer's start), how it was logged (t timer, m manual, q quick
 * add) and its note. Not stored anywhere else; a copy for the partner.
 */
export interface SharedLog {
  v: number;
  at: string;
  src: 't' | 'm' | 'q';
  note?: string;
  /** Which metric, on a side with several (set when combining, never published). */
  m?: string;
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
  /** Each challenge day's logs, oldest first; a challenge day with nothing logged is an empty list. Absent with no challenge. */
  logs?: Record<string, SharedLog[]>;
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

/** A metric can be added to a side when it can be summed with it: time with time, or counts of the same unit. */
export const canJoin = (m: Metric, link: Pick<Link, 'type'>, unit: string): boolean =>
  canLink(m) && m.type === link.type && (m.type === 'duration' || m.unit.trim().toLowerCase() === unit.trim().toLowerCase());

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

// ── Sides with several metrics ─────────────────────────────────────────────

/** One metric on a side of a link. Null dates: there from the start, never removed. */
export interface TeamMember {
  metric: SharedMetric | undefined;
  addedOn: string | null;
  addedAt: string | null;
  removedOn: string | null;
  removedAt: string | null;
}

/** One side of a link: its first metric, then any added later, summed. */
export interface Team {
  members: TeamMember[];
}

/** The metric ids on one side of a link now, the first one first. */
export function sideMetricIds(link: Link, uid: string): string[] {
  const more = (link.extra?.[uid] ?? []).filter((x) => !x.removedOn).map((x) => x.metricId);
  return link.metrics[uid] ? [link.metrics[uid], ...more] : more;
}

/** Every metric ever on one side, removed ones too: they still count toward what finished before they left. */
export function everSideMetricIds(link: Link, uid: string): string[] {
  const ids = [link.metrics[uid], ...(link.extra?.[uid] ?? []).map((x) => x.metricId)].filter(Boolean);
  return [...new Set(ids)];
}

/** One side of a link as a team, its metrics looked up in that member's published (or live) summary. */
export function teamOf(link: Link, uid: string, metrics: Record<string, SharedMetric> | undefined): Team {
  const members: TeamMember[] = [];
  if (link.metrics[uid]) members.push({ metric: metrics?.[link.metrics[uid]], addedOn: null, addedAt: null, removedOn: null, removedAt: null });
  for (const x of link.extra?.[uid] ?? []) {
    members.push({ metric: metrics?.[x.metricId], addedOn: x.addedOn, addedAt: x.addedAt, removedOn: x.removedOn, removedAt: x.removedAt });
  }
  return { members };
}

/**
 * Whether a metric is part of a week or challenge ending on `end` (at
 * `endAt`, for one with times): added before it was over, and not removed
 * before it was over. So adding one counts it toward this week and every
 * challenge still running, from their start, and finished ones stay as they
 * were; removing one takes it out of whatever is still running.
 */
export function counts(x: TeamMember, end: string, endAt?: string): boolean {
  if (endAt) return (!x.addedAt || x.addedAt <= endAt) && (!x.removedAt || x.removedAt > endAt);
  return (!x.addedOn || x.addedOn <= end) && (!x.removedOn || x.removedOn > end);
}

// A day's status on a side: any target met makes it a target day; else any due day is a miss.
const STATUS_RANK: DayStatus[] = ['h', 'd', 'r', 'o', 'n'];

/**
 * Several metrics as one: daily totals summed, a day is a target day if any
 * of them met its target, and logs merged (each tagged with its metric).
 * They're all the same type, so the first one's type and unit hold.
 */
export function combine(metrics: SharedMetric[]): SharedMetric | undefined {
  if (metrics.length <= 1) return metrics[0];
  const days: Record<string, SharedDay> = {};
  for (const m of metrics) {
    for (const [d, day] of Object.entries(m.days)) {
      const cur = days[d];
      days[d] = !cur ? { ...day } : { t: cur.t + day.t, s: STATUS_RANK.indexOf(day.s) < STATUS_RANK.indexOf(cur.s) ? day.s : cur.s };
    }
  }
  let logs: Record<string, SharedLog[]> | undefined;
  for (const m of metrics) {
    if (!m.logs) continue;
    logs ??= {};
    for (const [d, list] of Object.entries(m.logs)) (logs[d] ??= []).push(...list.map((l) => ({ ...l, m: m.name })));
  }
  for (const list of Object.values(logs ?? {})) list.sort((a, b) => a.at.localeCompare(b.at));
  return {
    ...metrics[0],
    name: metrics.map((m) => m.name).join(' & '),
    target: metrics.find((m) => m.target != null)?.target ?? null,
    days,
    ...(logs ? { logs } : {}),
  };
}

/** A side as it stood for a week or challenge ending on `end` (at `endAt`): the metrics that count, combined. */
export function teamFor(team: Team, end: string, endAt?: string): SharedMetric | undefined {
  return combine(team.members.filter((x) => x.metric && counts(x, end, endAt)).map((x) => x.metric!));
}

/** A side: one metric, or a team of them. */
export type SideInput = SharedMetric | Team | undefined;

const isTeam = (x: SideInput): x is Team => !!x && 'members' in x;

/** A side for a period ending on `end` (at `endAt`). */
export function sideAt(x: SideInput, end: string, endAt?: string): SharedMetric | undefined {
  return isTeam(x) ? teamFor(x, end, endAt) : x;
}

/** A side for a challenge: what counts toward it. */
export const sideForChallenge = (x: SideInput, c: Challenge): SharedMetric | undefined =>
  sideAt(x, c.endDate, isTimed(c) ? c.endAt : undefined);

/** A challenge both sides agreed to and nobody called off: its days share logs. */
export const sharesLogs = (c: Challenge): boolean => !!c.acceptedAt && !c.declinedAt && !c.cancelledAt;

/** A challenge with an exact start and end time rather than whole days. */
export const isTimed = (c: Challenge): c is Challenge & { startAt: string; endAt: string } =>
  !!c.startAt && !!c.endAt && c.kind !== 'most_days';

/**
 * A challenge's tracking days by this account's own day boundary: with times,
 * the days its start and end instants fall on (so every entry inside the
 * window is on one of them); else its dates.
 */
export function challengeSpan(c: Challenge, dayOf: (instant: string) => string): { start: string; end: string } {
  return isTimed(c) ? { start: dayOf(c.startAt), end: dayOf(c.endAt) } : { start: c.startDate, end: c.endDate };
}

/** The days of a link whose logs are shared: every day of its live challenges, through today. */
export function challengeDays(challenges: Challenge[], linkId: string, today: string, dayOf: (instant: string) => string): Set<string> {
  const out = new Set<string>();
  for (const c of challenges) {
    if (c.linkId !== linkId || !sharesLogs(c)) continue;
    const span = challengeSpan(c, dayOf);
    const end = span.end < today ? span.end : today;
    for (let d = span.start; d <= end; d = addDays(d, 1)) out.add(d);
  }
  return out;
}

/**
 * How much of a log falls inside [startAt, endAt): a timer's overlap with the
 * window (in seconds), anything else whole if it was logged inside it.
 */
export function logInWindow(l: SharedLog, startAt: string, endAt: string): number {
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  const at = Date.parse(l.at);
  if (l.src !== 't') return at >= s && at < e ? l.v : 0;
  return Math.round(Math.max(0, Math.min(at + l.v * 1000, e) - Math.max(at, s)) / 1000);
}

/** A metric's logs that count toward a timed challenge, oldest first, each with its amount inside the window. */
export function windowLogs(m: SharedMetric | undefined, startAt: string, endAt: string): { log: SharedLog; counted: number }[] {
  const out: { log: SharedLog; counted: number }[] = [];
  for (const day of Object.values(m?.logs ?? {})) {
    for (const log of day) {
      const counted = logInWindow(log, startAt, endAt);
      if (counted > 0) out.push({ log, counted });
    }
  }
  return out.sort((a, b) => a.log.at.localeCompare(b.log.at));
}

const SRC: Record<Entry['source'], SharedLog['src']> = { timer: 't', manual: 'm', quick_add: 'q' };

/** A metric's live entries on the given days as shared logs, oldest first. Every day gets a list, empty or not. */
export function shareLogs(entries: Entry[], days: Set<string>): Record<string, SharedLog[]> {
  const out: Record<string, SharedLog[]> = {};
  for (const d of days) out[d] = [];
  for (const e of entries) {
    if (e.deletedAt || !days.has(e.localDate)) continue;
    // Firestore refuses undefined fields, so an empty note is left out rather than set.
    const log: SharedLog = { v: e.value, at: e.occurredAt, src: SRC[e.source] };
    if (e.note) log.note = e.note;
    out[e.localDate].push(log);
  }
  for (const d of days) out[d].sort((a, b) => a.at.localeCompare(b.at));
  return out;
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
  mine: SideInput,
  theirs: SideInput,
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
    const me = sideFor(sideAt(mine, end), w, end, today);
    const them = sideFor(sideAt(theirs, end), w, end, theirAsOf ?? w);
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
    me: sideFor(sideAt(mine, end), thisWeek, end, today),
    them: sideFor(sideAt(theirs, end), thisWeek, end, theirAsOf ?? thisWeek),
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
  /** first_to: the day each side reached the amount, if they have; with times, the instant. */
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
  mineSide: SideInput,
  theirSide: SideInput,
  today: string,
  theirAsOf: string | null,
  now: string = new Date().toISOString(),
  theirUpdatedAt: string | null = null,
): ChallengeResult {
  const mine = sideForChallenge(mineSide, ch);
  const theirs = sideForChallenge(theirSide, ch);
  if (isTimed(ch)) return timedResult(ch, mine, theirs, theirAsOf, now, theirUpdatedAt);
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

/** First instant the running amount inside the window reaches `amount` (partway through a timer, for a timer). */
function reachedAt(logs: { log: SharedLog; counted: number }[], startAt: string, amount: number): string | null {
  let sum = 0;
  for (const { log, counted } of logs) {
    if (sum + counted >= amount) {
      if (log.src !== 't') return log.at;
      const from = Math.max(Date.parse(log.at), Date.parse(startAt));
      return new Date(from + (amount - sum) * 1000).toISOString();
    }
    sum += counted;
  }
  return null;
}

/**
 * A challenge with times, worked out from both sides' shared logs. The other
 * side's figures are complete up to when they last published (their
 * updatedAt), or through the end once their day has moved past its last day.
 * Until they share logs at all, it can't settle.
 *  - first_to: the earlier instant to reach the amount wins; if nobody does
 *    by the end, the higher total.
 *  - most_total: the higher total inside the window.
 */
function timedResult(
  ch: Challenge & { startAt: string; endAt: string },
  mine: SharedMetric | undefined,
  theirs: SharedMetric | undefined,
  theirAsOf: string | null,
  now: string,
  theirUpdatedAt: string | null,
): ChallengeResult {
  const meLogs = windowLogs(mine, ch.startAt, ch.endAt);
  const themLogs = windowLogs(theirs, ch.startAt, ch.endAt);
  const sum = (logs: { counted: number }[]) => logs.reduce((s, x) => s + x.counted, 0);
  const meSide: Side = { total: sum(meLogs), hits: 0, due: 0, hasTarget: mine?.target != null };
  const themSide: Side = { total: sum(themLogs), hits: 0, due: 0, hasTarget: theirs?.target != null };
  const base = {
    me: meSide.total,
    them: themSide.total,
    meSide,
    themSide,
    reached: { me: null as string | null, them: null as string | null },
    winner: null as Outcome | null,
  };
  if (ch.cancelledAt) return { ...base, status: 'cancelled' };
  if (ch.declinedAt) return { ...base, status: 'declined' };
  if (!ch.acceptedAt) return { ...base, status: 'pending' };
  const t = (iso: string) => Date.parse(iso);
  if (t(now) < t(ch.startAt)) return { ...base, status: 'upcoming' };

  const ended = t(now) >= t(ch.endAt);
  // Their side is known through `at` once they've published after it.
  const theyPast = (at: string) =>
    !!theirs?.logs && ((theirUpdatedAt !== null && t(theirUpdatedAt) > t(at)) || (theirAsOf !== null && theirAsOf > ch.endDate));
  const higher = (a: number, b: number): Outcome => (a === b ? 'draw' : a > b ? 'me' : 'them');

  if (ch.kind === 'first_to' && ch.amount != null) {
    const reached = { me: reachedAt(meLogs, ch.startAt, ch.amount), them: reachedAt(themLogs, ch.startAt, ch.amount) };
    const { me, them } = reached;
    // They got there first. My side is live, so I can't turn out to have been earlier.
    if (them && (!me || t(them) < t(me))) return { ...base, reached, status: 'finished', winner: 'them' };
    if (me) {
      if (them && t(them) === t(me)) return { ...base, reached, status: 'finished', winner: 'draw' };
      if (theyPast(me)) return { ...base, reached, status: 'finished', winner: 'me' };
      return { ...base, reached, status: ended ? 'awaiting' : 'active' };
    }
    if (!ended) return { ...base, reached, status: 'active' };
    if (!theyPast(ch.endAt)) return { ...base, reached, status: 'awaiting' };
    return { ...base, reached, status: 'finished', winner: higher(meSide.total, themSide.total) };
  }

  if (!ended) return { ...base, status: 'active' };
  if (!theyPast(ch.endAt)) return { ...base, status: 'awaiting' };
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

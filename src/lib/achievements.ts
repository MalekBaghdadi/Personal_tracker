import { addDays, formatLocalDate, weekdayOf } from './dates';
import { isHitOn, isScheduled, restDays, streakDays, weekOf } from './streaks';
import { targetOn } from './targets';
import { formatDuration, formatNumber, formatValue } from './format';
import { themeById, themeOf } from './themes';
import { LADDERS, TIERS, achievementById, type AchievementDef, type Ladder, type LadderKind, type SecretKey } from './achievementCatalog';
import type { DayStat, DayStats, Entry, Metric } from './types';

/*
 * Which achievements are unlocked, worked out from the data every time, like
 * streaks and goals: nothing here is stored. Collecting a card (the one
 * stored fact) happens elsewhere. Each unlock carries the tracking day it was
 * first earned, so a history imported or logged late still dates it right.
 * Pure module: no React, no Firestore.
 */

/** A deadline goal or plan: when it was achieved, if it has been. */
export interface Finished {
  name: string;
  deadline: string;
  on: string | null;
}

/** A Compete week or challenge this account won. */
export interface CompeteWin {
  kind: 'week' | 'challenge';
  /** The tracking day it was decided. */
  on: string;
  label: string;
  /** Weeks: (mine − theirs) / mine. */
  margin?: number;
  stake?: string | null;
}

export interface AchievementInput {
  metrics: Metric[];
  /** Non-deleted. */
  entries: Entry[];
  /** metricId → day → totals, check-offs counted as 1 (buildDayStats). */
  dayStats: Map<string, DayStats>;
  today: string;
  tz: string;
  dayOf: (iso: string) => string;
  weekStartsOn: 0 | 1;
  goals: Finished[];
  plans: Finished[];
  /** Non-deleted plan tasks. */
  tasks: { title: string; doneAt: string | null }[];
  wins: CompeteWin[];
}

export interface Unlock {
  id: string;
  /** Tracking day it was first earned. */
  on: string;
  detail: string | null;
}

export interface Evaluation {
  unlocked: Map<string, Unlock>;
  /** Ladder id → best so far, in the ladder's unit. */
  best: Map<string, number>;
  /** Ladders that apply to this account (themes in use, the right kinds of metric), in catalogue order. */
  ladders: Ladder[];
}

type Hit = { on: string; detail: string | null };
type Event = { on: string; value: number; detail: string | null };

/** For each threshold, the first event (in the order given) to reach it. */
function firstReaching(steps: number[], events: Iterable<Event>): { best: number; hits: (Hit | null)[] } {
  const hits: (Hit | null)[] = steps.map(() => null);
  let best = 0;
  for (const e of events) {
    if (e.value > best) best = e.value;
    for (let i = 0; i < steps.length; i++) if (!hits[i] && e.value >= steps[i]) hits[i] = { on: e.on, detail: e.detail };
  }
  return { best, hits };
}

/** The nth event (1-based) earns threshold n. */
function counting(items: { on: string; detail: string | null }[]): Event[] {
  return items.map((x, i) => ({ on: x.on, value: i + 1, detail: x.detail }));
}

const byOn = <T extends { on: string }>(a: T, b: T) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0);

/**
 * A day counts for a metric when it met the target, or, with no target, when
 * anything was logged. A ceiling or range day is only settled once it's over.
 */
function counts(m: Metric, d: string, s: DayStat | undefined, today: string): boolean {
  if (!s || s.count === 0) return false;
  const t = targetOn(m, d);
  if (t.target == null) return true;
  if (t.targetDirection !== 'at_least' && d >= today) return false;
  return isHitOn(m, d, s.total, s.count) === true;
}

const clockCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock time of an instant in tz: calendar time, not the tracking day. */
export function wallClock(iso: string, tz: string): { h: number; m: number; s: number } {
  let f = clockCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    clockCache.set(tz, f);
  }
  const parts = f.formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second') };
}

const hhmm = (c: { h: number; m: number }) => `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`;

const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

const quote = (s: string) => `“${s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s}”`;

export function evaluate(input: AchievementInput): Evaluation {
  const { metrics, dayStats, today, tz, dayOf, weekStartsOn } = input;
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const theme = new Map(metrics.map((m) => [m.id, themeOf(m)]));
  // Entries of metrics we know, up to today, in the order they happened.
  const entries = input.entries
    .filter((e) => byId.has(e.metricId) && e.localDate <= today)
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.occurredAt.localeCompare(b.occurredAt));
  const timers = entries.filter((e) => e.source === 'timer' && byId.get(e.metricId)!.type === 'duration');
  const statsOf = (m: Metric): DayStats => dayStats.get(m.id) ?? new Map();
  const sortedDays = (s: DayStats) => [...s.keys()].filter((d) => d <= today).sort();

  const unlocked = new Map<string, Unlock>();
  const best = new Map<string, number>();
  const record = (ladder: Ladder, found: { best: number; hits: (Hit | null)[] }) => {
    best.set(ladder.id, found.best);
    found.hits.forEach((h, i) => {
      if (h) unlocked.set(`${ladder.id}.${i + 1}`, { id: `${ladder.id}.${i + 1}`, on: h.on, detail: h.detail });
    });
  };
  const secret = (key: SecretKey, hit: Hit | null | undefined) => {
    if (hit) unlocked.set(`secret.${key}`, { id: `secret.${key}`, on: hit.on, detail: hit.detail });
  };
  const earliest = (a: Hit | null, b: Hit | null): Hit | null => (!a ? b : !b ? a : b.on < a.on ? b : a);

  const isDuration = (m: Metric) => m.type === 'duration';
  const hasTimer = (m: Metric) => isDuration(m) && (m.timerEnabled || timers.some((e) => e.metricId === m.id));
  const notSleep = (m: Metric) => theme.get(m.id) !== 'sleep';
  const withTarget = metrics.filter((m) => m.target != null);

  // ── Day table: which target metrics were due and met each day ──
  interface Track { m: Metric; stats: DayStats; start: string; end: string; rest: Set<string> }
  const tracks: Track[] = withTarget.map((m) => {
    const stats = statsOf(m);
    const days = sortedDays(stats);
    const created = dayOf(m.createdAt);
    const start = days.length && days[0] < created ? days[0] : created;
    const end = m.archivedAt ? addDays(dayOf(m.archivedAt), -1) : today;
    return { m, stats, start, end, rest: restDays(m, stats, start, today, today, weekStartsOn) };
  });
  const sweepDays: string[] = [];
  const sweep = new Set<string>();
  const dueCount = new Map<string, number>();
  let juggled: Hit | null = null;
  const globalStart = tracks.reduce<string | null>((min, t) => (min === null || t.start < min ? t.start : min), null);
  if (globalStart !== null && globalStart <= today) {
    for (let d = globalStart; d <= today; d = addDays(d, 1)) {
      let due = 0;
      let allHit = true;
      let hits = 0;
      for (const t of tracks) {
        if (d < t.start || d > t.end) continue;
        const hit = counts(t.m, d, t.stats.get(d), today);
        if (hit) hits++;
        if (isScheduled(t.m.schedule, d) && !t.rest.has(d)) {
          due++;
          if (!hit) allHit = false;
        }
      }
      dueCount.set(d, due);
      if (due > 0 && allHit) {
        sweep.add(d);
        sweepDays.push(d);
      }
      if (!juggled && hits >= 5) juggled = { on: d, detail: `${hits} targets met` };
    }
  }

  // ── Themed ladders ──
  for (const l of LADDERS) {
    if (!l.theme) continue;
    const mine = metrics.filter((m) => theme.get(m.id) === l.theme);
    const steps = l.steps.map((s) => s.at);
    if (l.kind === 'session') {
      record(l, firstReaching(steps, timers.filter((e) => theme.get(e.metricId) === l.theme).map((e) => ({
        on: e.localDate,
        value: e.value,
        detail: `${formatDuration(e.value)} of ${byId.get(e.metricId)!.name}`,
      }))));
    } else if (l.kind === 'hours') {
      const counted = mine.filter(isDuration);
      const ids = new Set(counted.map((m) => m.id));
      const across = names(counted.filter((m) => entries.some((e) => e.metricId === m.id)).map((m) => m.name));
      let sum = 0;
      record(l, firstReaching(steps, entries.filter((e) => ids.has(e.metricId)).map((e) => {
        sum += e.value;
        return { on: e.localDate, value: sum, detail: across || null };
      })));
    } else if (l.kind === 'days') {
      const days = new Map<string, string[]>();
      for (const m of mine) {
        const stats = statsOf(m);
        for (const d of sortedDays(stats)) if (counts(m, d, stats.get(d), today)) days.set(d, [...(days.get(d) ?? []), m.name]);
      }
      record(l, firstReaching(steps, counting([...days.keys()].sort().map((d) => ({ on: d, detail: names(days.get(d)!) })))));
    }
  }

  // ── Streaks (and the Phoenix: a streak of 7+ lost, then rebuilt to 7) ──
  const streakEvents: Event[] = [];
  let phoenix: Hit | null = null;
  for (const m of withTarget) {
    const stats = statsOf(m);
    const days = sortedDays(stats);
    if (!days.length) continue;
    const last = m.targetDirection === 'at_least' ? today : addDays(today, -1);
    if (days[0] > last) continue;
    let peak = 0;
    let broke = false;
    for (const [d, p] of streakDays(m, stats, days[0], last, today, weekStartsOn)) {
      if (p > 0) {
        streakEvents.push({ on: d, value: p, detail: `${p} days of ${m.name}` });
        peak = p;
        if (broke && p >= 7) phoenix = earliest(phoenix, { on: d, detail: `${m.name}, back to 7` });
      } else if (d < today) {
        if (peak >= 7) broke = true;
        peak = 0;
      }
    }
  }
  streakEvents.sort(byOn);

  const ladder = (kind: LadderKind) => LADDERS.find((l) => l.kind === kind && !l.theme)!;
  const stepsOf = (l: Ladder) => l.steps.map((s) => s.at);

  record(ladder('streak'), firstReaching(stepsOf(ladder('streak')), streakEvents));
  record(ladder('sweep'), firstReaching(stepsOf(ladder('sweep')), counting(sweepDays.map((d) => ({ on: d, detail: `${dueCount.get(d)} due, all met` })))));

  // Perfect weeks: every due day in a finished week met, with at least 3 due metric-days.
  const perfect: { on: string; detail: string | null }[] = [];
  if (globalStart !== null) {
    for (let w = weekOf(globalStart, weekStartsOn); addDays(w, 6) < today; w = addDays(w, 7)) {
      let due = 0;
      let ok = true;
      for (let i = 0; i < 7 && ok; i++) {
        const d = addDays(w, i);
        const n = dueCount.get(d) ?? 0;
        due += n;
        if (n > 0 && !sweep.has(d)) ok = false;
      }
      if (ok && due >= 3) perfect.push({ on: addDays(w, 6), detail: `Week of ${formatLocalDate(w, 'd MMM')}` });
    }
  }
  record(ladder('perfectWeek'), firstReaching(stepsOf(ladder('perfectWeek')), counting(perfect)));

  const loggedDays = [...new Set(entries.map((e) => e.localDate))].sort();
  record(ladder('showUp'), firstReaching(stepsOf(ladder('showUp')), counting(loggedDays.map((d) => ({ on: d, detail: null })))));

  // ── The grind ──
  const timeMetrics = metrics.filter((m) => isDuration(m) && notSleep(m));
  const dayEvents: Event[] = [];
  const perDay = new Map<string, number>();
  for (const m of timeMetrics) {
    const stats = statsOf(m);
    for (const d of sortedDays(stats)) {
      const t = stats.get(d)!.total;
      dayEvents.push({ on: d, value: t, detail: `${formatDuration(t)} of ${m.name}` });
      perDay.set(d, (perDay.get(d) ?? 0) + t);
    }
  }
  record(ladder('bigDay'), firstReaching(stepsOf(ladder('bigDay')), dayEvents.sort(byOn)));

  const weekEvents: Event[] = [];
  let week = '';
  let weekSum = 0;
  for (const d of [...perDay.keys()].sort()) {
    const w = weekOf(d, weekStartsOn);
    if (w !== week) {
      week = w;
      weekSum = 0;
    }
    weekSum += perDay.get(d)!;
    weekEvents.push({ on: d, value: weekSum, detail: `${formatDuration(weekSum)}, week of ${formatLocalDate(w, 'd MMM')}` });
  }
  record(ladder('bigWeek'), firstReaching(stepsOf(ladder('bigWeek')), weekEvents));

  // At-least amounts only, and not Health or Sleep: double the water or the sleep isn't an achievement.
  const amounts = metrics.filter((m) => m.targetDirection === 'at_least' && m.type !== 'check' && (m.target ?? 0) > 0);
  const overMetrics = amounts.filter((m) => theme.get(m.id) !== 'health' && theme.get(m.id) !== 'sleep');
  const overEvents: Event[] = [];
  for (const m of overMetrics) {
    const stats = statsOf(m);
    for (const d of sortedDays(stats)) {
      const t = stats.get(d)!.total;
      const day = targetOn(m, d); // the target that applied that day
      if (day.targetDirection !== 'at_least' || !((day.target ?? 0) > 0)) continue;
      overEvents.push({ on: d, value: t / day.target!, detail: `${formatValue(m, t)} of ${m.name}, target ${formatValue(m, day.target!)}` });
    }
  }
  record(ladder('over'), firstReaching(stepsOf(ladder('over')), overEvents.sort(byOn)));

  // ── Goals and plans ──
  const finished = [...input.goals, ...input.plans].filter((g): g is Finished & { on: string } => !!g.on && g.on <= today);
  record(ladder('finisher'), firstReaching(stepsOf(ladder('finisher')), counting(finished.map((g) => ({ on: g.on, detail: g.name })).sort(byOn))));
  const ticked = input.tasks
    .filter((t): t is { title: string; doneAt: string } => !!t.doneAt)
    .sort((a, b) => a.doneAt.localeCompare(b.doneAt))
    .map((t) => ({ on: dayOf(t.doneAt), detail: t.title }))
    .filter((t) => t.on <= today);
  record(ladder('tasks'), firstReaching(stepsOf(ladder('tasks')), counting(ticked)));

  // ── Compete ──
  const wins = [...input.wins].filter((w) => w.on <= today).sort(byOn);
  record(ladder('weeksWon'), firstReaching(stepsOf(ladder('weeksWon')), counting(wins.filter((w) => w.kind === 'week').map((w) => ({ on: w.on, detail: w.label })))));
  record(ladder('challengesWon'), firstReaching(stepsOf(ladder('challengesWon')), counting(wins.filter((w) => w.kind === 'challenge').map((w) => ({ on: w.on, detail: w.label })))));

  // ── Odd hours and notes ──
  const early: { on: string; detail: string }[] = [];
  const late: { on: string; detail: string }[] = [];
  for (const e of timers) {
    const c = wallClock(e.occurredAt, tz);
    const name = byId.get(e.metricId)!.name;
    if (c.h >= 4 && c.h < 7) early.push({ on: e.localDate, detail: `${name}, started ${hhmm(c)}` });
    // Running at some point between midnight and 4am: started then, or ran on past midnight.
    const sinceMidnight = c.h * 3600 + c.m * 60 + c.s;
    if (c.h < 4 || e.value > 86_400 - sinceMidnight) {
      const end = wallClock(new Date(Date.parse(e.occurredAt) + e.value * 1000).toISOString(), tz);
      late.push({ on: e.localDate, detail: `${name}, ${hhmm(c)}–${hhmm(end)}` });
    }
  }
  record(ladder('earlyBird'), firstReaching(stepsOf(ladder('earlyBird')), counting(early)));
  record(ladder('nightOwl'), firstReaching(stepsOf(ladder('nightOwl')), counting(late)));
  const noted = entries.filter((e) => e.note?.trim());
  record(ladder('notes'), firstReaching(stepsOf(ladder('notes')), counting(noted.map((e) => ({ on: e.localDate, detail: quote(e.note!.trim()) })))));

  // ── Secrets ──
  const firstDay = (ms: Metric[], test: (m: Metric, s: DayStat) => boolean, detail: (m: Metric, s: DayStat) => string): Hit | null => {
    let hit: Hit | null = null;
    for (const m of ms) {
      const stats = statsOf(m);
      for (const d of sortedDays(stats)) {
        const s = stats.get(d)!;
        if (test(m, s)) {
          hit = earliest(hit, { on: d, detail: detail(m, s) });
          break;
        }
      }
    }
    return hit;
  };
  secret('over9000', firstDay(metrics.filter((m) => m.type === 'count'), (_, s) => s.total > 9000, (m, s) => `${formatValue(m, s.total)} of ${m.name}`));
  secret('hibernation', firstDay(metrics.filter((m) => isDuration(m) && !notSleep(m)), (_, s) => s.total >= 12 * 3600, (m, s) => `${formatDuration(s.total)} of ${m.name}`));
  secret('bullseye', firstDay(amounts, (m, s) => s.count > 0 && s.total === m.target, (m, s) => `Exactly ${formatValue(m, s.total)} of ${m.name}`));

  const tasksPerDay = new Map<string, number>();
  for (const t of ticked) {
    const n = (tasksPerDay.get(t.on) ?? 0) + 1;
    tasksPerDay.set(t.on, n);
    if (n === 5 && !unlocked.has('secret.speedrun')) secret('speedrun', { on: t.on, detail: '5 tasks in one day' });
  }

  const newYear = entries.find((e) => e.localDate.endsWith('-01-01'));
  secret('newYear', newYear && { on: newYear.localDate, detail: byId.get(newYear.metricId)!.name });

  const saturday = sweepDays.find((d) => weekdayOf(d) === 6 && sweep.has(addDays(d, 1)));
  secret('weekendWarrior', saturday ? { on: addDays(saturday, 1), detail: `Weekend of ${formatLocalDate(saturday, 'd MMM')}` } : null);

  secret('phoenix', phoenix);

  const close = wins.find((w) => w.kind === 'week' && w.margin != null && w.margin < 0.02);
  secret('photoFinish', close && { on: close.on, detail: close.label });
  const prize = wins.find((w) => w.kind === 'challenge' && w.stake);
  secret('paidInFull', prize && { on: prize.on, detail: `Winner gets ${prize.stake}` });

  const early7 = finished.filter((g) => g.on <= addDays(g.deadline, -7)).sort(byOn)[0];
  secret('earlyFinisher', early7 && { on: early7.on, detail: early7.name });

  const rest = metrics.flatMap((m) => (m.restDates ?? []).filter((d) => d <= today).map((d) => ({ on: d, detail: m.name }))).sort(byOn)[0];
  secret('strategicRest', rest);

  let travel: Hit | null = null;
  for (const e of entries) {
    if (e.source === 'timer') continue;
    const loggedOn = dayOf(e.createdAt);
    if (e.localDate < loggedOn && loggedOn <= today) travel = earliest(travel, { on: loggedOn, detail: `${byId.get(e.metricId)!.name} for ${formatLocalDate(e.localDate, 'd MMM')}` });
  }
  secret('timeTraveller', travel);

  secret('juggler', juggled);

  const marathon = timers.find((e) => e.value >= 12 * 3600);
  secret('forgotTimer', marathon && { on: marathon.localDate, detail: `${formatDuration(marathon.value)} of ${byId.get(marathon.metricId)!.name}` });

  const essay = noted.find((e) => e.note!.trim().length >= 200);
  secret('essayist', essay && { on: essay.localDate, detail: `${essay.note!.trim().length} characters` });

  const mondays = sweepDays.filter((d) => weekdayOf(d) === 1);
  secret('mondayPerson', mondays.length >= 10 ? { on: mondays[9], detail: '10 perfect Mondays' } : null);

  // ── What applies to this account ──
  const used = new Set(theme.values());
  const applies = (l: Ladder): boolean => {
    if (l.theme) {
      if (!used.has(l.theme)) return false;
      const mine = metrics.filter((m) => theme.get(m.id) === l.theme);
      if (l.kind === 'session') return mine.some(hasTimer);
      if (l.kind === 'hours') return mine.some(isDuration);
      return true;
    }
    switch (l.kind) {
      case 'streak':
      case 'sweep':
      case 'perfectWeek':
        return withTarget.length > 0;
      case 'bigDay':
      case 'bigWeek':
        return timeMetrics.length > 0;
      case 'over':
        return overMetrics.length > 0;
      case 'earlyBird':
      case 'nightOwl':
        return metrics.some(hasTimer);
      default:
        return true;
    }
  };

  return { unlocked, best, ladders: LADDERS.filter(applies) };
}

// ── Words ───────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** What a ladder's threshold takes, in words: "10h straight on one timer". */
export function needFor(l: Ladder, at: number): string {
  const nights = l.theme === 'sleep';
  switch (l.kind) {
    case 'session': return `${formatDuration(at)} straight on one timer`;
    case 'hours': return `${formatDuration(at)} logged in total`;
    case 'days': return `${plural(at, nights ? 'night' : 'day')} on target`;
    case 'streak': return `A ${at}-day streak`;
    case 'sweep': return at === 1 ? 'Meet every target due in one day' : `${plural(at, 'day')} meeting every target due`;
    case 'perfectWeek': return at === 1 ? 'A week with every due day done' : `${plural(at, 'week')} with every due day done`;
    case 'showUp': return `${plural(at, 'day')} with something logged`;
    case 'bigDay': return `${formatDuration(at)} on one metric in a day`;
    case 'bigWeek': return `${formatDuration(at)} logged in one week`;
    case 'over': return `${at}× a daily target in one day`;
    case 'finisher': return at === 1 ? 'Finish a deadline goal or plan' : `Finish ${at} deadline goals or plans`;
    case 'tasks': return `${plural(at, 'plan task')} done`;
    case 'weeksWon': return at === 1 ? 'Win a week in Compete' : `Win ${at} weeks in Compete`;
    case 'challengesWon': return at === 1 ? 'Win a Compete challenge' : `Win ${at} Compete challenges`;
    case 'earlyBird': return at === 1 ? 'Start a timer between 4 and 7am' : `Start ${at} timers between 4 and 7am`;
    case 'nightOwl': return at === 1 ? 'Have a timer running past midnight' : `${at} timers running past midnight`;
    case 'notes': return at === 1 ? 'Write a note on something you logged' : `Write ${at} notes on what you logged`;
  }
}

export function needOf(def: AchievementDef): string {
  if (def.secret) return def.secret.need;
  return needFor(def.ladder!, def.ladder!.steps[def.step!].at);
}

/** A ladder's best so far, in words: "6h 12m", "12 days", "2.5×". */
export function bestText(l: Ladder, value: number): string {
  switch (l.kind) {
    case 'session':
    case 'hours':
    case 'bigDay':
    case 'bigWeek':
      return formatDuration(value);
    case 'over':
      return `${(Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/, '')}×`;
    case 'streak':
    case 'showUp':
      return plural(value, 'day');
    case 'days':
      return plural(value, l.theme === 'sleep' ? 'night' : 'day');
    case 'sweep':
      return plural(value, 'day');
    case 'perfectWeek':
    case 'weeksWon':
      return plural(value, 'week');
    case 'challengesWon':
      return plural(value, 'challenge');
    case 'finisher':
      return plural(value, 'goal');
    case 'tasks':
      return plural(value, 'task');
    case 'earlyBird':
    case 'nightOwl':
      return plural(value, 'session');
    case 'notes':
      return plural(value, 'note');
  }
}

/** "Study · Longest session", "Streaks · Best streak", "Secret". */
export function placeOf(def: AchievementDef): string {
  if (def.secret) return 'Secret';
  const l = def.ladder!;
  return l.theme ? `${themeById.get(l.theme)!.label} · ${l.title}` : l.title;
}

export function xpOf(ids: Iterable<string>): number {
  let xp = 0;
  for (const id of ids) {
    const def = achievementById.get(id);
    if (def) xp += TIERS[def.tier].xp;
  }
  return xp;
}


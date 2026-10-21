import { describe, expect, it } from 'vitest';
import { bestText, evaluate, needFor, needOf, xpOf, type AchievementInput, type CompeteWin, type Finished } from './achievements';
import { ACHIEVEMENTS, LADDERS, SECRETS, achievementById, levelFor, rankFor, xpForLevel } from './achievementCatalog';
import { themeFromIcon, themeOf } from './themes';
import { artOf, hasArt } from './achievementArt';
import { buildDayStats } from './admin';
import { dayOf } from './dates';
import type { Entry, Metric } from './types';

const H = 3600;

const metric = (over: Partial<Metric> & { id: string }): Metric => ({
  name: over.id,
  type: 'duration',
  unit: 'min',
  target: H,
  targetDirection: 'at_least',
  targetMin: null,
  schedule: { kind: 'daily' },
  timerEnabled: true,
  quickAdd: [],
  color: '#6690E6',
  icon: 'Target',
  order: 0,
  archivedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '',
  ...over,
});

let n = 0;
const entry = (metricId: string, localDate: string, value: number, over: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`,
  metricId,
  localDate,
  value,
  source: 'manual',
  note: null,
  occurredAt: `${localDate}T12:00:00.000Z`,
  createdAt: `${localDate}T12:00:00.000Z`,
  updatedAt: '',
  deletedAt: null,
  ...over,
});
const timer = (metricId: string, localDate: string, seconds: number, startUtc = 'T09:00:00.000Z') =>
  entry(metricId, localDate, seconds, { source: 'timer', occurredAt: `${localDate}${startUtc}` });

/** Every day from `from` through `to`, inclusive. */
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

interface Opts { today?: string; tz?: string; goals?: Finished[]; plans?: Finished[]; tasks?: AchievementInput['tasks']; wins?: CompeteWin[] }

function run(metrics: Metric[], entries: Entry[], o: Opts = {}) {
  const tz = o.tz ?? 'UTC';
  return evaluate({
    metrics,
    entries,
    dayStats: buildDayStats(entries, metrics),
    today: o.today ?? '2026-10-20',
    tz,
    dayOf: (iso) => dayOf(iso, tz, 0),
    weekStartsOn: 1,
    goals: o.goals ?? [],
    plans: o.plans ?? [],
    tasks: o.tasks ?? [],
    wins: o.wins ?? [],
  });
}

const on = (r: ReturnType<typeof run>, id: string) => r.unlocked.get(id)?.on ?? null;

describe('the catalogue', () => {
  it('has unique ids and names, six rising steps per ladder, tiers in order', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = ACHIEVEMENTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const l of LADDERS) {
      expect(l.steps).toHaveLength(6);
      for (let i = 1; i < 6; i++) expect(l.steps[i].at).toBeGreaterThan(l.steps[i - 1].at);
    }
    expect(achievementById.get('study.session.6')?.name).toBe('Academic Menace');
    expect(achievementById.get('study.session.6')?.tier).toBe(5);
    expect(SECRETS.length).toBe(16);
  });
  it('every card has its own pin art, and no ladder shows the same icon twice', () => {
    for (const a of ACHIEVEMENTS) expect(hasArt(a.id), a.id).toBe(true);
    for (const l of LADDERS) {
      const icons = l.steps.map((_, i) => artOf(`${l.id}.${i + 1}`).icon);
      expect(new Set(icons).size, l.id).toBe(icons.length);
    }
  });
  it('still carries emoji for partners on an older app', () => {
    for (const a of ACHIEVEMENTS) expect(a.art[0], a.id).toBeTruthy();
  });
  it('every theme has a days ladder; health and sleep have only that', () => {
    for (const t of ['study', 'code', 'reading', 'fitness', 'mind', 'creative', 'health', 'sleep', 'other']) {
      expect(LADDERS.some((l) => l.id === `${t}.days`)).toBe(true);
    }
    expect(LADDERS.filter((l) => l.theme === 'health' || l.theme === 'sleep').map((l) => l.kind)).toEqual(['days', 'days']);
  });
  it('says what each card takes', () => {
    expect(needOf(achievementById.get('study.session.6')!)).toBe('10h straight on one timer');
    expect(needOf(achievementById.get('streak.2')!)).toBe('A 7-day streak');
    expect(needOf(achievementById.get('sleep.days.2')!)).toBe('30 nights on target');
    expect(needOf(achievementById.get('over.1')!)).toBe('1.5× a daily target in one day');
    expect(needOf(achievementById.get('secret.over9000')!)).toBe('Log over 9,000 of something in one day.');
    expect(needFor(LADDERS.find((l) => l.id === 'sweep')!, 1)).toBe('Meet every target due in one day');
    expect(bestText(LADDERS.find((l) => l.id === 'over')!, 2.56)).toBe('2.5×');
    expect(bestText(LADDERS.find((l) => l.id === 'study.session')!, 6 * H + 12 * 60)).toBe('6h 12m');
  });
});

describe('themes', () => {
  it('follow the icon until one is picked', () => {
    expect(themeOf({ icon: 'GraduationCap' })).toBe('study');
    expect(themeOf({ icon: 'Dumbbell' })).toBe('fitness');
    expect(themeOf({ icon: 'Target' })).toBe('other');
    expect(themeOf({ icon: 'Target', theme: 'study' })).toBe('study');
    expect(themeFromIcon('Moon')).toBe('sleep');
  });
  it('only the themes in use apply, with the ladders their metrics can earn', () => {
    const r = run([metric({ id: 'mcat', name: 'MCAT', theme: 'study' }), metric({ id: 'gym', type: 'check', unit: 'days', target: 1, icon: 'Dumbbell', timerEnabled: false })], []);
    const ids = r.ladders.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['study.session', 'study.hours', 'study.days', 'fitness.days']));
    expect(ids).not.toContain('fitness.session');
    expect(ids).not.toContain('other.days');
    expect(ids).not.toContain('reading.days');
  });
});

describe('themed ladders', () => {
  const study = metric({ id: 'study', name: 'Studying', icon: 'GraduationCap' });
  const net = metric({ id: 'net', name: 'Network+', icon: 'Network' });

  it('longest session: one timer run, first day each threshold was reached', () => {
    const r = run([study], [timer('study', '2026-10-05', H + 300), entry('study', '2026-10-06', 6 * H), timer('study', '2026-10-12', 3 * H)]);
    expect(on(r, 'study.session.1')).toBe('2026-10-05');
    expect(on(r, 'study.session.2')).toBe('2026-10-12');
    expect(on(r, 'study.session.3')).toBe('2026-10-12');
    // A typed 6h isn't a session.
    expect(on(r, 'study.session.4')).toBe(null);
    expect(r.best.get('study.session')).toBe(3 * H);
    expect(r.unlocked.get('study.session.3')?.detail).toBe('3h of Studying');
  });
  it('Academic Menace at ten hours straight', () => {
    const r = run([study], [timer('study', '2026-10-10', 10 * H)]);
    expect(on(r, 'study.session.6')).toBe('2026-10-10');
  });
  it('a metric with its own theme counts toward that theme, whatever its icon', () => {
    const mcat = metric({ id: 'mcat', name: 'MCAT', theme: 'study' });
    expect(on(run([mcat], [timer('mcat', '2026-10-10', 2 * H)]), 'study.session.2')).toBe('2026-10-10');
    expect(on(run([mcat], [timer('mcat', '2026-10-10', 2 * H)]), 'other.session.2')).toBe(null);
  });
  it('hours add up across the theme’s metrics, any way they were logged', () => {
    const r = run([study, net], [entry('study', '2026-10-02', 4 * H), timer('net', '2026-10-03', 4 * H), entry('study', '2026-10-04', 2 * H)]);
    expect(on(r, 'study.hours.1')).toBe('2026-10-04');
    expect(r.best.get('study.hours')).toBe(10 * H);
    expect(r.unlocked.get('study.hours.1')?.detail).toBe('Studying and Network+');
  });
  it('days on target: a hit on any of the theme’s metrics; ceilings settle once the day is over', () => {
    const cal = metric({ id: 'cal', name: 'Calories', type: 'count', unit: 'kcal', target: 2000, targetDirection: 'at_most', icon: 'Flame' });
    const water = metric({ id: 'water', type: 'count', unit: 'glasses', target: 8, icon: 'Droplet' });
    const list = days('2026-10-14', '2026-10-19').map((d) => entry('cal', d, 1500));
    const r = run([cal, water], [...list, entry('cal', '2026-10-20', 1200), entry('water', '2026-10-20', 8)], { today: '2026-10-20' });
    // Six finished calorie days plus today's water: the seventh day.
    expect(on(r, 'health.days.1')).toBe('2026-10-20');
    const without = run([cal], [...list, entry('cal', '2026-10-20', 1200)], { today: '2026-10-20' });
    expect(on(without, 'health.days.1')).toBe(null);
  });
});

describe('streaks and consistency', () => {
  const gym = metric({ id: 'gym', name: 'Gym', type: 'check', unit: 'days', target: 1, timerEnabled: false, icon: 'Dumbbell' });
  it('best streak, dated the day it got there', () => {
    const r = run([gym], days('2026-10-01', '2026-10-07').map((d) => entry('gym', d, 1)));
    expect(on(r, 'streak.1')).toBe('2026-10-03');
    expect(on(r, 'streak.2')).toBe('2026-10-07');
    expect(on(r, 'streak.3')).toBe(null);
    expect(r.unlocked.get('streak.2')?.detail).toBe('7 days of Gym');
  });
  it('a ceiling’s streak doesn’t count today until the day is over', () => {
    const cal = metric({ id: 'cal', type: 'count', unit: 'kcal', target: 2000, targetDirection: 'at_most', icon: 'Flame' });
    const r = run([cal], days('2026-10-18', '2026-10-20').map((d) => entry('cal', d, 1500)), { today: '2026-10-20' });
    expect(on(r, 'streak.1')).toBe(null);
    expect(on(run([cal], days('2026-10-18', '2026-10-20').map((d) => entry('cal', d, 1500)), { today: '2026-10-21' }), 'streak.1')).toBe('2026-10-20');
  });
  it('clean sweeps need every due target met; perfect weeks need a finished week', () => {
    const a = metric({ id: 'a', createdAt: '2026-10-05T08:00:00.000Z' });
    const b = metric({ id: 'b', createdAt: '2026-10-05T08:00:00.000Z', schedule: { kind: 'days_of_week', days: [1, 3, 5] } });
    const week = days('2026-10-05', '2026-10-11');
    const entries = [...week.map((d) => entry('a', d, H)), ...['2026-10-05', '2026-10-07', '2026-10-09'].map((d) => entry('b', d, H))];
    const r = run([a, b], entries, { today: '2026-10-12' });
    expect(on(r, 'sweep.1')).toBe('2026-10-05');
    expect(on(r, 'sweep.2')).toBe('2026-10-11');
    expect(on(r, 'perfectWeek.1')).toBe('2026-10-11');
    // Miss b on Wednesday: no perfect week, one fewer sweep.
    const miss = run([a, b], entries.filter((e) => !(e.metricId === 'b' && e.localDate === '2026-10-07')), { today: '2026-10-12' });
    expect(on(miss, 'perfectWeek.1')).toBe(null);
    expect(miss.best.get('sweep')).toBe(6);
  });
  it('a week still running isn’t perfect yet', () => {
    const a = metric({ id: 'a', createdAt: '2026-10-05T08:00:00.000Z' });
    expect(on(run([a], days('2026-10-05', '2026-10-11').map((d) => entry('a', d, H)), { today: '2026-10-11' }), 'perfectWeek.1')).toBe(null);
  });
  it('showing up counts distinct days with anything logged', () => {
    const free = metric({ id: 'free', target: null });
    const list = days('2026-10-01', '2026-10-07').flatMap((d) => [entry('free', d, 60), entry('free', d, 60)]);
    expect(on(run([free], list), 'showUp.1')).toBe('2026-10-07');
  });
});

describe('the grind', () => {
  const study = metric({ id: 'study', name: 'Studying', icon: 'GraduationCap' });
  const sleep = metric({ id: 'sleep', name: 'Sleep', icon: 'Moon', target: 8 * H, timerEnabled: false });
  it('biggest day leaves sleep out; biggest week adds the week up', () => {
    const r = run([study, sleep], [entry('sleep', '2026-10-05', 9 * H), entry('study', '2026-10-05', 2 * H), entry('study', '2026-10-06', 3 * H), entry('study', '2026-10-07', 5 * H)]);
    expect(on(r, 'bigDay.1')).toBe('2026-10-06');
    expect(on(r, 'bigDay.2')).toBe('2026-10-07');
    expect(on(r, 'bigWeek.1')).toBe('2026-10-07');
    expect(r.best.get('bigWeek')).toBe(10 * H);
  });
  it('overachiever leaves Health and Sleep out: more water isn’t the point', () => {
    const water = metric({ id: 'water', type: 'count', unit: 'glasses', target: 8, icon: 'Droplet' });
    const r = run([water], [entry('water', '2026-10-05', 24)]);
    expect(on(r, 'over.1')).toBe(null);
    expect(r.ladders.some((l) => l.id === 'over')).toBe(false);
    // A bullseye still counts.
    expect(on(run([water], [entry('water', '2026-10-05', 8)]), 'secret.bullseye')).toBe('2026-10-05');
  });
  it('overachiever: multiples of an at-least target, never a check-off', () => {
    const gym = metric({ id: 'gym', type: 'check', unit: 'days', target: 1, timerEnabled: false });
    const r = run([study, gym], [entry('study', '2026-10-05', 2.5 * H), entry('gym', '2026-10-05', 1), entry('gym', '2026-10-05', 1)]);
    expect(on(r, 'over.1')).toBe('2026-10-05');
    expect(on(r, 'over.2')).toBe('2026-10-05');
    expect(on(r, 'over.3')).toBe(null);
    expect(r.best.get('over')).toBe(2.5);
  });
});

describe('goals, plans and Compete', () => {
  it('finished goals and plans, and plan tasks', () => {
    const tasks = ['09:00', '10:00', '11:00', '12:00', '13:00'].map((t, i) => ({ title: `Task ${i + 1}`, doneAt: `2026-10-16T${t}:00.000Z` }));
    const r = run([], [], {
      goals: [{ name: 'Network+ — 120h', deadline: '2026-12-15', on: '2026-10-18' }],
      plans: [{ name: 'Uptime Monitor', deadline: '2026-11-27', on: null }],
      tasks,
    });
    expect(on(r, 'finisher.1')).toBe('2026-10-18');
    expect(r.unlocked.get('finisher.1')?.detail).toBe('Network+ — 120h');
    expect(on(r, 'secret.earlyFinisher')).toBe('2026-10-18');
    expect(on(r, 'secret.speedrun')).toBe('2026-10-16');
    expect(r.best.get('tasks')).toBe(5);
  });
  it('weeks and challenges won, by a nose and for a prize', () => {
    const r = run([], [], {
      wins: [
        { kind: 'week', on: '2026-10-11', label: 'Beat Cousin 10h to 9h 55m', margin: 0.008 },
        { kind: 'week', on: '2026-10-18', label: 'Beat Cousin 12h to 8h', margin: 0.33 },
        { kind: 'challenge', on: '2026-10-15', label: 'Most Studying', stake: 'Dinner' },
      ],
    });
    expect(on(r, 'weeksWon.1')).toBe('2026-10-11');
    expect(r.best.get('weeksWon')).toBe(2);
    expect(on(r, 'challengesWon.1')).toBe('2026-10-15');
    expect(on(r, 'secret.photoFinish')).toBe('2026-10-11');
    expect(r.unlocked.get('secret.paidInFull')?.detail).toBe('Winner gets Dinner');
  });
});

describe('odd hours and notes', () => {
  const code = metric({ id: 'code', name: 'Coding', icon: 'Code' });
  it('early bird and night owl go by the wall clock in the user’s timezone', () => {
    // Beirut is UTC+3 in October.
    const r = run([code], [
      timer('code', '2026-10-10', H, 'T03:30:00.000Z'), // 06:30
      timer('code', '2026-10-11', 2 * H, 'T20:30:00.000Z'), // 23:30 to 01:30
      timer('code', '2026-10-12', H, 'T10:00:00.000Z'), // 13:00
    ], { tz: 'Asia/Beirut' });
    expect(on(r, 'earlyBird.1')).toBe('2026-10-10');
    expect(r.unlocked.get('earlyBird.1')?.detail).toBe('Coding, started 06:30');
    expect(on(r, 'nightOwl.1')).toBe('2026-10-11');
    expect(r.unlocked.get('nightOwl.1')?.detail).toBe('Coding, 23:30–01:30');
    expect(r.best.get('nightOwl')).toBe(1);
  });
  it('notes, and a long one', () => {
    const r = run([code], [entry('code', '2026-10-10', 600, { note: 'Finished the health-check worker' }), entry('code', '2026-10-11', 600, { note: 'x'.repeat(210) })]);
    expect(on(r, 'notes.1')).toBe('2026-10-10');
    expect(r.unlocked.get('notes.1')?.detail).toBe('“Finished the health-check worker”');
    expect(on(r, 'secret.essayist')).toBe('2026-10-11');
  });
});

describe('secrets', () => {
  it('over 9000, hibernation, bullseye and a marathon timer', () => {
    const walk = metric({ id: 'walk', type: 'count', unit: 'steps', target: 8000, icon: 'Footprints' });
    const sleep = metric({ id: 'sleep', icon: 'Moon', target: 8 * H, timerEnabled: false });
    const study = metric({ id: 'study', icon: 'GraduationCap' });
    const r = run([walk, sleep, study], [
      entry('walk', '2026-10-09', 9500),
      entry('sleep', '2026-10-10', 12 * H),
      entry('study', '2026-10-11', 1800, { source: 'quick_add' }),
      entry('study', '2026-10-11', 1800, { source: 'quick_add' }),
      timer('study', '2026-10-12', 13 * H),
    ]);
    expect(on(r, 'secret.over9000')).toBe('2026-10-09');
    expect(on(r, 'secret.hibernation')).toBe('2026-10-10');
    expect(on(r, 'bigDay.1')).toBe('2026-10-12'); // the 12h of sleep doesn't count
    expect(on(r, 'secret.bullseye')).toBe('2026-10-11');
    expect(on(r, 'secret.forgotTimer')).toBe('2026-10-12');
  });
  it('the weekend warrior and Monday person', () => {
    const a = metric({ id: 'a', createdAt: '2026-08-01T08:00:00.000Z', schedule: { kind: 'days_of_week', days: [1, 6, 0] } });
    const mondays = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const r = run([a], [...mondays.map((d) => entry('a', d, H)), entry('a', '2026-10-10', H), entry('a', '2026-10-11', H)]);
    expect(on(r, 'secret.weekendWarrior')).toBe('2026-10-11');
    expect(on(r, 'secret.mondayPerson')).toBe('2026-10-19');
  });
  it('the phoenix: a 7-day streak lost, then rebuilt', () => {
    const a = metric({ id: 'a' });
    const list = [...days('2026-10-01', '2026-10-07'), ...days('2026-10-09', '2026-10-15')].map((d) => entry('a', d, H));
    expect(on(run([a], list), 'secret.phoenix')).toBe('2026-10-15');
    expect(on(run([a], list.slice(0, 12)), 'secret.phoenix')).toBe(null);
  });
  it('a rest day, logging into the past, five targets in a day', () => {
    const ms = ['a', 'b', 'c', 'd', 'e'].map((id) => metric({ id }));
    ms[0].restDates = ['2026-10-14'];
    const r = run(ms, [
      ...ms.map((m) => entry(m.id, '2026-10-10', H)),
      entry('a', '2026-10-09', 600, { createdAt: '2026-10-10T08:00:00.000Z' }),
    ]);
    expect(on(r, 'secret.strategicRest')).toBe('2026-10-14');
    expect(on(r, 'secret.timeTraveller')).toBe('2026-10-10');
    expect(on(r, 'secret.juggler')).toBe('2026-10-10');
  });
  it('a timer that ran past the day start isn’t time travel', () => {
    const a = metric({ id: 'a' });
    const r = run([a], [entry('a', '2026-10-09', 7200, { source: 'timer', occurredAt: '2026-10-09T23:00:00.000Z', createdAt: '2026-10-10T01:00:00.000Z' })]);
    expect(on(r, 'secret.timeTraveller')).toBe(null);
  });
  it('a first of January', () => {
    expect(on(run([metric({ id: 'a' })], [entry('a', '2027-01-01', 60)], { today: '2027-01-02' }), 'secret.newYear')).toBe('2027-01-01');
  });
});

describe('levels', () => {
  it('each level costs 25 XP more than the last', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 25, 75, 150, 250]);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(24)).toBe(1);
    expect(levelFor(25)).toBe(2);
    expect(levelFor(260)).toBe(5);
    expect(rankFor(1).name).toBe('Fresh Spawn');
    expect(rankFor(12).name).toBe('Main Character');
  });
  it('XP comes from the tiers of collected cards', () => {
    expect(xpOf(['study.session.1', 'study.session.6', 'secret.phoenix', 'nope'])).toBe(10 + 400 + 100);
  });
});

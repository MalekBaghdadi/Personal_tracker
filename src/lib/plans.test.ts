import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allTasks, parsePlanMarkdown, planPrompt, planWarnings, promptExample, readDate, summarize } from './planMarkdown';
import { MON_FRI, addScheduledDays, computePlan, orderTasks, plannedDates, planNeedLabel, planStatusLabel, planWeek, pushRemaining, scheduleFromDates, scheduleLabel } from './plans';
import type { PlanTask } from './types';

const FIXTURE = readFileSync(new URL('../../e2e/fixtures/uptime-plan.md', import.meta.url), 'utf8');

// ── Markdown ───────────────────────────────────────────────────────────────

describe('readDate', () => {
  it('reads the common forms', () => {
    expect(readDate('Mon Oct 19')).toEqual({ y: null, m: 10, d: 19 });
    expect(readDate('Oct 19:')).toEqual({ y: null, m: 10, d: 19 });
    expect(readDate('19 Oct')).toEqual({ y: null, m: 10, d: 19 });
    expect(readDate('Monday, October 19, 2026')).toEqual({ y: 2026, m: 10, d: 19 });
    expect(readDate('2026-10-19')).toEqual({ y: 2026, m: 10, d: 19 });
  });
  it('a weekday alone, or other bold text, is not a date', () => {
    expect(readDate('Monday')).toBeNull();
    expect(readDate('Note')).toBeNull();
    expect(readDate('Oct 45')).toBeNull();
  });
});

describe('the Uptime Monitor plan', () => {
  const p = parsePlanMarkdown(FIXTURE, '2026-10-05');
  const s = summarize(p, '2026-10-05');

  it('6 sections, 30 tasks, 5 checkpoints (week 6 has none)', () => {
    expect(s.sections).toBe(6);
    expect(s.tasks).toBe(30);
    expect(s.checkpoints).toBe(5);
    expect(p.sections[5].checkpoint).toBeNull();
  });
  it('drops headings with no tasks under them', () => {
    expect(p.sections.map((x) => x.title)).not.toContain('Overview');
    expect(p.sections[0].title).toBe('Week 1 (Oct 19 – 23): setup and first endpoints');
  });
  it('runs Oct 19 – Nov 27, Mon–Fri, every task dated', () => {
    expect([s.first, s.last, s.startDate, s.deadline]).toEqual(['2026-10-19', '2026-11-27', '2026-10-19', '2026-11-27']);
    expect(s.dated).toBe(30);
    expect(scheduleLabel(s.schedule)).toBe('Mon–Fri');
    expect(planWarnings(p, s.schedule)).toEqual([]);
  });
  it('takes the name from the first # heading', () => {
    expect(p.name).toBe('Uptime Monitor: 6-week plan');
  });
  it('strips the date from the title, keeps indented lines as details', () => {
    const t = p.sections[0].tasks;
    expect(t[0]).toMatchObject({ date: '2026-10-19', done: false, title: 'Create the repo, the project skeleton and a README with the goal in one paragraph.' });
    expect(t[1].title).toBe('Add a health endpoint that returns `200 OK` and a version string.');
    expect(t[1].details).toBe('• Write one test for it.\n• Run it locally with curl.');
  });
  it('long text: first sentence is the title, the rest details', () => {
    const t = p.sections[0].tasks[3];
    expect(t.title).toBe('`POST /targets` to add a target, with validation of the URL and interval.');
    expect(t.details).toBe('Return the created target with its id so the client can list and delete it later.');
  });
  it('reads the checkpoint', () => {
    expect(p.sections[0].checkpoint).toBe('a recorded curl session showing a target added, listed, checked and deleted.');
  });
});

describe('parsePlanMarkdown rules', () => {
  it('done boxes, * bullets, loose tasks and unreadable lines', () => {
    const p = parsePlanMarkdown('- [x] **Oct 1:** first\n* [ ] second\n- [] broken\n## Later\n- [ ] third', '2026-09-01');
    expect(p.loose.map((t) => [t.title, t.done, t.date])).toEqual([['first', true, '2026-10-01'], ['second', false, null]]);
    expect(p.sections[0].tasks[0].title).toBe('third');
    expect(p.unreadable).toEqual(['- [] broken']);
  });
  it('dates without a year roll into the next year after December', () => {
    const p = parsePlanMarkdown('- [ ] **Dec 30:** a\n- [ ] **Jan 2:** b\n- [ ] **2027-01-04:** c', '2026-12-01');
    expect(allTasks(p).map((t) => t.date)).toEqual(['2026-12-30', '2027-01-02', '2027-01-04']);
  });
  it('a year on the first date sets it for the rest', () => {
    const p = parsePlanMarkdown('- [ ] **19 Oct 2025:** a\n- [ ] **20 Oct:** b', '2026-10-01');
    expect(allTasks(p).map((t) => t.date)).toEqual(['2025-10-19', '2025-10-20']);
  });
  it('ignores code blocks and tables', () => {
    const p = parsePlanMarkdown('```\n- [ ] not a task\n```\n| - [ ] | x |\n- [ ] real', '2026-10-01');
    expect(allTasks(p).map((t) => t.title)).toEqual(['real']);
  });
  it('a plan pasted inside its code fence still reads; code inside a plan is still ignored', () => {
    const p = parsePlanMarkdown('Here is your plan:\n\n```markdown\n# Run a 5K\n## Week 1\n- [ ] **2026-10-21:** Run 1 km\n```\nGood luck!', '2026-10-21');
    expect([p.name, p.sections[0].title, allTasks(p).map((t) => [t.title, t.date])]).toEqual(['Run a 5K', 'Week 1', [['Run 1 km', '2026-10-21']]]);
    expect(allTasks(parsePlanMarkdown('```\n- [ ] not a task\n```\n- [ ] real', '2026-10-01')).map((t) => t.title)).toEqual(['real']);
  });
  it('the AI prompt’s example parses into what it shows, with no warnings', () => {
    const p = parsePlanMarkdown(promptExample('2026-10-21'), '2026-10-21');
    expect(p.name).toBe('Learn Spanish basics');
    expect(p.sections.map((s) => [s.title, s.tasks.length, s.checkpoint])).toEqual([
      ['Week 1: Sounds and greetings', 2, 'Introduce myself out loud without notes'],
      ['Week 2: Present tense', 1, null],
    ]);
    expect(allTasks(p).map((t) => t.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-28']);
    expect(p.sections[0].tasks[0].details).toBe('• 20 minutes with a pronunciation video, then read a word list out loud');
    expect(planWarnings(p, summarize(p, '2026-10-21').schedule)).toEqual([]);
    expect(planPrompt('2026-10-21')).toContain('Today is 2026-10-21.');
    expect(planPrompt('2026-10-21').endsWith('My goal: ')).toBe(true);
  });
  it('warns about missing, unordered, duplicate and off-schedule dates', () => {
    const p = parsePlanMarkdown('- [ ] **Oct 20:** a\n- [ ] **Oct 19:** b\n- [ ] **Oct 19:** c\n- [ ] **Sat Oct 24:** d\n- [ ] e', '2026-10-01');
    const w = planWarnings(p, MON_FRI);
    expect(w).toHaveLength(4);
    expect(w[0]).toContain('1 task has no date');
    expect(w[1]).toContain('earlier than the task before');
    expect(w[2]).toContain('more than one task');
    expect(w[3]).toContain('Saturday');
  });
  it('with no dates: start today, four weeks, Mon–Fri', () => {
    const s = summarize(parsePlanMarkdown('- [ ] a\n- [ ] b', '2026-10-19'), '2026-10-19');
    expect([s.startDate, s.deadline, scheduleLabel(s.schedule)]).toEqual(['2026-10-19', '2026-11-15', 'Mon–Fri']);
  });
});

describe('scheduleFromDates', () => {
  it('weekend dates widen the schedule', () => {
    expect(scheduleLabel(scheduleFromDates(['2026-10-19', '2026-10-24']))).toBe('Mon–Sat');
    expect(scheduleFromDates([])).toEqual(MON_FRI);
  });
});

// ── Queue and pace ─────────────────────────────────────────────────────────

const plan = { startDate: '2026-10-19', deadline: '2026-11-27', schedule: MON_FRI };
const parsed = parsePlanMarkdown(FIXTURE, '2026-10-01');
const day = (iso: string) => iso.slice(0, 10);
function tasksFrom(done: Record<number, string> = {}): PlanTask[] {
  return allTasks(parsed).map((t, i) => ({
    id: `t${i}`, planId: 'p', sectionId: null, order: i, title: t.title, details: t.details, targetDate: t.date,
    doneAt: done[i] ? `${done[i]}T15:00:00.000Z` : null, note: null, createdAt: '', updatedAt: '', deletedAt: null,
  }));
}

describe('computePlan', () => {
  it('Oct 19, nothing done: Monday’s task, on pace, 1 today', () => {
    const r = computePlan(plan, [], tasksFrom(), '2026-10-19', day);
    expect(r.current?.id).toBe('t0');
    expect(planStatusLabel(r)).toBe('On pace');
    expect(planNeedLabel(r)).toBe('1 today');
  });
  it('Wed Oct 21 with only Monday done: Tuesday’s task, 1 behind, 2 today', () => {
    const r = computePlan(plan, [], tasksFrom({ 0: '2026-10-19' }), '2026-10-21', day);
    expect(r.current?.id).toBe('t1');
    expect(planStatusLabel(r)).toBe('1 task behind');
    expect(planNeedLabel(r)).toBe('2 today to get back on pace');
  });
  it('two in one day moves the queue twice and shows ahead', () => {
    const r = computePlan(plan, [], tasksFrom({ 0: '2026-10-19', 1: '2026-10-19' }), '2026-10-19', day);
    expect(r.current?.id).toBe('t2');
    expect(planStatusLabel(r)).toBe('1 task ahead');
    expect(planNeedLabel(r)).toBe('Today’s done');
  });
  it('out of order: the current task is still the first undone one', () => {
    const r = computePlan(plan, [], tasksFrom({ 3: '2026-10-19' }), '2026-10-19', day);
    expect(r.current?.id).toBe('t0');
    expect(r.done).toBe(1);
  });
  it('weekends: nothing due, still behind if Friday was missed', () => {
    const done = Object.fromEntries([0, 1, 2, 3].map((i) => [i, '2026-10-2' + i]));
    const r = computePlan(plan, [], tasksFrom(done), '2026-10-24', day);
    expect(planStatusLabel(r)).toBe('1 task behind');
    expect(r.todayIsPlanDay).toBe(false);
  });
  it('all done: achieved on the last done day', () => {
    const done = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, '2026-11-20']));
    const r = computePlan(plan, [], tasksFrom(done), '2026-11-21', day);
    expect([r.status, r.achievedDate, r.current]).toEqual(['achieved', '2026-11-20', null]);
  });
  it('missed once the deadline passes with tasks left', () => {
    const r = computePlan(plan, [], tasksFrom({ 0: '2026-10-19' }), '2026-11-28', day);
    expect(planStatusLabel(r)).toBe('Missed by 29 tasks');
  });
  it('projects a finish date from the recent rate and flags overload', () => {
    // One task every other weekday for two weeks: half the planned rate.
    const done = { 0: '2026-10-19', 1: '2026-10-21', 2: '2026-10-23', 3: '2026-10-27', 4: '2026-10-29' };
    const r = computePlan(plan, [], tasksFrom(done), '2026-11-02', day);
    expect(r.recentRate).toBeCloseTo(0.5);
    expect(r.projection).toMatchObject({ kind: 'finishes', late: true });
    expect(planStatusLabel(r)).toBe('5 tasks behind');
  });
  it('overloaded when what is left needs more than double the planned rate', () => {
    const r = computePlan(plan, [], tasksFrom(), '2026-11-16', day);
    expect(r.overloaded).toBe(true);
  });
});

describe('plannedDates', () => {
  const t = (id: string, targetDate: string | null) => ({ id, sectionId: null, order: 0, targetDate, doneAt: null, createdAt: '' });
  it('no dates: spread evenly over the schedule, last on the last day', () => {
    const p = { startDate: '2026-10-19', deadline: '2026-10-30', schedule: MON_FRI };
    const d = plannedDates(p, [t('a', null), t('b', null), t('c', null), t('d', null), t('e', null)]);
    expect([...d.values()]).toEqual(['2026-10-20', '2026-10-22', '2026-10-26', '2026-10-28', '2026-10-30']);
  });
  it('mixed: undated tasks fill the days between their dated neighbours', () => {
    const p = { startDate: '2026-10-19', deadline: '2026-10-30', schedule: MON_FRI };
    const d = plannedDates(p, [t('a', '2026-10-19'), t('b', null), t('c', null), t('d', '2026-10-23'), t('e', null)]);
    expect(Object.fromEntries(d)).toEqual({ a: '2026-10-19', b: '2026-10-21', c: '2026-10-22', d: '2026-10-23', e: '2026-10-30' });
  });
  it('an empty plan from scratch gets an even pace line', () => {
    const p = { startDate: '2026-10-19', deadline: '2026-10-23', schedule: MON_FRI };
    const r = computePlan(p, [], [{ ...t('a', null) }, { ...t('b', null) }], '2026-10-22', day);
    expect([...r.planned.values()]).toEqual(['2026-10-21', '2026-10-23']);
    expect(planStatusLabel(r)).toBe('1 task behind');
  });
});

describe('push remaining', () => {
  it('by one scheduled day brings a behind plan back on pace', () => {
    const tasks = tasksFrom();
    const before = computePlan(plan, [], tasks, '2026-10-20', day);
    expect(planStatusLabel(before)).toBe('1 task behind');
    const { dates, deadline } = pushRemaining(plan, tasks, 1, true);
    const pushed = tasks.map((x) => ({ ...x, targetDate: dates.get(x.id) ?? x.targetDate }));
    const after = computePlan({ ...plan, deadline }, [], pushed, '2026-10-20', day);
    expect(planStatusLabel(after)).toBe('On pace');
    expect(dates.get('t4')).toBe('2026-10-26'); // Friday → Monday
    expect(deadline).toBe('2026-11-30');
  });
  it('done tasks keep their dates', () => {
    const { dates } = pushRemaining(plan, tasksFrom({ 0: '2026-10-19' }), 2, false);
    expect(dates.has('t0')).toBe(false);
    expect(addScheduledDays('2026-10-23', 1, MON_FRI)).toBe('2026-10-26');
  });
});

describe('orderTasks', () => {
  it('loose tasks first, then sections in order, then position', () => {
    const sec = [{ id: 's2', order: 2, createdAt: '' }, { id: 's1', order: 1, createdAt: '' }];
    const mk = (id: string, sectionId: string | null, order: number) => ({ id, sectionId, order, targetDate: null, doneAt: null, createdAt: '' });
    expect(orderTasks(sec, [mk('c', 's2', 0), mk('b', 's1', 1), mk('a', 's1', 0), mk('l', null, 5), mk('x', 'gone', 0)]).map((x) => x.id))
      .toEqual(['x', 'l', 'a', 'b', 'c']);
  });
});

describe('planWeek', () => {
  it('tasks done last week, the week before, and how far behind moved', () => {
    // Week of Oct 26: 3 of 5 done; week of Oct 19: all 5.
    const done = { 0: '2026-10-19', 1: '2026-10-20', 2: '2026-10-21', 3: '2026-10-22', 4: '2026-10-23', 5: '2026-10-26', 6: '2026-10-28', 7: '2026-10-30' };
    const w = planWeek(plan, [], tasksFrom(done), '2026-10-26', day);
    expect(w).toEqual({ done: 3, previous: 5, deltaBefore: 0, deltaAfter: -2 });
  });
});

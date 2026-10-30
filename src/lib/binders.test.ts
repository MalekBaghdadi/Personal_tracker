import { describe, expect, it } from 'vitest';
import { BINDERS, binderViews, linkedTo, unlinkTarget, type BinderContext } from './binders';
import { LADDERS } from './achievementCatalog';
import type { Metric } from './types';

const metric = (over: Partial<Metric> & { id: string }): Metric => ({
  name: over.id,
  type: 'duration',
  unit: 'min',
  target: 3600,
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

const ctx = (over: Partial<BinderContext> = {}): BinderContext => ({
  metrics: [],
  applicable: [],
  held: () => false,
  paired: false,
  hasGoals: false,
  ...over,
});
const ids = (c: BinderContext) => binderViews(c).map((v) => v.binder.id);
const view = (c: BinderContext, id: string) => binderViews(c).find((v) => v.binder.id === id)!;

describe('binders', () => {
  it('ten targeted binders, six general ones, every ladder in exactly one', () => {
    expect(BINDERS.filter((b) => b.kind === 'targeted').map((b) => b.id)).toEqual(['study', 'code', 'reading', 'fitness', 'mind', 'creative', 'health', 'sleep', 'wisdom', 'other']);
    expect(BINDERS.filter((b) => b.kind === 'general').map((b) => b.id)).toEqual(['streaks', 'grind', 'goals', 'compete', 'habits', 'secrets']);
    const all = BINDERS.flatMap((b) => b.ladders.map((l) => l.id));
    expect(all.sort()).toEqual(LADDERS.map((l) => l.id).sort());
  });

  it('a metric links to the binder its icon suggests until one is picked', () => {
    const mcat = metric({ id: 'mcat', icon: 'GraduationCap' });
    const gym = metric({ id: 'gym', icon: 'Dumbbell', theme: 'study' });
    expect(linkedTo('study', [mcat, gym]).map((m) => m.id)).toEqual(['mcat', 'gym']);
    expect(linkedTo('fitness', [mcat, gym])).toEqual([]);
  });

  it('archived metrics link to nothing', () => {
    expect(linkedTo('study', [metric({ id: 'old', icon: 'GraduationCap', archivedAt: '2026-10-02T00:00:00.000Z' })])).toEqual([]);
  });

  it('a targeted binder with nothing linked is greyed and goes to the end', () => {
    const mcat = metric({ id: 'mcat', icon: 'GraduationCap' });
    const c = ctx({ metrics: [mcat], applicable: LADDERS.filter((l) => l.theme === 'study' || ['streak', 'notes'].includes(l.kind)) });
    const order = ids(c);
    expect(order.slice(0, 4)).toEqual(['study', 'streaks', 'habits', 'secrets']);
    expect(order.indexOf('fitness')).toBeGreaterThan(order.indexOf('secrets'));
    const fit = view(c, 'fitness');
    expect(fit.active).toBe(false);
    expect(fit.why).toMatch(/No metric linked/);
    // Greyed binders still show every ladder, so you see what you could earn.
    expect(fit.ladders.map((l) => l.id)).toEqual(['fitness.session', 'fitness.hours', 'fitness.days']);
    expect(view(c, 'study').linked.map((m) => m.id)).toEqual(['mcat']);
  });

  it('an active binder shows only ladders that apply, plus any you hold cards from', () => {
    const water = metric({ id: 'water', type: 'count', unit: 'glasses', icon: 'Droplet', timerEnabled: false });
    const reading = metric({ id: 'read', type: 'count', unit: 'pages', icon: 'BookOpen', timerEnabled: false });
    const c = ctx({
      metrics: [water, reading],
      applicable: LADDERS.filter((l) => l.id === 'health.days' || l.id === 'reading.days'),
      held: (l) => l.id === 'reading.session',
    });
    expect(view(c, 'reading').ladders.map((l) => l.id)).toEqual(['reading.session', 'reading.days']);
    expect(view(c, 'health').active).toBe(true);
  });

  it('Compete greys out until paired, Goals & plans until there is a goal or plan', () => {
    const all = LADDERS;
    expect(view(ctx({ applicable: all }), 'compete').active).toBe(false);
    expect(view(ctx({ applicable: all, paired: true }), 'compete').active).toBe(true);
    expect(view(ctx({ applicable: all }), 'goals').active).toBe(false);
    expect(view(ctx({ applicable: all, hasGoals: true }), 'goals').active).toBe(true);
    expect(view(ctx({ applicable: all }), 'goals').why).toMatch(/deadline goal or plan/);
  });

  it('other general binders grey out only when nothing in them applies; Secrets never does', () => {
    expect(view(ctx(), 'streaks').active).toBe(false);
    expect(view(ctx(), 'grind').why).toMatch(/at-least target/);
    expect(view(ctx(), 'secrets').active).toBe(true);
  });

  it('unticking a metric hands it back to its icon’s binder, or Other when that’s the one it leaves', () => {
    expect(unlinkTarget({ icon: 'Dumbbell' }, 'study')).toBeNull();
    expect(unlinkTarget({ icon: 'GraduationCap' }, 'study')).toBe('other');
    expect(unlinkTarget({ icon: 'Target' }, 'other')).toBe('other');
  });
});

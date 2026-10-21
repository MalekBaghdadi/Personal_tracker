import { GROUPS, LADDERS, type Group, type Ladder } from './achievementCatalog';
import { THEMES, themeFromIcon, themeOf } from './themes';
import type { Metric, ThemeId } from './types';

/*
 * The binders on the profile, one deck of cards each. Targeted binders (the
 * nine themes) count only the metrics linked to them. A metric's link is its
 * `theme`, made for it from its icon until someone changes it, so every
 * metric sits in exactly one targeted binder (Other catches the rest).
 * General binders (Streaks, The grind, Goals & plans, Compete, Odd hours &
 * notes, Secrets) count everything and are never linked. A binder that can't
 * earn anything yet is greyed out and goes to the end. Pure module.
 */

export type BinderId = ThemeId | Exclude<Group, 'theme'> | 'secrets';

export interface Binder {
  id: BinderId;
  kind: 'targeted' | 'general';
  title: string;
  /** Every ladder in it, in catalogue order. Secrets has none: it shows the secret cards. */
  ladders: Ladder[];
}

export const BINDERS: Binder[] = [
  ...THEMES.map((t): Binder => ({ id: t.id, kind: 'targeted', title: t.label, ladders: LADDERS.filter((l) => l.theme === t.id) })),
  ...GROUPS.map((g): Binder => ({ id: g.id, kind: 'general', title: g.title, ladders: LADDERS.filter((l) => !l.theme && l.group === g.id) })),
  { id: 'secrets', kind: 'general', title: 'Secrets', ladders: [] },
];

export const binderById = new Map(BINDERS.map((b) => [b.id, b]));

export interface BinderContext {
  /** Active (not archived) metrics. */
  metrics: Metric[];
  /** Ladders that apply to this account (Evaluation.ladders). */
  applicable: Ladder[];
  /** Whether any card of the ladder is collected or waiting to be. */
  held: (l: Ladder) => boolean;
  paired: boolean;
  /** Any deadline goal or plan, finished or not. */
  hasGoals: boolean;
}

export interface BinderView {
  binder: Binder;
  /** Can earn cards right now; the rest are greyed out. */
  active: boolean;
  /** Targeted binders: the metrics linked to it. */
  linked: Metric[];
  /** The ladders to show: active, those that apply (plus any you hold cards from); greyed, all of them. */
  ladders: Ladder[];
  /** Greyed: what would start it. */
  why: string | null;
}

/** The metrics linked to a targeted binder. */
export const linkedTo = (id: BinderId, metrics: Metric[]): Metric[] => metrics.filter((m) => !m.archivedAt && themeOf(m) === id);

/**
 * Where a metric goes when it's unticked from a binder: back to the binder its
 * icon suggests (null: linked automatically again), or Other when that's the
 * one it's leaving.
 */
export function unlinkTarget(m: Pick<Metric, 'icon'>, from: ThemeId): ThemeId | null {
  return themeFromIcon(m.icon) !== from ? null : 'other';
}

const WHY: Record<string, string> = {
  targeted: 'No metric linked yet. Link one and its history counts straight away.',
  streaks: 'Give a metric a daily target to start earning these.',
  grind: 'Track something in time, or with an at-least target, to start earning these.',
  goals: 'Make a deadline goal or plan to start earning these.',
  compete: 'Pair up with someone in Compete to start earning these.',
  habits: 'Time something with the timer to start earning these.',
};

/** Every binder with what it shows: active ones first (in catalogue order), then the greyed ones. */
export function binderViews(ctx: BinderContext): BinderView[] {
  const views = BINDERS.map((b): BinderView => {
    const linked = b.kind === 'targeted' ? linkedTo(b.id, ctx.metrics) : [];
    const earning = b.ladders.filter((l) => ctx.applicable.includes(l));
    let active: boolean;
    if (b.id === 'secrets') active = true;
    else if (b.kind === 'targeted') active = linked.length > 0;
    else if (b.id === 'compete') active = ctx.paired;
    else if (b.id === 'goals') active = ctx.hasGoals;
    else active = earning.length > 0;
    const shown = b.ladders.filter((l) => ctx.applicable.includes(l) || ctx.held(l));
    return {
      binder: b,
      active,
      linked,
      ladders: active && shown.length ? shown : b.ladders,
      why: active ? null : WHY[b.kind === 'targeted' ? 'targeted' : b.id] ?? null,
    };
  });
  return [...views.filter((v) => v.active), ...views.filter((v) => !v.active)];
}

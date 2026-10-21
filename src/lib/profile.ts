import { TIERS, achievementById, levelFor, rankFor, xpForLevel, type AchievementDef } from './achievementCatalog';
import { xpOf } from './achievements';
import type { CollectedAchievement } from './types';

/*
 * The profile: level, rank and title from collected cards. Shared with the
 * Compete partner only when the user switches it on, as a small summary
 * (pairs/{id}/profiles/{uid}); never their data, only cards and counts.
 */

export const MAX_PINNED = 3;

export interface SharedCard {
  id: string;
  name: string;
  tier: number;
  art: string[];
  flavor: string;
  on: string;
  detail: string | null;
}

export interface SharedProfile {
  uid: string;
  name: string;
  level: number;
  xp: number;
  rank: string;
  rankArt: string;
  title: SharedCard | null;
  pinned: SharedCard[];
  /** Collected cards per tier, Bronze first. */
  tiers: number[];
  collected: number;
  /** Cards that apply to them, collected or not. */
  total: number;
  /** Newest first. */
  recent: SharedCard[];
  updatedAt: string;
}

export interface ProfileSummary {
  xp: number;
  level: number;
  rank: { name: string; art: string };
  /** XP at the start of this level and of the next. */
  levelFrom: number;
  levelTo: number;
  /** The worn card, if it's collected. */
  title: AchievementDef | null;
  pinned: AchievementDef[];
  tiers: number[];
}

export function summarize(collected: Map<string, CollectedAchievement>, titleId: string | null | undefined, pinnedIds: string[] | undefined): ProfileSummary {
  const xp = xpOf(collected.keys());
  const level = levelFor(xp);
  const tiers = TIERS.map(() => 0);
  for (const id of collected.keys()) {
    const def = achievementById.get(id);
    if (def) tiers[def.tier]++;
  }
  const title = titleId && collected.has(titleId) ? achievementById.get(titleId) ?? null : null;
  const pinned = (pinnedIds ?? [])
    .filter((id) => collected.has(id))
    .map((id) => achievementById.get(id))
    .filter((d): d is AchievementDef => !!d)
    .slice(0, MAX_PINNED);
  const r = rankFor(level);
  return { xp, level, rank: { name: r.name, art: r.art }, levelFrom: xpForLevel(level), levelTo: xpForLevel(level + 1), title, pinned, tiers };
}

function card(def: AchievementDef, c: CollectedAchievement | undefined): SharedCard {
  return { id: def.id, name: def.name, tier: def.tier, art: [...def.art].filter((a): a is string => !!a), flavor: def.flavor, on: c?.on ?? '', detail: c?.detail ?? null };
}

/** What the partner sees. Everything in it is about cards; nothing about entries or metrics beyond the card's own line. */
export function sharedProfile(
  uid: string,
  name: string,
  collected: Map<string, CollectedAchievement>,
  summary: ProfileSummary,
  total: number,
  now: string,
): SharedProfile {
  const recent = [...collected.values()]
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || b.on.localeCompare(a.on))
    .slice(0, 6)
    .map((c) => achievementById.get(c.id))
    .filter((d): d is AchievementDef => !!d)
    .map((d) => card(d, collected.get(d.id)));
  return {
    uid,
    name,
    level: summary.level,
    xp: summary.xp,
    rank: summary.rank.name,
    rankArt: summary.rank.art,
    title: summary.title ? card(summary.title, collected.get(summary.title.id)) : null,
    pinned: summary.pinned.map((d) => card(d, collected.get(d.id))),
    tiers: summary.tiers,
    collected: collected.size,
    total,
    recent,
    updatedAt: now,
  };
}

/** Same profile apart from when it was written. */
export function sameProfile(a: SharedProfile | null | undefined, b: SharedProfile | null | undefined): boolean {
  if (!a || !b) return a === b;
  const strip = ({ updatedAt: _u, ...rest }: SharedProfile) => JSON.stringify(rest);
  return strip(a) === strip(b);
}

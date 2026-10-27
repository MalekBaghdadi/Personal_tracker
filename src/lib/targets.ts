import { addDays } from './dates';
import type { Metric, TargetSpec, TargetVersion } from './types';

type WithTargets = Pick<Metric, 'target' | 'targetDirection'> & Partial<Pick<Metric, 'targetMin' | 'targetHistory' | 'targetFrom'>>;

const specOf = (m: TargetSpec): TargetSpec => ({ target: m.target, targetDirection: m.targetDirection, targetMin: m.targetMin ?? null });

const same = (a: TargetSpec, b: TargetSpec): boolean =>
  a.target === b.target && a.targetDirection === b.targetDirection && (a.targetMin ?? null) === (b.targetMin ?? null);

/** Every target the metric has had, oldest first; the last one is the current target. */
export function targetVersions(m: WithTargets): TargetVersion[] {
  return [...(m.targetHistory ?? []), { from: m.targetFrom ?? null, ...specOf(m) }];
}

/**
 * The target in force on a day. Past days keep the target they had, so
 * changing a target never rewrites what was met or missed before it. Absent
 * history: the current target, for every day.
 */
export function targetOn(m: WithTargets, date: string): TargetSpec {
  const history = m.targetHistory;
  if (!history?.length || !m.targetFrom || date >= m.targetFrom) return m;
  let found = history[0];
  for (const v of history) if (v.from == null || v.from <= date) found = v;
  return found;
}

/**
 * Change a metric's target from `from` on, leaving earlier days with the
 * target they had. Versions starting on or after `from` are replaced. If
 * `from` is on or before `firstDay` (the metric's first entry or creation)
 * there's nothing earlier to keep, so the new target simply applies to all.
 * Returns the fields to set on the metric.
 */
export function changeTarget(
  m: WithTargets,
  next: TargetSpec,
  from: string,
  firstDay: string,
): Pick<Metric, 'target' | 'targetDirection' | 'targetMin' | 'targetHistory' | 'targetFrom'> {
  const kept = from <= firstDay ? [] : targetVersions(m).filter((v) => v.from == null || v.from < from);
  const last = kept[kept.length - 1];
  const versions: TargetVersion[] = last && same(last, next) ? kept : [...kept, { from: kept.length ? from : null, ...specOf(next) }];
  const current = versions[versions.length - 1];
  return {
    target: current.target,
    targetDirection: current.targetDirection,
    targetMin: current.targetMin ?? null,
    targetHistory: versions.slice(0, -1),
    targetFrom: current.from,
  };
}

/** The periods of the metric's targets, oldest first: `to` is the last day, null for the current one. */
export function targetPeriods(m: WithTargets): Array<TargetSpec & { from: string | null; to: string | null }> {
  const versions = targetVersions(m);
  return versions.map((v, i) => ({ ...v, to: i + 1 < versions.length ? addDays(versions[i + 1].from!, -1) : null }));
}

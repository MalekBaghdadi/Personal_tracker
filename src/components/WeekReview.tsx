import { useMemo } from 'react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate } from '../lib/dates';
import { formatValue } from '../lib/format';
import { reviewWeek, weekStartOf, type MetricWeek } from '../lib/review';
import { computeGoal } from '../lib/goals';
import { fmtGoal } from './Goals';

/** Last week at a glance, at the top of Stats. */
export function WeekReviewCard() {
  const { metrics, dayStats, goals, entries, settings, today, dayOf } = useData();
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const thisWeek = weekStartOf(today, weekStartsOn);
  const lastWeek = addDays(thisWeek, -7);

  const review = useMemo(() => {
    // Like Stats: a metric counts from its creation or its earliest entry, if backfilled.
    const createdOn = new Map(
      metrics.map((m) => {
        let first = dayOf(m.createdAt);
        for (const d of dayStats.get(m.id)?.keys() ?? []) if (d < first) first = d;
        return [m.id, first];
      }),
    );
    return reviewWeek(lastWeek, metrics, dayStats, goals, createdOn);
  }, [lastWeek, metrics, dayStats, goals, dayOf]);

  if (metrics.length === 0) return null;
  const range = `${formatLocalDate(review.start, 'd MMM')} – ${formatLocalDate(review.end, 'd MMM')}`;

  return (
    <section aria-label="Last week" className="rounded-xl border border-line bg-s1 px-4 pt-3 pb-3.5">
      <h2 className="text-[15px] font-medium">
        Last week <span className="font-normal text-ink-3">· {range}</span>
      </h2>
      {!review.any && <p className="mt-1.5 text-[13px] text-ink-3">Nothing was logged last week.</p>}

      {review.any && (
        <ul className="mt-1 divide-y divide-line">
          {review.metrics.map((w) => <MetricLine key={w.metric.id} w={w} />)}
        </ul>
      )}

      {review.any && review.goals.length > 0 && (
        <ul className="mt-2 border-t border-line pt-2.5 text-[13px] text-ink-2">
          {review.goals.map(({ goal, gained }) => {
            const metric = metrics.find((m) => m.id === goal.metricId)!;
            const done = computeGoal(goal, entries, today).done;
            return (
              <li key={goal.id} className="py-0.5">
                <span className="font-medium text-ink">{goal.name}</span>: +{fmtGoal(metric, gained)}, now {fmtGoal(metric, done)} of {fmtGoal(metric, goal.targetTotal)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MetricLine({ w }: { w: MetricWeek }) {
  const hue = useHue(w.metric.color);
  // A ceiling's weekly total means little; its average logged day is what matters.
  const ceiling = w.metric.targetDirection === 'at_most';
  const main = ceiling && w.loggedDays > 0 ? `${formatValue(w.metric, Math.round(w.total / w.loggedDays))} a day` : formatValue(w.metric, w.total);
  const details = [
    w.hits !== null && w.scheduled ? `Target met ${w.hits} of ${w.scheduled} days` : null,
    w.best ? `Best ${formatLocalDate(w.best.date, 'EEE')}, ${formatValue(w.metric, w.best.total)}` : null,
    ceiling ? `Logged ${w.loggedDays} of 7 days` : `Week before ${formatValue(w.metric, w.previousTotal)}`,
  ].filter(Boolean);
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: hue }} />
          <span className="truncate">{w.metric.name}</span>
        </span>
        <span className={w.total === 0 ? 'text-[15px] text-ink-3' : 'text-[15px] font-medium'}>{main}</span>
      </div>
      <p className="mt-0.5 pl-4 text-[12px] text-ink-3">{details.join(' · ')}</p>
    </li>
  );
}

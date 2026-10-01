import { useState } from 'react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { saveMetric, saveSettings } from '../lib/repo';
import { nowIso } from '../lib/dates';
import { iconFor } from '../lib/icons';
import { Button, DayPicker } from '../components/ui';
import { CountInput, DurationInput, parseCount, parseDuration, splitDuration } from '../components/inputs';
import type { Metric } from '../lib/types';

interface Draft {
  hours: string;
  minutes: string;
  count: string;
  days: number[];
}

/**
 * First run: ask for real targets. Inputs start empty on purpose — the seeded
 * metrics have no targets, and nothing here should read as a recommendation.
 */
export function Onboarding() {
  const { uid, metrics, settings, tz } = useData();
  const active = metrics.filter((m) => !m.archivedAt);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      active.map((m) => {
        // Seeded metrics have no target, so these start empty; any target set
        // elsewhere in the meantime is kept rather than wiped.
        const dur = m.type === 'duration' && m.target != null ? splitDuration(m.target) : { hours: '', minutes: '' };
        return [m.id, {
          ...dur,
          count: m.type === 'count' && m.target != null ? String(m.target) : '',
          days: m.schedule.kind === 'days_of_week' ? m.schedule.days : [],
        }];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const finish = (applyTargets: boolean) => {
    if (applyTargets) {
      for (const m of active) {
        const d = drafts[m.id];
        if (!d) continue;
        if (m.schedule.kind === 'days_of_week' && d.days.length === 0) {
          setError(`Pick at least one day for ${m.name}.`);
          return;
        }
      }
      for (const m of active) {
        const d = drafts[m.id];
        if (!d) continue;
        let target: number | null = null;
        if (m.type === 'duration' && (d.hours || d.minutes)) target = parseDuration(d.hours, d.minutes);
        if (m.type === 'count' && d.count) target = parseCount(d.count);
        if (target !== null && !(target > 0)) {
          setError(`${m.name}: enter a value above zero, or leave it blank.`);
          return;
        }
        const schedule = m.schedule.kind === 'days_of_week' ? { kind: 'days_of_week' as const, days: d.days } : m.schedule;
        saveMetric(uid, { ...m, target, schedule });
      }
    }
    saveSettings(uid, { onboardedAt: nowIso(), timezone: tz });
  };

  return (
    <main className="safe-top mx-auto max-w-lg px-5 pt-8 pb-16">
      <h1 className="text-[24px] font-semibold tracking-tight">Set your targets</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        One number a day for each. Leave any blank to track without a target. You can change all of this later under Metrics.
      </p>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {active.map((m) => (
          <TargetRow key={m.id} metric={m} draft={drafts[m.id]} onChange={(p) => update(m.id, p)} weekStartsOn={settings?.weekStartsOn ?? 1} />
        ))}
      </ul>

      <p className="mt-4 text-[13px] text-ink-3">Days are counted in {tz.replace(/_/g, ' ')} time. Change it in Settings if that’s wrong.</p>
      {error && <p role="alert" className="mt-3 text-[14px] text-danger">{error}</p>}

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="primary" onClick={() => finish(true)}>Start logging</Button>
        <Button variant="ghost" onClick={() => finish(false)}>Skip for now</Button>
      </div>
    </main>
  );
}

function TargetRow({
  metric,
  draft,
  onChange,
  weekStartsOn,
}: {
  metric: Metric;
  draft: Draft | undefined;
  onChange: (p: Partial<Draft>) => void;
  weekStartsOn: 0 | 1;
}) {
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);
  if (!draft) return null;
  const ceiling = metric.targetDirection === 'at_most';
  return (
    <li className="py-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={17} style={{ color: hue }} aria-hidden />
        <span className="text-[15px] font-medium">{metric.name}</span>
        <span className="text-[13px] text-ink-3">{ceiling ? 'at most, per day' : 'at least, per day'}</span>
      </div>
      {metric.type === 'duration' ? (
        <DurationInput idPrefix={`ob-${metric.id}`} hours={draft.hours} minutes={draft.minutes} onHours={(v) => onChange({ hours: v })} onMinutes={(v) => onChange({ minutes: v })} />
      ) : (
        <CountInput id={`ob-${metric.id}`} value={draft.count} onChange={(v) => onChange({ count: v })} unit={metric.unit} />
      )}
      {metric.schedule.kind === 'days_of_week' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] text-ink-2">Which days?</p>
          <DayPicker days={draft.days} onChange={(days) => onChange({ days })} weekStartsOn={weekStartsOn} />
        </div>
      )}
    </li>
  );
}

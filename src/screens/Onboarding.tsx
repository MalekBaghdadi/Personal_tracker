import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { saveMetric, saveSettings } from '../lib/repo';
import { SUGGESTIONS, customSeed, finishSetup, type Seed } from '../lib/seed';
import { nowIso } from '../lib/dates';
import { iconFor } from '../lib/icons';
import { PALETTE } from '../lib/palette';
import { Button, DayPicker, FieldError, Label, Segmented, WEEKDAYS, cx, inputClass } from '../components/ui';
import { CountInput, DurationInput, parseCount, parseDuration, splitDuration } from '../components/inputs';
import type { MetricType } from '../lib/types';

interface Draft {
  hours: string;
  minutes: string;
  count: string;
  days: number[];
}

/** What the targets step needs from a metric, saved or not yet. */
type Row = Seed & { key: string; color: string; target: number | null };

/**
 * First run. A new account has no metrics: the user picks what to track, then
 * sets targets. An account that already has metrics (seeded by an older
 * version) goes straight to targets.
 */
export function Onboarding() {
  const { uid, metrics, tz } = useData();
  const active = metrics.filter((m) => !m.archivedAt);
  const [picked, setPicked] = useState<Seed[]>([]);
  const [step, setStep] = useState<'pick' | 'targets'>('pick');
  // The batch's metrics can reach the listeners before its onboardedAt does;
  // don't flash the existing-metrics path in between.
  const [done, setDone] = useState(false);

  if (done) return <div className="min-h-dvh bg-bg" />;

  if (active.length > 0) {
    const rows: Row[] = active.map((m) => ({ ...m, key: m.id }));
    return (
      <Targets
        key={rows.map((r) => r.key).join(',')}
        rows={rows}
        onFinish={(result) => {
          if (result) {
            for (const m of active) {
              const r = result.find((x) => x.key === m.id);
              if (r) saveMetric(uid, { ...m, target: r.target, schedule: r.schedule });
            }
          }
          saveSettings(uid, { onboardedAt: nowIso(), timezone: tz });
        }}
      />
    );
  }

  const finish = (rows: Row[]) => {
    setDone(true);
    finishSetup(uid, rows, tz);
  };

  if (step === 'pick') {
    return (
      <Pick
        initial={picked}
        onNext={(p) => {
          setPicked(p);
          setStep('targets');
        }}
        onSkip={() => finish([])}
      />
    );
  }

  const rows: Row[] = picked.map((s, i) => ({ ...s, key: `${i}-${s.name}`, color: PALETTE[i % PALETTE.length].dark, target: null }));
  return (
    <Targets
      rows={rows}
      onBack={() => setStep('pick')}
      onFinish={(result) => finish(result ?? rows)}
    />
  );
}

// ── Step 1: what to track ──────────────────────────────────────────────────

function describe(s: Seed): string {
  const per = s.targetDirection === 'at_most' ? 'at most a day' : 'daily';
  const kind = s.type === 'duration' ? 'time' : s.unit;
  const when = s.schedule.kind === 'days_of_week' ? s.schedule.days.map((d) => WEEKDAYS[d]).join(', ') : per;
  return `${kind} · ${when}`;
}

function Pick({ initial, onNext, onSkip }: { initial: Seed[]; onNext: (picks: Seed[]) => void; onSkip: () => void }) {
  // Coming Back from targets keeps what was picked.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial.filter((s) => SUGGESTIONS.includes(s)).map((s) => s.name)));
  const [custom, setCustom] = useState<Seed[]>(() => initial.filter((s) => !SUGGESTIONS.includes(s)));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<MetricType>('duration');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (n: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const taken = (n: string) =>
    [...SUGGESTIONS, ...custom].some((s) => s.name.toLowerCase() === n.toLowerCase());

  const addCustom = () => {
    const n = name.trim();
    if (!n) return setError('Give it a name.');
    if (n.length > 40) return setError('Keep the name under 40 characters.');
    const match = SUGGESTIONS.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (match) {
      setChosen((prev) => new Set(prev).add(match.name));
    } else if (taken(n)) {
      return setError('You already added that one.');
    } else {
      setCustom((c) => [...c, customSeed(n, type, unit.trim())]);
    }
    setName('');
    setUnit('');
    setError(null);
    setAdding(false);
  };

  const picks = [...SUGGESTIONS.filter((s) => chosen.has(s.name)), ...custom];

  return (
    <main className="safe-top mx-auto max-w-lg px-5 pt-8 pb-16">
      <h1 className="text-[24px] font-semibold tracking-tight">What do you want to track?</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        Pick any to start with. You can add, change or remove them later under Metrics.
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2" data-testid="suggestions">
        {SUGGESTIONS.map((s, i) => (
          <SuggestionCard key={s.name} seed={s} color={PALETTE[i % PALETTE.length].dark} on={chosen.has(s.name)} onToggle={() => toggle(s.name)} />
        ))}
      </ul>

      {custom.length > 0 && (
        <>
          <h2 className="mt-6 text-[13px] font-medium text-ink-2">Your own</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {custom.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{s.name}</span>
                  <span className="block text-[13px] text-ink-3">{describe(s)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => setCustom((c) => c.filter((x) => x !== s))}
                  className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-s2"
                >
                  <X size={17} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {adding ? (
        <div className="mt-6 rounded-xl border border-line p-4">
          <Label htmlFor="ob-name">Name</Label>
          <input
            id="ob-name"
            className={inputClass}
            value={name}
            autoFocus
            maxLength={40}
            placeholder="e.g. Piano"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          />
          <div className="mt-3">
            <Segmented
              label="Kind"
              value={type}
              onChange={setType}
              options={[{ value: 'duration', label: 'Time' }, { value: 'count', label: 'Count' }]}
            />
          </div>
          {type === 'count' && (
            <div className="mt-3">
              <Label htmlFor="ob-unit">Unit</Label>
              <input id="ob-unit" className={inputClass} value={unit} maxLength={16} placeholder="e.g. pages" onChange={(e) => setUnit(e.target.value)} />
            </div>
          )}
          {error && <FieldError>{error}</FieldError>}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={addCustom}>Add</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 flex items-center gap-2 py-2 text-[15px] font-medium text-ink"
        >
          <Plus size={18} aria-hidden /> Add your own
        </button>
      )}

      <div className="mt-8 flex flex-col gap-2">
        <Button variant="primary" disabled={picks.length === 0} onClick={() => onNext(picks)}>
          {picks.length === 0 ? 'Pick at least one' : `Next · ${picks.length} picked`}
        </Button>
        <Button variant="ghost" onClick={onSkip}>Start with nothing</Button>
      </div>
    </main>
  );
}

function SuggestionCard({ seed, color, on, onToggle }: { seed: Seed; color: string; on: boolean; onToggle: () => void }) {
  const hue = useHue(color);
  const Icon = iconFor(seed.icon);
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cx(
          'press flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
          on ? 'border-ink bg-s2' : 'border-line hover:bg-s1',
        )}
      >
        <Icon size={20} style={{ color: hue }} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{seed.name}</span>
          <span className="block truncate text-[13px] text-ink-3">{describe(seed)}</span>
        </span>
        <span
          className={cx('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-ink bg-ink text-bg' : 'border-ink-3')}
          aria-hidden
        >
          {on && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
    </li>
  );
}

// ── Step 2: targets ────────────────────────────────────────────────────────

/**
 * Inputs start empty on purpose: nothing here should read as a recommendation.
 * onFinish gets the rows with targets applied, or null for "Skip for now".
 */
function Targets({
  rows,
  onFinish,
  onBack,
}: {
  rows: Row[];
  onFinish: (result: Row[] | null) => void;
  onBack?: () => void;
}) {
  const { settings, tz } = useData();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        // Any target already set elsewhere is kept rather than wiped.
        const dur = r.type === 'duration' && r.target != null ? splitDuration(r.target) : { hours: '', minutes: '' };
        return [r.key, {
          ...dur,
          count: r.type === 'count' && r.target != null ? String(r.target) : '',
          days: r.schedule.kind === 'days_of_week' ? r.schedule.days : [],
        }];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const finish = () => {
    const out: Row[] = [];
    for (const r of rows) {
      const d = drafts[r.key];
      if (r.schedule.kind === 'days_of_week' && d.days.length === 0) {
        setError(`Pick at least one day for ${r.name}.`);
        return;
      }
      let target: number | null = null;
      if (r.type === 'duration' && (d.hours || d.minutes)) target = parseDuration(d.hours, d.minutes);
      if (r.type === 'count' && d.count) target = parseCount(d.count);
      if (target !== null && !(target > 0)) {
        setError(`${r.name}: enter a value above zero, or leave it blank.`);
        return;
      }
      const schedule = r.schedule.kind === 'days_of_week' ? { kind: 'days_of_week' as const, days: d.days } : r.schedule;
      out.push({ ...r, target, schedule });
    }
    onFinish(out);
  };

  return (
    <main className="safe-top mx-auto max-w-lg px-5 pt-8 pb-16">
      <h1 className="text-[24px] font-semibold tracking-tight">Set your targets</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        One number a day for each. Leave any blank to track without a target. You can change all of this later under Metrics.
      </p>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <TargetRow key={r.key} row={r} draft={drafts[r.key]} onChange={(p) => update(r.key, p)} weekStartsOn={settings?.weekStartsOn ?? 1} />
        ))}
      </ul>

      <p className="mt-4 text-[13px] text-ink-3">Days are counted in {tz.replace(/_/g, ' ')} time. Change it in Settings if that’s wrong.</p>
      {error && <p role="alert" className="mt-3 text-[14px] text-danger">{error}</p>}

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="primary" onClick={finish}>Start logging</Button>
        <Button variant="ghost" onClick={() => onFinish(null)}>Skip targets for now</Button>
        {onBack && <Button variant="ghost" onClick={onBack}>Back</Button>}
      </div>
    </main>
  );
}

function TargetRow({
  row,
  draft,
  onChange,
  weekStartsOn,
}: {
  row: Row;
  draft: Draft | undefined;
  onChange: (p: Partial<Draft>) => void;
  weekStartsOn: 0 | 1;
}) {
  const hue = useHue(row.color);
  const Icon = iconFor(row.icon);
  if (!draft) return null;
  const ceiling = row.targetDirection === 'at_most';
  return (
    <li className="py-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={17} style={{ color: hue }} aria-hidden />
        <span className="text-[15px] font-medium">{row.name}</span>
        <span className="text-[13px] text-ink-3">{ceiling ? 'at most, per day' : 'at least, per day'}</span>
      </div>
      {row.type === 'duration' ? (
        <DurationInput idPrefix={`ob-${row.key}`} hours={draft.hours} minutes={draft.minutes} onHours={(v) => onChange({ hours: v })} onMinutes={(v) => onChange({ minutes: v })} />
      ) : (
        <CountInput id={`ob-${row.key}`} value={draft.count} onChange={(v) => onChange({ count: v })} unit={row.unit} />
      )}
      {row.schedule.kind === 'days_of_week' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] text-ink-2">Which days?</p>
          <DayPicker days={draft.days} onChange={(days) => onChange({ days })} weekStartsOn={weekStartsOn} />
        </div>
      )}
    </li>
  );
}

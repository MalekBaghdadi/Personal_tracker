import { useMemo, useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { computeGoal, countPaceDays, nextDayRequirement, validateGoal, type GoalResult } from '../lib/goals';
import { saveGoal, setGoalArchived } from '../lib/repo';
import { uuid } from '../lib/device';
import { addDays, formatLocalDate, nowIso } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { Button, DayPicker, FieldError, Label, Segmented, Sheet, cx, inputClass, useToast } from './ui';
import type { Goal, Metric, Schedule } from '../lib/types';

// ── Display helpers (round only here; everything upstream is base units) ──

/** Durations to the minute, never decimal hours; counts as integers with the unit. */
export function fmtGoal(metric: Pick<Metric, 'type' | 'unit'>, v: number, round: 'nearest' | 'up' = 'nearest'): string {
  const r = round === 'up' ? Math.ceil : Math.round;
  if (metric.type === 'duration') return formatDuration(r(Math.max(0, v) / 60) * 60);
  return `${formatNumber(r(Math.max(0, v)))} ${metric.unit}`;
}

export function fmtDay(d: string, today: string): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return formatLocalDate(d, d.slice(0, 4) === today.slice(0, 4) ? 'd MMM' : 'd MMM yyyy');
}

export function daysLeftLabel(r: GoalResult): string {
  if (r.daysLeft === 0) return 'Deadline passed';
  if (r.daysLeft === 1) return 'Due today';
  return `${r.daysLeft} days left`;
}

/** "2h 10m behind", "On track", "45m ahead", "Achieved", … */
export function statusLabel(goal: Goal, metric: Metric, r: GoalResult, today: string): string {
  switch (r.status) {
    case 'achieved':
      if (!r.achievedDate) return 'Achieved';
      return r.achievedDate === today ? 'Achieved today' : `Achieved on ${fmtDay(r.achievedDate, today)}`;
    case 'missed':
      return `Missed by ${fmtGoal(metric, r.remaining)}`;
    case 'not_started':
      return `Starts ${fmtDay(goal.startDate, today).replace('Tomorrow', 'tomorrow')}`;
    case 'no_days_left':
      return 'No work days left';
    case 'ahead':
      return `${fmtGoal(metric, r.delta)} ahead`;
    case 'behind':
      return `${fmtGoal(metric, -r.delta)} behind`;
    default:
      return 'On track';
  }
}

/** "Today: 50m of 1h 35m" / "Today's pace done" / "Next: Monday, 1h 35m". */
export function todayNeedLabel(goal: Goal, metric: Metric, r: GoalResult, today: string): string | null {
  if (r.status === 'achieved' || r.status === 'missed' || r.status === 'no_days_left') return null;
  if (r.todayIsPaceDay && r.requiredPerDay !== null) {
    if (r.neededToday <= 0) return 'Today’s pace done';
    return `Today: ${fmtGoal(metric, r.doneToday)} of ${fmtGoal(metric, r.requiredPerDay, 'up')}`;
  }
  if (!r.nextPaceDay) return null;
  const req = nextDayRequirement(r, today, goal);
  const when = r.nextPaceDay === addDays(today, 1) ? 'Tomorrow' : formatLocalDate(r.nextPaceDay, r.nextPaceDay <= addDays(today, 6) ? 'EEEE' : 'EEE d MMM');
  return `Next: ${when}${req !== null ? `, ${fmtGoal(metric, req, 'up')}` : ''}`;
}

export function useGoalResult(goal: Goal): GoalResult {
  const { entries, today } = useData();
  return useMemo(() => computeGoal(goal, entries, today), [goal, entries, today]);
}

// ── Progress bar with the expected-position marker ─────────────────────────

export function GoalBar({ goal, r, color, tall }: { goal: Goal; r: GoalResult; color: string; tall?: boolean }) {
  const frac = (v: number) => Math.max(0, Math.min(1, goal.targetTotal > 0 ? v / goal.targetTotal : 0));
  const showMarker = r.status !== 'achieved' && r.status !== 'missed' && r.status !== 'not_started';
  return (
    <div className={cx('relative', tall ? 'h-2.5' : 'h-1.5')} role="presentation">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-s3">
        <div className="h-full rounded-full" style={{ width: `${frac(r.done) * 100}%`, background: color }} />
      </div>
      {/* The marker: where steady pace would have you by now. Bar past it = ahead. */}
      {showMarker && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${frac(r.expectedByNow) * 100}%` }}
          title="Where steady pace would have you by now"
        />
      )}
    </div>
  );
}

// ── Today card ─────────────────────────────────────────────────────────────

export function GoalCard({ goal }: { goal: Goal }) {
  const { metricById, today } = useData();
  const metric = metricById.get(goal.metricId)!;
  const r = useGoalResult(goal);
  const hue = useHue(metric.color);
  const need = todayNeedLabel(goal, metric, r, today);
  const status = statusLabel(goal, metric, r, today);

  return (
    <a
      href={`#/goals/${goal.id}`}
      className="press block rounded-xl border border-line bg-s1 px-4 py-3.5 hover:bg-s2"
      aria-label={`${goal.name}. ${fmtGoal(metric, r.done)} of ${fmtGoal(metric, goal.targetTotal)}. ${status}. ${need ?? ''}. Open goal`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-[15px] font-medium">{goal.name}</h2>
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-ink-3">
          {r.status === 'achieved' ? 'Done' : daysLeftLabel(r)}
          <ChevronRight size={15} aria-hidden />
        </span>
      </div>
      <p className="mt-1.5">
        <span className="text-[24px] leading-none font-medium tracking-tight">{fmtGoal(metric, r.done)}</span>
        <span className="text-[14px] text-ink-3"> of {fmtGoal(metric, goal.targetTotal)}</span>
      </p>
      <div className="mt-3">
        <GoalBar goal={goal} r={r} color={hue} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
        <span className={cx('font-medium', r.status === 'behind' ? 'text-ink' : 'text-ink-2')}>{status}</span>
        {need && <span className="text-ink-2">{need}</span>}
      </div>
      {r.overloaded && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-2">
          <TriangleAlert size={14} className="shrink-0" aria-hidden />
          The pace needed has doubled. Open the goal to change the deadline or target.
        </p>
      )}
      {metric.archivedAt && <p className="mt-1.5 text-[12px] text-ink-3">{metric.name} is archived. Its entries still count.</p>}
    </a>
  );
}

/** "Goal pace: 1h 35m today" under a metric's daily target. Never touches the streak. */
export function GoalPaceLine({ goal, metric }: { goal: Goal; metric: Metric }) {
  const { today } = useData();
  const r = useGoalResult(goal);
  if (r.status === 'achieved' || r.status === 'missed' || r.status === 'not_started' || r.status === 'no_days_left') return null;
  let text: string;
  if (r.todayIsPaceDay && r.requiredPerDay !== null) {
    text = r.neededToday <= 0 ? 'Goal pace: done today' : `Goal pace: ${fmtGoal(metric, r.requiredPerDay, 'up')} today`;
  } else {
    text = todayNeedLabel(goal, metric, r, today)?.replace(/^Next:/, 'Goal pace: next') ?? '';
  }
  return text ? <p className="mt-0.5 text-[13px] text-ink-3">{text}</p> : null;
}

// ── Create / edit ──────────────────────────────────────────────────────────

export type GoalSheetState =
  | { mode: 'new'; metricId?: string }
  | { mode: 'edit'; goal: Goal; focus?: 'deadline' | 'target' };

export function GoalSheet({ state, onClose, onSwitch }: { state: GoalSheetState | null; onClose: () => void; onSwitch: (s: GoalSheetState) => void }) {
  const title = !state ? '' : state.mode === 'new' ? 'New deadline goal' : 'Edit goal';
  return (
    <Sheet open={state !== null} onClose={onClose} title={title}>
      {state && <GoalForm key={state.mode === 'edit' ? `${state.goal.id}-${state.focus ?? ''}` : `new-${state.metricId ?? ''}`} state={state} onDone={onClose} onSwitch={onSwitch} />}
    </Sheet>
  );
}

export function eligibleMetrics(metrics: Metric[], current?: string): Metric[] {
  return metrics.filter((m) => m.targetDirection === 'at_least' && (!m.archivedAt || m.id === current));
}

function generatedName(metric: Metric | undefined, target: number, deadline: string): string {
  if (!metric) return 'Deadline goal';
  const amount = target > 0 ? fmtGoal(metric, target) : '…';
  const by = deadline ? formatLocalDate(deadline, 'd MMM') : '…';
  return `${metric.name} — ${amount} by ${by}`;
}

/** Hours for durations ("120", "37.5"), whole units for counts. */
function parseAmount(metric: Metric | undefined, raw: string): number {
  const s = raw.trim().replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (!metric || metric.type === 'duration') return Math.round(n * 3600);
  return Number.isInteger(n) ? n : NaN;
}

function amountToText(metric: Metric | undefined, v: number): string {
  if (!v) return '';
  if (!metric || metric.type === 'duration') return String(+(v / 3600).toFixed(2));
  return String(v);
}

function GoalForm({ state, onDone, onSwitch }: { state: GoalSheetState; onDone: () => void; onSwitch: (s: GoalSheetState) => void }) {
  const { uid, metrics, metricById, goals, today, settings } = useData();
  const toast = useToast();
  const existing = state.mode === 'edit' ? state.goal : null;
  const options = eligibleMetrics(metrics, existing?.metricId);

  const [metricId, setMetricId] = useState(existing?.metricId ?? (state.mode === 'new' ? state.metricId : undefined) ?? options[0]?.id ?? '');
  const metric = metricById.get(metricId);
  const [targetText, setTargetText] = useState(amountToText(metric, existing?.targetTotal ?? 0));
  const [priorText, setPriorText] = useState(amountToText(metric, existing?.priorProgress ?? 0));
  const [startDate, setStartDate] = useState(existing?.startDate ?? today);
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [schedule, setSchedule] = useState<Schedule>(existing?.paceSchedule ?? metric?.schedule ?? { kind: 'daily' });
  const [nameEdited, setNameEdited] = useState(existing?.nameEdited ?? false);
  const [customName, setCustomName] = useState(existing?.nameEdited ? existing.name : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmMet, setConfirmMet] = useState(false);

  const target = parseAmount(metric, targetText);
  const prior = parseAmount(metric, priorText);
  const autoName = generatedName(metric, target, deadline);
  const name = nameEdited ? customName : autoName;
  const unitLabel = !metric || metric.type === 'duration' ? 'hours' : metric.unit;

  // One active goal per metric.
  const conflict = goals.find((g) => g.metricId === metricId && !g.archivedAt && g.id !== existing?.id);

  const paceDays = deadline && deadline >= startDate ? countPaceDays({ startDate, deadline, paceSchedule: schedule }, startDate, deadline) : 0;
  const preview = (() => {
    if (!metric || !(target > 0) || !deadline || !(prior >= 0) || paceDays === 0) return null;
    if (target <= prior) return 'That target is already met, so the goal will save as achieved.';
    const per = (target - prior) / paceDays;
    const days = schedule.kind === 'daily' ? `${paceDays} ${paceDays === 1 ? 'day' : 'days'}` : `${paceDays} work ${paceDays === 1 ? 'day' : 'days'}`;
    return `That’s ${fmtGoal(metric, per, 'up')} per day across ${days}.`;
  })();

  const changeMetric = (id: string) => {
    const m = metricById.get(id);
    // Re-express typed amounts in the new metric's units, and follow its schedule.
    setTargetText(amountToText(m, parseAmount(metric, targetText) || 0));
    setPriorText(amountToText(m, parseAmount(metric, priorText) || 0));
    setMetricId(id);
    if (!existing && m) setSchedule(m.schedule);
    setErrors({});
  };

  const save = () => {
    const errs: Record<string, string> = {};
    if (!metric) errs.metric = 'Choose a metric.';
    if (!Number.isFinite(target) || !(target > 0)) errs.target = metric?.type === 'count' ? `Enter a whole number of ${metric.unit} above zero.` : 'Enter a target above zero, in hours.';
    if (!Number.isFinite(prior)) errs.prior = metric?.type === 'count' ? `Enter a whole number of ${metric.unit}, or leave it empty.` : 'Enter hours already done, or leave it empty.';
    if (!deadline) errs.deadline = 'Choose a deadline.';
    if (!startDate) errs.start = 'Choose a start date.';
    if (deadline && startDate) {
      const v = validateGoal({ targetTotal: Math.max(1, target || 1), startDate, deadline, paceSchedule: schedule });
      if (v.deadline) errs.deadline = v.deadline;
      if (v.schedule) errs.schedule = v.schedule;
    }
    if (schedule.kind === 'days_of_week' && schedule.days.length === 0) errs.schedule = 'Pick at least one work day.';
    if (conflict) errs.conflict = 'conflict';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (target <= prior && !confirmMet) {
      setConfirmMet(true);
      return;
    }
    const now = nowIso();
    const goal: Goal = {
      id: existing?.id ?? uuid(),
      metricId,
      name: (nameEdited ? customName.trim() : '') || autoName,
      nameEdited: nameEdited && customName.trim() !== '',
      targetTotal: target,
      priorProgress: prior || 0,
      startDate,
      deadline,
      paceSchedule: schedule,
      archivedAt: existing?.archivedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    saveGoal(uid, goal);
    toast(existing ? 'Goal saved' : 'Goal created');
    onDone();
  };

  if (options.length === 0) {
    return (
      <p className="mt-2 text-[15px] text-ink-2">
        Goals work on metrics with an “at least” target, like study time. Create one under Metrics first.
      </p>
    );
  }

  return (
    <form noValidate className="mt-2 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <Label htmlFor="g-metric">Metric</Label>
        <select id="g-metric" className={inputClass} value={metricId} onChange={(e) => changeMetric(e.target.value)}>
          {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.archivedAt ? ' (archived)' : ''}</option>)}
        </select>
        <FieldError>{errors.metric}</FieldError>
        {conflict && (
          <div role="alert" className="mt-2 rounded-lg bg-s2 p-3 text-[14px] text-ink-2">
            {metric?.name} already has an active goal, “{conflict.name}”. A metric can have one active goal at a time.
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => onSwitch({ mode: 'edit', goal: conflict })}>Edit that goal</Button>
              <Button onClick={() => { setGoalArchived(uid, conflict.id, true); toast(`Archived ${conflict.name}`); }}>Archive it</Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="g-target">Target ({unitLabel})</Label>
          <input id="g-target" className={inputClass} inputMode="decimal" value={targetText} placeholder="120"
            autoFocus={state.mode === 'edit' && state.focus === 'target'}
            onChange={(e) => { setTargetText(e.target.value); setConfirmMet(false); }} />
          <FieldError>{errors.target}</FieldError>
        </div>
        <div>
          <Label htmlFor="g-prior">Already done</Label>
          <input id="g-prior" className={inputClass} inputMode="decimal" value={priorText} placeholder="0"
            onChange={(e) => { setPriorText(e.target.value); setConfirmMet(false); }} />
          <FieldError>{errors.prior}</FieldError>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="g-start">Start date</Label>
          <input id="g-start" type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <FieldError>{errors.start}</FieldError>
        </div>
        <div>
          <Label htmlFor="g-deadline">Deadline</Label>
          <input id="g-deadline" type="date" className={inputClass} value={deadline} min={startDate}
            autoFocus={state.mode === 'edit' && state.focus === 'deadline'}
            onChange={(e) => setDeadline(e.target.value)} />
          <FieldError>{errors.deadline}</FieldError>
        </div>
      </div>
      <p className="-mt-3 text-[13px] text-ink-3">“Already done” is work from before the start date that should count. Work logged on the deadline day counts.</p>

      <div>
        <Label>Work days</Label>
        <Segmented
          label="Work days"
          value={schedule.kind}
          onChange={(k) => setSchedule(k === 'daily' ? { kind: 'daily' } : { kind: 'days_of_week', days: schedule.kind === 'days_of_week' ? schedule.days : [1, 2, 3, 4, 5] })}
          options={[{ value: 'daily', label: 'Every day' }, { value: 'days_of_week', label: 'Some days' }]}
        />
        {schedule.kind === 'days_of_week' && (
          <div className="mt-2">
            <DayPicker days={schedule.days} weekStartsOn={settings?.weekStartsOn ?? 1} onChange={(days) => setSchedule({ kind: 'days_of_week', days })} />
          </div>
        )}
        <FieldError>{errors.schedule}</FieldError>
        <p className="mt-1.5 text-[13px] text-ink-3">Only sets the pace. Work on other days still counts.</p>
      </div>

      <div>
        <Label htmlFor="g-name">Name</Label>
        <input id="g-name" className={inputClass} value={name} maxLength={60}
          onChange={(e) => { setNameEdited(true); setCustomName(e.target.value); }} />
        {nameEdited && (
          <button type="button" className="mt-1.5 text-[13px] text-ink-2 underline underline-offset-2" onClick={() => { setNameEdited(false); setCustomName(''); }}>
            Use the automatic name
          </button>
        )}
      </div>

      {preview && <p className="rounded-lg bg-s2 px-3 py-2.5 text-[15px]">{preview}</p>}

      <Button type="submit" variant="primary">
        {confirmMet ? 'Yes, save as achieved' : existing ? 'Save changes' : 'Create goal'}
      </Button>
    </form>
  );
}

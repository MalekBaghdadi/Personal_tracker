import { Fragment, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Flag, ListChecks, NotebookPen, TriangleAlert } from 'lucide-react';
import { useData } from '../state/DataContext';
import { usePlans } from '../state/PlansContext';
import { useHue, useTheme } from '../state/theme';
import { MON_FRI, planNeedLabel, planStatusLabel, scheduleLabel, type PlanResult } from '../lib/plans';
import { addTask, createPlan, restoreTaskDone, setTaskDeleted, setTaskDone, updatePlan, updateSection, updateTask } from '../lib/plansRepo';
import { uuid, local } from '../lib/device';
import { addDays, formatLocalDate, nowIso } from '../lib/dates';
import { formatValue } from '../lib/format';
import { iconFor, ICONS } from '../lib/icons';
import { PALETTE, hueFor } from '../lib/palette';
import { Confetti } from './Confetti';
import { fmtDay } from './Goals';
import { Button, DayPicker, FieldError, Label, Segmented, Sheet, cx, inputClass, useToast } from './ui';
import type { Metric, Plan, PlanSection, PlanTask, Schedule } from '../lib/types';

// ── Inline formatting ──────────────────────────────────────────────────────

/** **bold**, *italic* and `code` from Markdown, shown as formatting rather than asterisks. */
export function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) parts.push(<code key={m.index} className="rounded bg-s3 px-1 py-px font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**') || tok.startsWith('__')) parts.push(<strong key={m.index} className="font-semibold">{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={m.index}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

/** Plain text for aria labels and toasts. */
export function plainText(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2').replace(/\*([^*]+)\*/g, '$1');
}

// ── Ticking ────────────────────────────────────────────────────────────────

/** Tick and untick with the usual Undo toast. */
export function useTaskTick() {
  const { uid } = useData();
  const toast = useToast();
  return {
    tick: (task: PlanTask, note?: string | null) => {
      setTaskDone(uid, task.id, true, note);
      toast(`Done: ${short(plainText(task.title))}`, { label: 'Undo', run: () => restoreTaskDone(uid, task.id, null) });
    },
    untick: (task: PlanTask) => {
      const was = task.doneAt;
      setTaskDone(uid, task.id, false);
      toast(`Not done: ${short(plainText(task.title))}`, { label: 'Undo', run: () => restoreTaskDone(uid, task.id, was) });
    },
  };
}

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 38)}…` : s);

export function TickButton({ task, color, label, size = 'md' }: { task: PlanTask; color: string; label?: string; size?: 'md' | 'sm' }) {
  const { tick, untick } = useTaskTick();
  const done = !!task.doneAt;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (done) untick(task);
        else tick(task);
      }}
      aria-pressed={done}
      aria-label={done ? `Mark “${plainText(task.title)}” not done` : `Mark “${plainText(task.title)}” done`}
      className={cx('press grid shrink-0 place-items-center rounded-full', size === 'md' ? 'size-11' : 'size-9')}
    >
      <span
        className={cx('grid place-items-center rounded-full border-2', size === 'md' ? 'size-7' : 'size-6')}
        style={done ? { background: color, borderColor: color, color: '#0e1420' } : { borderColor: 'var(--ink-3)' }}
      >
        {done && <Check size={size === 'md' ? 16 : 14} strokeWidth={3} aria-hidden />}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

// ── Progress bar with the pace marker ──────────────────────────────────────

export function PlanBar({ r, color, tall }: { r: PlanResult; color: string; tall?: boolean }) {
  const frac = (v: number) => (r.total > 0 ? Math.max(0, Math.min(1, v / r.total)) : 0);
  const showMarker = r.status !== 'achieved' && r.status !== 'missed' && r.status !== 'not_started' && r.status !== 'empty';
  return (
    <div className={cx('relative', tall ? 'h-2.5' : 'h-1.5')} role="presentation">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-s3">
        <div className="bar-fill h-full rounded-full" style={{ width: `${frac(r.done) * 100}%`, background: color }} />
      </div>
      {showMarker && (
        <div className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${frac(r.expected) * 100}%` }} title="Where the plan expected you to be by today" />
      )}
    </div>
  );
}

export function statusText(plan: Plan, r: PlanResult, today: string): string {
  return planStatusLabel(r, fmtDay(plan.startDate, today).replace('Tomorrow', 'tomorrow'));
}

export function projectionText(r: PlanResult, plan: Plan, today: string): string | null {
  if (r.projection.kind !== 'finishes') return null;
  const when = fmtDay(r.projection.finishDate, today);
  return r.projection.late ? `At this rate: ${when}, after the deadline` : r.projection.finishDate === plan.deadline ? 'At this rate: on the deadline' : `At this rate: done ${when}`;
}

/** The section a task is in, for "Uptime Monitor · Week 1". Short: up to a colon or bracket. */
export function sectionLabel(section: PlanSection | undefined): string | null {
  if (!section) return null;
  return section.title.split(/\s*[:(]/)[0].trim() || section.title;
}

// ── Today card ─────────────────────────────────────────────────────────────

/**
 * A plan on Today. On its own it's a card in the goals area; with `inline` (its linked metric) it sits inside
 * that metric's row instead, indented under the metric's bar with a rule in the metric's colour.
 */
export function PlanCard({ plan, inline }: { plan: Plan; inline?: Metric }) {
  const { today, entries, metricById } = useData();
  const { sectionsOf, resultOf } = usePlans();
  const hue = useHue(inline ? inline.color : plan.color);
  const r = resultOf(plan.id);
  const sections = sectionsOf(plan.id);
  const key = `pt.plan.open.${plan.id}`;
  const [open, setOpen] = useState(() => local.get(key) === '1');
  const [noteFor, setNoteFor] = useState<PlanTask | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const Icon = iconFor(plan.icon);
  const toggle = () => {
    setOpen((v) => {
      local.set(key, v ? null : '1');
      return !v;
    });
  };
  const current = r.current;
  const section = current ? sections.find((s) => s.id === current.sectionId) : undefined;
  const status = statusText(plan, r, today);
  const need = planNeedLabel(r);
  const linkedMetric = plan.metricId ? metricById.get(plan.metricId) : undefined;
  const linked = linkedMetric ? entries.filter((e) => e.metricId === plan.metricId && e.localDate === today).reduce((s, e) => s + e.value, 0) : 0;
  const next = r.currentIndex >= 0 ? r.ordered.slice(r.currentIndex + 1).filter((t) => !t.doneAt).slice(0, 2) : [];
  const checkpoint = section?.checkpoint ? section : undefined;

  // Inside a metric row: no card chrome, just the rule. The metric's own total is right above, so no "logged today".
  const rule = inline ? { borderColor: hue } : undefined;

  if (r.status === 'achieved') {
    return (
      <section
        className={inline ? 'rounded-r-lg border-l-2 py-1 pr-1 pl-3' : 'rounded-xl border border-line bg-s1 px-4 py-3.5'}
        style={rule}
        aria-label={`${plan.name}: achieved`}
        data-tour="today-plan"
      >
        {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
        <div className="flex items-center gap-2">
          {!inline && <Icon size={17} style={{ color: hue }} aria-hidden />}
          <h2 className={cx('min-w-0 flex-1 truncate font-medium', inline ? 'text-[14px]' : 'text-[15px]')}>{plan.name}</h2>
          <span className="text-[13px] text-ink-3">{r.done}/{r.total}</span>
        </div>
        <p className="mt-2 text-[15px]">All {r.total} tasks done. Plan achieved.</p>
        <a href={`#/plans/${plan.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[14px] text-ink-2 hover:text-ink">Open the plan <ChevronRight size={15} aria-hidden /></a>
      </section>
    );
  }

  return (
    <section className={inline ? 'border-l-2' : 'rounded-xl border border-line bg-s1'} style={rule} aria-label={plan.name} data-tour="today-plan">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), toggle())}
        className={cx('cursor-pointer', inline ? 'rounded-r-lg py-1 pr-1 pl-3 hover:bg-s1' : 'px-4 pt-3 pb-3')}
      >
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          {!inline && <Icon size={15} style={{ color: hue }} aria-hidden className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink-2">{plan.name}</span>
            {sectionLabel(section) && <> · {sectionLabel(section)}</>}
          </span>
          <span className="shrink-0">{r.done}/{r.total}</span>
          <ChevronDown size={16} className={cx('shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
        </div>
        {current && (
          <div className="-ml-2 mt-1 flex items-center gap-1">
            <span onClick={(e) => e.stopPropagation()} data-tour="today-plan-tick">
              <PlanTick task={current} color={hue} last={r.remaining === 1} onLast={() => setCelebrate(true)} />
            </span>
            <p className={cx('min-w-0 flex-1 text-[15px] font-medium', !open && 'truncate')} data-testid="plan-current">
              <Inline text={current.title} />
            </p>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
          <span className={cx('font-medium', r.status === 'behind' ? 'text-ink' : 'text-ink-2')} data-testid="plan-status">{status}</span>
          {inline
            ? need && <span className="text-ink-3">{need}</span>
            : linkedMetric && linked > 0 && <span className="text-ink-3">{linkedMetric.type === 'check' ? 'Done today' : `${formatValue(linkedMetric, linked)} logged today`}</span>}
        </div>
      </div>

      {open && current && (
        <div className={cx('text-[14px]', inline ? 'pt-1 pr-1 pb-1 pl-3' : 'border-t border-line px-4 pt-3 pb-3.5')}>
          {current.details && <p className="whitespace-pre-line text-ink-2"><Inline text={current.details} /></p>}
          {current.note && <p className="mt-2 text-ink-2"><span className="text-ink-3">Note: </span>{current.note}</p>}
          <button type="button" onClick={() => setNoteFor(current)} className="press mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-s2 px-3 text-[13px] font-medium hover:bg-s3">
            <NotebookPen size={14} aria-hidden /> {current.note ? 'Edit note' : 'Add a note'}
          </button>
          {/* Inline, today's need is already on the collapsed line. */}
          {((!inline && need) || projectionText(r, plan, today)) && (
            <p className="mt-3 text-ink-2">{[inline ? null : need, projectionText(r, plan, today)].filter(Boolean).join(' · ')}</p>
          )}
          {r.overloaded && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-2">
              <TriangleAlert size={14} className="shrink-0" aria-hidden />
              What’s left won’t fit at the planned pace. Open the plan to push it or move the deadline.
            </p>
          )}
          {checkpoint && <CheckpointRow section={checkpoint} color={hue} />}
          {next.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] text-ink-3">Next</p>
              <ul className="mt-0.5">
                {next.map((t) => <li key={t.id} className="truncate py-0.5 text-ink-2"><Inline text={t.title} /></li>)}
              </ul>
            </div>
          )}
          <a href={`#/plans/${plan.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-ink">Open the plan <ChevronRight size={15} aria-hidden /></a>
        </div>
      )}
      <TaskSheet task={noteFor} plan={plan} onClose={() => setNoteFor(null)} focus="note" />
    </section>
  );
}

/** The card's tick: confetti when it finishes the plan. */
function PlanTick({ task, color, last, onLast }: { task: PlanTask; color: string; last: boolean; onLast: () => void }) {
  return (
    <span onClickCapture={() => !task.doneAt && last && onLast()}>
      <TickButton task={task} color={color} />
    </span>
  );
}

export function CheckpointRow({ section, color }: { section: PlanSection; color: string }) {
  const { uid } = useData();
  const toast = useToast();
  const done = !!section.checkpointDoneAt;
  const set = (v: boolean) => {
    const was = section.checkpointDoneAt;
    updateSection(uid, section.id, { checkpointDoneAt: v ? nowIso() : null });
    toast(v ? 'Checkpoint reached' : 'Checkpoint unticked', { label: 'Undo', run: () => updateSection(uid, section.id, { checkpointDoneAt: was }) });
  };
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-s2 px-2 py-2">
      <button
        type="button"
        onClick={() => set(!done)}
        aria-pressed={done}
        aria-label={done ? 'Checkpoint reached. Untick' : 'Mark the checkpoint reached'}
        className="press grid size-9 shrink-0 place-items-center rounded-lg"
      >
        {done ? <Flag size={18} style={{ color }} fill={color} aria-hidden /> : <Flag size={18} className="text-ink-3" aria-hidden />}
      </button>
      <p className="min-w-0 flex-1 py-1.5 text-[14px]">
        <span className="text-[12px] font-medium text-ink-3">Checkpoint{done ? ' · reached' : ''}</span>
        <span className="block text-ink-2"><Inline text={section.checkpoint ?? ''} /></span>
      </p>
    </div>
  );
}

// ── Goals list line ────────────────────────────────────────────────────────

export function PlanLine({ plan }: { plan: Plan }) {
  const { today } = useData();
  const { resultOf } = usePlans();
  const hue = useHue(plan.color);
  const r = resultOf(plan.id);
  const detail = plan.archivedAt
    ? `Archived · ${r.done}/${r.total} tasks`
    : `${statusText(plan, r, today)} · ${r.done}/${r.total} tasks`;
  return (
    <li>
      <a href={`#/plans/${plan.id}`} className="flex min-h-14 items-center gap-3 py-2 pr-1 hover:bg-s1/60">
        <ListChecks size={17} style={{ color: hue }} aria-hidden className="ml-1 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[15px] font-medium', plan.archivedAt && 'text-ink-2')}>{plan.name}</span>
          <span className="block truncate text-[13px] text-ink-3">{detail}</span>
        </span>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </a>
    </li>
  );
}

// ── Plan fields ────────────────────────────────────────────────────────────

export interface PlanFields {
  name: string;
  startDate: string;
  deadline: string;
  schedule: Schedule;
  metricId: string | null;
  color: string;
  icon: string;
}

export function defaultPlanFields(today: string, usedColors: string[]): PlanFields {
  const color = (PALETTE.find((p) => !usedColors.includes(p.dark.toLowerCase())) ?? PALETTE[0]).dark;
  return { name: '', startDate: today, deadline: addDays(today, 27), schedule: MON_FRI, metricId: null, color, icon: 'Target' };
}

export function validatePlanFields(f: PlanFields): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!f.name.trim()) errs.name = 'Give it a name.';
  if (!f.startDate) errs.start = 'Choose a start date.';
  if (!f.deadline) errs.deadline = 'Choose a deadline.';
  else if (f.deadline < f.startDate) errs.deadline = 'The deadline must be on or after the start date.';
  if (f.schedule.kind === 'days_of_week' && f.schedule.days.length === 0) errs.schedule = 'Pick at least one work day.';
  return errs;
}

/** Name, dates, schedule, linked metric, colour and icon. Shared by import, Start empty and Edit. */
export function PlanFieldsForm({ value, onChange, errors }: { value: PlanFields; onChange: (f: PlanFields) => void; errors: Record<string, string> }) {
  const { metrics, settings } = useData();
  const theme = useTheme();
  const set = (patch: Partial<PlanFields>) => onChange({ ...value, ...patch });
  const linkable = metrics.filter((m) => !m.archivedAt || m.id === value.metricId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="p-name">Name</Label>
        <input id="p-name" className={inputClass} value={value.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Uptime Monitor" />
        <FieldError>{errors.name}</FieldError>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="p-start">Start date</Label>
          <input id="p-start" type="date" className={inputClass} value={value.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <FieldError>{errors.start}</FieldError>
        </div>
        <div>
          <Label htmlFor="p-deadline">Deadline</Label>
          <input id="p-deadline" type="date" className={inputClass} value={value.deadline} min={value.startDate} onChange={(e) => set({ deadline: e.target.value })} />
          <FieldError>{errors.deadline}</FieldError>
        </div>
      </div>
      <div>
        <Label>Work days</Label>
        <Segmented
          label="Work days"
          value={value.schedule.kind}
          onChange={(k) => set({ schedule: k === 'daily' ? { kind: 'daily' } : value.schedule.kind === 'days_of_week' ? value.schedule : MON_FRI })}
          options={[{ value: 'daily', label: 'Every day' }, { value: 'days_of_week', label: 'Some days' }]}
        />
        {value.schedule.kind === 'days_of_week' && (
          <div className="mt-2">
            <DayPicker days={value.schedule.days} weekStartsOn={settings?.weekStartsOn ?? 1} onChange={(days) => set({ schedule: { kind: 'days_of_week', days } })} />
          </div>
        )}
        <FieldError>{errors.schedule}</FieldError>
        <p className="mt-1.5 text-[13px] text-ink-3">Only these days count for pace. You can still tick tasks on any day.</p>
      </div>
      <div>
        <Label htmlFor="p-metric">Linked metric</Label>
        <select id="p-metric" className={inputClass} value={value.metricId ?? ''} onChange={(e) => set({ metricId: e.target.value || null })}>
          <option value="">None</option>
          {linkable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <p className="mt-1.5 text-[13px] text-ink-3">Optional. The plan shows inside that metric’s row on Today, and stopping its timer after more than 10 minutes offers to tick the current task.</p>
      </div>
      <div>
        <Label>Colour</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((p) => (
            <button
              key={p.dark}
              type="button"
              aria-label={p.name}
              aria-pressed={value.color.toLowerCase() === p.dark.toLowerCase()}
              onClick={() => set({ color: p.dark })}
              className={cx('press size-10 rounded-lg border-2', value.color.toLowerCase() === p.dark.toLowerCase() ? 'border-ink' : 'border-transparent')}
              style={{ background: theme === 'dark' ? p.dark : p.light }}
            />
          ))}
        </div>
      </div>
      <div>
        <Label>Icon</Label>
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(ICONS).map(([key, I]) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={value.icon === key}
              onClick={() => set({ icon: key })}
              className={cx('press flex aspect-square min-h-10 items-center justify-center rounded-lg', value.icon === key ? 'bg-s3 text-ink' : 'text-ink-3 hover:bg-s2 hover:text-ink')}
            >
              <I size={18} style={value.icon === key ? { color: hueFor(value.color, theme) } : undefined} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Start empty, or edit an existing plan's fields. */
export function PlanFormSheet({ plan, open, onClose }: { plan: Plan | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={plan ? 'Edit plan' : 'New plan'}>
      {open && <PlanFormBody key={plan?.id ?? 'new'} plan={plan} onDone={onClose} />}
    </Sheet>
  );
}

function PlanFormBody({ plan, onDone }: { plan: Plan | null; onDone: () => void }) {
  const { uid, today } = useData();
  const { plans } = usePlans();
  const toast = useToast();
  const [fields, setFields] = useState<PlanFields>(() =>
    plan ? { name: plan.name, startDate: plan.startDate, deadline: plan.deadline, schedule: plan.schedule, metricId: plan.metricId, color: plan.color, icon: plan.icon }
      : defaultPlanFields(today, plans.map((p) => p.color.toLowerCase())),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const errs = validatePlanFields(fields);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const clean = { ...fields, name: fields.name.trim() };
    if (plan) {
      const before = { name: plan.name, startDate: plan.startDate, deadline: plan.deadline, schedule: plan.schedule, metricId: plan.metricId, color: plan.color, icon: plan.icon };
      updatePlan(uid, plan.id, clean);
      toast('Plan saved', { label: 'Undo', run: () => updatePlan(uid, plan.id, before) });
      onDone();
      return;
    }
    const now = nowIso();
    const id = uuid();
    createPlan(uid, { plan: { ...clean, id, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null }, sections: [], tasks: [] });
    toast(`${clean.name} created. Add its tasks.`);
    onDone();
    window.location.hash = `#/plans/${id}`;
  };
  return (
    <form noValidate className="mt-2 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <PlanFieldsForm value={fields} onChange={setFields} errors={errors} />
      <p className="text-[13px] text-ink-3">{scheduleLabel(fields.schedule)} · {fields.startDate && fields.deadline ? `${formatLocalDate(fields.startDate, 'd MMM')} – ${formatLocalDate(fields.deadline, 'd MMM')}` : ''}</p>
      <Button type="submit" variant="primary">{plan ? 'Save changes' : 'Create plan'}</Button>
    </form>
  );
}

// ── One task: details, note, edit, delete ──────────────────────────────────

export function TaskSheet({ task, plan, onClose, focus }: { task: PlanTask | null; plan: Plan; onClose: () => void; focus?: 'note' }) {
  return (
    <Sheet open={task !== null} onClose={onClose} title={task ? 'Task' : ''}>
      {task && <TaskBody key={task.id} task={task} plan={plan} onDone={onClose} focus={focus} />}
    </Sheet>
  );
}

function TaskBody({ task, plan, onDone, focus }: { task: PlanTask; plan: Plan; onDone: () => void; focus?: 'note' }) {
  const { uid, dayOf, today } = useData();
  const { sectionsOf } = usePlans();
  const toast = useToast();
  const hue = useHue(plan.color);
  const sections = sectionsOf(plan.id);
  const [title, setTitle] = useState(task.title);
  const [details, setDetails] = useState(task.details ?? '');
  const [date, setDate] = useState(task.targetDate ?? '');
  const [note, setNote] = useState(task.note ?? '');
  const [sectionId, setSectionId] = useState(task.sectionId ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!title.trim()) return setError('Give the task a title.');
    const patch: Parameters<typeof updateTask>[2] = {};
    if (title.trim() !== task.title) patch.title = title.trim();
    if ((details.trim() || null) !== task.details) patch.details = details.trim() || null;
    if ((date || null) !== task.targetDate) patch.targetDate = date || null;
    if ((note.trim() || null) !== task.note) patch.note = note.trim() || null;
    if ((sectionId || null) !== task.sectionId) {
      patch.sectionId = sectionId || null;
      patch.order = Date.now(); // to the end of the new section
    }
    if (Object.keys(patch).length) {
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, task[k as keyof PlanTask]]));
      updateTask(uid, task.id, patch);
      toast('Task saved', { label: 'Undo', run: () => updateTask(uid, task.id, before) });
    }
    onDone();
  };

  return (
    <form noValidate className="mt-2 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="-ml-2 flex items-center gap-1">
        <TickButton task={task} color={hue} />
        <span className="text-[14px] text-ink-2">{task.doneAt ? `Done ${fmtDay(dayOf(task.doneAt), today).replace('Today', 'today')}` : 'Not done yet'}</span>
      </div>
      <div>
        <Label htmlFor="t-title">Title</Label>
        <textarea id="t-title" rows={2} className={cx(inputClass, 'h-auto py-2.5')} value={title} maxLength={300} onChange={(e) => { setTitle(e.target.value); setError(null); }} />
        <FieldError>{error}</FieldError>
      </div>
      <div>
        <Label htmlFor="t-details">Details</Label>
        <textarea id="t-details" rows={3} className={cx(inputClass, 'h-auto py-2.5')} value={details} maxLength={4000} placeholder="Optional" onChange={(e) => setDetails(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="t-note">Note</Label>
        <textarea id="t-note" rows={2} className={cx(inputClass, 'h-auto py-2.5')} value={note} maxLength={1000} placeholder="What happened, what’s left" autoFocus={focus === 'note'} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="t-date">Target date</Label>
          <input id="t-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-section">Section</Label>
          <select id="t-section" className={inputClass} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">None</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-ink-3">The date only shapes the pace line. Without one, the task is spread over the days around it.</p>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">Save</Button>
        <Button
          variant="danger"
          onClick={() => {
            setTaskDeleted(uid, task.id, true);
            toast('Task deleted', { label: 'Undo', run: () => setTaskDeleted(uid, task.id, false) });
            onDone();
          }}
        >
          Delete task
        </Button>
      </div>
    </form>
  );
}

/** A quick "Add a task" form at the end of a section (or of the loose tasks). */
export function AddTaskForm({ plan, sectionId, order, onDone }: { plan: Plan; sectionId: string | null; order: number; onDone: () => void }) {
  const { uid } = useData();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-lg bg-s2 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const id = addTask(uid, { planId: plan.id, sectionId, order, title: title.trim(), details: null, targetDate: date || null });
        toast('Task added', { label: 'Undo', run: () => setTaskDeleted(uid, id, true) });
        setTitle('');
        setDate('');
      }}
    >
      <input className={inputClass} value={title} autoFocus maxLength={300} placeholder="New task" aria-label="New task" onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <input type="date" className={cx(inputClass, 'min-w-0 flex-1')} value={date} aria-label="Target date (optional)" onChange={(e) => setDate(e.target.value)} />
        <Button type="submit" variant="primary">Add</Button>
        <Button variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </form>
  );
}


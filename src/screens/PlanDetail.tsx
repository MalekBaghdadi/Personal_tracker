import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, ChevronUp, FileText, FastForward, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../state/DataContext';
import { usePlans } from '../state/PlansContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate } from '../lib/dates';
import { computePlan, planNeedLabel, pushRemaining, scheduleLabel, type PlanResult } from '../lib/plans';
import { addSection, deleteParts, deletePlan, deleteSection, placeSections, placeTasks, pushPlan, setPlanArchived, updateSection } from '../lib/plansRepo';
import { Button, FieldError, Label, Sheet, Switch, cx, inputClass, useToast } from '../components/ui';
import { fmtDay } from '../components/Goals';
import { AddTaskForm, CheckpointRow, Inline, PlanBar, PlanFormSheet, TaskSheet, TickButton, plainText, projectionText, statusText } from '../components/Plans';
import { PlanImportSheet } from '../components/PlanImport';
import { useDragOrder } from '../components/DragOrder';
import type { Plan, PlanSection, PlanTask } from '../lib/types';

export function PlanDetail({ id }: { id: string | null }) {
  const { planById } = usePlans();
  const plan = id ? planById.get(id) : undefined;
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <a href="#/metrics" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[14px] text-ink-2 hover:bg-s1 hover:text-ink">
        <ChevronLeft size={18} aria-hidden /> Goals
      </a>
      {plan ? <Detail plan={plan} /> : <p className="text-[15px] text-ink-2">This plan no longer exists.</p>}
    </div>
  );
}

type SheetState = null | 'edit' | 'append' | 'push' | 'delete';

function Detail({ plan }: { plan: Plan }) {
  const { uid, today, metricById } = useData();
  const { resultOf, sectionsOf, tasksOf } = usePlans();
  const toast = useToast();
  const hue = useHue(plan.color);
  const r = resultOf(plan.id);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [editing, setEditing] = useState(false);
  const metric = plan.metricId ? metricById.get(plan.metricId) : undefined;
  const need = planNeedLabel(r);
  const projection = projectionText(r, plan, today);
  const live = r.status !== 'achieved' && r.status !== 'missed' && r.status !== 'empty';
  const archive = (v: boolean) => {
    setPlanArchived(uid, plan.id, v);
    toast(v ? `Archived ${plan.name}` : `${plan.name} is active again`, { label: 'Undo', run: () => setPlanArchived(uid, plan.id, !v) });
  };
  const daysLeft = today > plan.deadline ? 'Deadline passed' : today === plan.deadline ? 'Due today' : `${r.daysLeft} work ${r.daysLeft === 1 ? 'day' : 'days'} left`;

  return (
    <>
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">{plan.name}</h1>
        <p className="mt-0.5 text-[14px] text-ink-3">
          {metric ? `${metric.name} · ` : ''}{fmtDay(plan.startDate, today)} to {fmtDay(plan.deadline, today)} · {scheduleLabel(plan.schedule)}
          {plan.archivedAt ? ' · Archived' : live ? ` · ${daysLeft}` : ''}
        </p>
      </header>

      <section className="mt-5" aria-label="Progress">
        <p>
          <span className="text-[34px] leading-none font-medium tracking-tight">{r.done}</span>
          <span className="text-[16px] text-ink-3"> of {r.total} {r.total === 1 ? 'task' : 'tasks'}</span>
        </p>
        <div className="mt-4"><PlanBar r={r} color={hue} tall /></div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[16px] font-medium" data-testid="plan-detail-status">{statusText(plan, r, today)}</span>
          {need && <span className="text-[15px] text-ink-2">{need}</span>}
        </div>
        {projection && <p className="mt-1 text-[14px] text-ink-2">{projection}</p>}
        {live && r.status !== 'not_started' && <p className="mt-1 text-[12px] text-ink-3">The thin mark on the bar is where the plan expected you to be by today.</p>}
      </section>

      {r.status === 'achieved' && (
        <section className="mt-5 rounded-lg bg-s1 px-4 py-3.5">
          <p className="text-[15px]">
            All {r.total} tasks done{r.achievedDate ? (r.achievedDate === today ? ' today' : ` on ${fmtDay(r.achievedDate, today)}`) : ''}
            {r.achievedDate && r.achievedDate < plan.deadline ? `, ahead of the ${fmtDay(plan.deadline, today)} deadline` : ''}.
          </p>
          {!plan.archivedAt && <Button className="mt-3 w-full" onClick={() => archive(true)}>Archive</Button>}
        </section>
      )}
      {r.status === 'missed' && (
        <section className="mt-5 rounded-lg bg-s1 px-4 py-3.5">
          <p className="text-[15px]">The deadline was {fmtDay(plan.deadline, today)}. {r.done} of {r.total} tasks done, {r.remaining} left.</p>
          {!plan.archivedAt && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => setSheet('edit')}>Extend deadline</Button>
              <Button onClick={() => archive(true)}>Archive</Button>
            </div>
          )}
        </section>
      )}
      {r.overloaded && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-s1 px-3 py-2.5 text-[14px] text-ink-2">
          <TriangleAlert size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">What’s left needs more than double the planned pace.</span>
          <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setSheet('push')}>Push remaining</button>
        </div>
      )}

      <Figures plan={plan} r={r} />

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button onClick={() => setSheet('push')} disabled={!live}><FastForward size={16} /> Push remaining</Button>
        <Button onClick={() => setSheet('append')}><FileText size={16} /> From Markdown</Button>
        <Button onClick={() => setSheet('edit')}><Pencil size={16} /> Edit plan</Button>
        {plan.archivedAt ? (
          <Button onClick={() => archive(false)}><ArchiveRestore size={16} /> Unarchive</Button>
        ) : (
          <Button onClick={() => archive(true)}><Archive size={16} /> Archive</Button>
        )}
      </div>

      {r.total > 0 && <BurnUp plan={plan} r={r} hue={hue} />}

      <section className="mt-7" aria-labelledby="tasks-h">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="tasks-h" className="text-[16px] font-medium">Tasks</h2>
          <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="press inline-flex min-h-10 items-center rounded-lg bg-s2 px-3 text-[14px] font-medium hover:bg-s3">
            {editing ? 'Done editing' : 'Edit tasks'}
          </button>
        </div>
        <TaskList plan={plan} r={r} sections={sectionsOf(plan.id)} editing={editing} />
      </section>

      <TaskNotes plan={plan} tasks={tasksOf(plan.id)} />

      <Button variant="danger" className="mt-8 w-full" onClick={() => setSheet('delete')}><Trash2 size={16} /> Delete plan</Button>

      <PlanFormSheet plan={plan} open={sheet === 'edit'} onClose={() => setSheet(null)} />
      <PlanImportSheet open={sheet === 'append'} into={plan} onClose={() => setSheet(null)} />
      <PushSheet plan={plan} open={sheet === 'push'} onClose={() => setSheet(null)} />
      <DeleteSheet plan={plan} open={sheet === 'delete'} onClose={() => setSheet(null)} />
    </>
  );
}

function Figures({ plan, r }: { plan: Plan; r: PlanResult }) {
  const live = r.status !== 'achieved' && r.status !== 'missed';
  const rate = (n: number) => `${+n.toFixed(1)} a day`;
  const rows: [string, string][] = [
    ['Planned pace', r.totalDays ? rate(r.total / r.totalDays) : '–'],
    ['Needed from today', live && r.daysLeft > 0 ? rate(r.remaining / r.daysLeft) : '–'],
    ['Recent rate (14 days)', r.recentRate !== null ? rate(r.recentRate) : r.projection.kind === 'insufficient' ? 'Not enough days yet' : '–'],
    ['Work days left', live ? `${r.daysLeft} of ${r.totalDays}` : `${r.totalDays} in total`],
    ['Remaining', `${r.remaining} ${r.remaining === 1 ? 'task' : 'tasks'}`],
    ['Deadline', formatLocalDate(plan.deadline, 'EEE d MMM')],
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] text-ink-3">{k}</dt>
          <dd className="mt-0.5 text-[16px] font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Task list ──────────────────────────────────────────────────────────────

function TaskList({ plan, r, sections, editing }: { plan: Plan; r: PlanResult<PlanTask>; sections: PlanSection[]; editing: boolean }) {
  const { uid } = useData();
  const toast = useToast();
  const [openTask, setOpenTask] = useState<PlanTask | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const loose = r.ordered.filter((t) => !t.sectionId || !sections.some((s) => s.id === t.sectionId));
  const currentSection = r.current?.sectionId ?? null;
  const looseMax = loose.reduce((m, t) => Math.max(m, t.order), -1);

  return (
    <>
      {(loose.length > 0 || (sections.length === 0 && editing)) && (
        <Group plan={plan} r={r} section={null} tasks={loose} defaultOpen startOpen editing={editing} onOpenTask={setOpenTask} looseOrder={looseMax} sections={sections} />
      )}
      {sections.map((s, i) => (
        <Group
          key={s.id}
          plan={plan}
          r={r}
          section={s}
          tasks={r.ordered.filter((t) => t.sectionId === s.id)}
          startOpen={s.id === currentSection || (r.current === null && i === sections.length - 1)}
          editing={editing}
          onOpenTask={setOpenTask}
          looseOrder={looseMax}
          sections={sections}
        />
      ))}
      {r.total === 0 && !editing && <p className="text-[14px] text-ink-3">No tasks yet. Tap Edit tasks to add some, or add them from Markdown.</p>}
      {editing && (addingSection ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sectionTitle.trim()) return;
            const id = addSection(uid, plan.id, sectionTitle.trim(), sections.reduce((m, s) => Math.max(m, s.order), -1) + 1);
            toast('Section added', { label: 'Undo', run: () => deleteParts(uid, [id], []) });
            setSectionTitle('');
            setAddingSection(false);
          }}
        >
          <input className={cx(inputClass, 'min-w-0 flex-1')} autoFocus value={sectionTitle} maxLength={120} placeholder="Section name, e.g. Week 7" aria-label="Section name" onChange={(e) => setSectionTitle(e.target.value)} />
          <Button type="submit" variant="primary">Add</Button>
        </form>
      ) : (
        <Button className="mt-3 w-full" onClick={() => setAddingSection(true)}><Plus size={16} /> Add a section</Button>
      ))}
      <TaskSheet task={openTask} plan={plan} onClose={() => setOpenTask(null)} />
    </>
  );
}

function Group({
  plan, r, section, tasks, startOpen, defaultOpen, editing, onOpenTask, looseOrder, sections,
}: {
  plan: Plan; r: PlanResult<PlanTask>; section: PlanSection | null; tasks: PlanTask[]; startOpen: boolean; defaultOpen?: boolean;
  editing: boolean; onOpenTask: (t: PlanTask) => void; looseOrder: number; sections: PlanSection[];
}) {
  const { uid, today, dayOf } = useData();
  const hue = useHue(plan.color);
  const [open, setOpen] = useState(startOpen || !!defaultOpen);
  const [adding, setAdding] = useState(false);
  const [sectionSheet, setSectionSheet] = useState(false);
  const done = tasks.filter((t) => t.doneAt).length;
  const drag = useDragOrder(tasks.map((t) => t.id), (ids) => placeTasks(uid, ids.map((id, i) => ({ id, sectionId: section?.id ?? null, order: i }))));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const shown = editing ? drag.order : tasks.map((t) => t.id);
  const index = section ? sections.findIndex((s) => s.id === section.id) : -1;
  const moveSection = (delta: number) => {
    const ids = sections.map((s) => s.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(to, 0, section!.id);
    placeSections(uid, ids);
  };
  const isOpen = open || editing;

  return (
    <section className="border-t border-line first:border-t-0" aria-label={section ? plainText(section.title) : 'Tasks not in a section'}>
      {section && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={isOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium"><Inline text={section.title} /></span>
              <span className="block text-[12px] text-ink-3">{done}/{tasks.length} done{section.checkpoint ? ` · checkpoint${section.checkpointDoneAt ? ' reached' : ''}` : ''}</span>
            </span>
            {!editing && <ChevronDown size={16} className={cx('shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-180')} aria-hidden />}
          </button>
          {editing && (
            <>
              <button type="button" aria-label="Move section up" disabled={index <= 0} onClick={() => moveSection(-1)} className="press grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-s2 disabled:opacity-30"><ChevronUp size={17} /></button>
              <button type="button" aria-label="Move section down" disabled={index >= sections.length - 1} onClick={() => moveSection(1)} className="press grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-s2 disabled:opacity-30"><ChevronDown size={17} /></button>
              <button type="button" aria-label={`Edit section ${plainText(section.title)}`} onClick={() => setSectionSheet(true)} className="press grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-s2"><Pencil size={16} /></button>
            </>
          )}
        </div>
      )}
      {isOpen && (
        <>
          <ul className="pb-2">
            {shown.map((id) => {
              const t = byId.get(id);
              if (!t) return null;
              const isCurrent = r.current?.id === t.id;
              return (
                <li key={id} ref={drag.rowRef(id)} className={cx('flex items-start gap-1', drag.dragging === id && 'relative z-10 rounded-lg bg-s2')}>
                  {editing ? drag.handle(id, `Reorder ${plainText(t.title)}`) : <span className="-ml-2"><TickButton task={t} color={hue} size="sm" /></span>}
                  <button type="button" onClick={() => onOpenTask(t)} className="min-h-11 min-w-0 flex-1 py-1.5 text-left">
                    <span className={cx('block text-[14px]', t.doneAt ? 'text-ink-3' : 'text-ink', isCurrent && 'font-medium')}>
                      <Inline text={t.title} />
                    </span>
                    <span className="block text-[12px] text-ink-3">
                      {[
                        isCurrent ? 'Current' : null,
                        t.targetDate ? formatLocalDate(t.targetDate, 'EEE d MMM') : null,
                        t.doneAt ? `done ${fmtDay(dayOf(t.doneAt), today).replace('Today', 'today').replace('Tomorrow', 'tomorrow')}` : null,
                        t.note ? 'note' : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {section?.checkpoint && <div className="pb-3"><CheckpointRow section={section} color={hue} /></div>}
          {editing && (adding ? (
            <AddTaskForm plan={plan} sectionId={section?.id ?? null} order={(section ? tasks.reduce((m, t) => Math.max(m, t.order), -1) : looseOrder) + 1} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="press mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] text-ink-2 hover:bg-s2 hover:text-ink">
              <Plus size={15} /> Add a task{section ? ` to ${plainText(section.title).split(/\s*[:(]/)[0]}` : ''}
            </button>
          ))}
        </>
      )}
      {section && <SectionSheet open={sectionSheet} section={section} tasks={tasks} looseOrder={looseOrder} onClose={() => setSectionSheet(false)} />}
    </section>
  );
}

function SectionSheet({ open, section, tasks, looseOrder, onClose }: { open: boolean; section: PlanSection; tasks: PlanTask[]; looseOrder: number; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Section">
      {open && <SectionBody section={section} tasks={tasks} looseOrder={looseOrder} onDone={onClose} />}
    </Sheet>
  );
}

function SectionBody({ section, tasks, looseOrder, onDone }: { section: PlanSection; tasks: PlanTask[]; looseOrder: number; onDone: () => void }) {
  const { uid } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(section.title);
  const [checkpoint, setCheckpoint] = useState(section.checkpoint ?? '');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirm) {
    const remove = (keep: boolean) => {
      const undo = deleteSection(uid, section, tasks, keep, looseOrder);
      toast(keep ? 'Section deleted, tasks kept' : `Section and ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} deleted`, { label: 'Undo', run: undo });
      onDone();
    };
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-[15px] text-ink-2">{tasks.length ? `It has ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}. What should happen to ${tasks.length === 1 ? 'it' : 'them'}?` : 'It has no tasks.'}</p>
        {tasks.length > 0 && <Button onClick={() => remove(true)}>Keep the tasks, outside any section</Button>}
        <Button variant="danger" onClick={() => remove(false)}>{tasks.length ? 'Delete the section and its tasks' : 'Delete the section'}</Button>
        <Button variant="ghost" onClick={() => setConfirm(false)}>Keep the section</Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="mt-2 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return setError('Give the section a name.');
        const before = { title: section.title, checkpoint: section.checkpoint };
        updateSection(uid, section.id, { title: title.trim(), checkpoint: checkpoint.trim() || null });
        toast('Section saved', { label: 'Undo', run: () => updateSection(uid, section.id, before) });
        onDone();
      }}
    >
      <div>
        <Label htmlFor="s-title">Name</Label>
        <input id="s-title" className={inputClass} value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setError(null); }} />
        <FieldError>{error}</FieldError>
      </div>
      <div>
        <Label htmlFor="s-checkpoint">Checkpoint</Label>
        <textarea id="s-checkpoint" rows={2} className={cx(inputClass, 'h-auto py-2.5')} value={checkpoint} maxLength={500} placeholder="Optional: what done looks like at the end of this section" onChange={(e) => setCheckpoint(e.target.value)} />
        <p className="mt-1.5 text-[13px] text-ink-3">A milestone you can tick. It doesn’t count toward tasks or pace.</p>
      </div>
      <Button type="submit" variant="primary">Save</Button>
      <Button variant="danger" onClick={() => setConfirm(true)}>Delete section</Button>
    </form>
  );
}

// ── Push remaining ─────────────────────────────────────────────────────────

function PushSheet({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Push remaining">
      {open && <PushBody plan={plan} onDone={onClose} />}
    </Sheet>
  );
}

function PushBody({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const { uid, today, dayOf } = useData();
  const { tasksOf, sectionsOf } = usePlans();
  const toast = useToast();
  const [days, setDays] = useState('1');
  const [moveDeadline, setMoveDeadline] = useState(true);
  const n = Number(days);
  const ok = Number.isInteger(n) && n >= 1 && n <= 60;
  const tasks = tasksOf(plan.id);
  const preview = useMemo(() => {
    if (!ok) return null;
    const { dates, deadline } = pushRemaining(plan, tasks, n, moveDeadline);
    const moved = tasks.map((t) => ({ ...t, targetDate: dates.get(t.id) ?? t.targetDate }));
    const after = computePlan({ ...plan, deadline }, sectionsOf(plan.id), moved, today, dayOf);
    return { dates, deadline, status: statusText({ ...plan, deadline }, after, today) };
  }, [ok, n, moveDeadline, plan, tasks, sectionsOf, today, dayOf]);

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-[15px] text-ink-2">Moves every undone task’s date later by this many work days ({scheduleLabel(plan.schedule)}), so a day lost on purpose doesn’t read as behind.</p>
      <div>
        <Label htmlFor="push-days">Work days</Label>
        <input id="push-days" className={inputClass} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
        {!ok && days !== '' && <FieldError>Enter a whole number from 1 to 60.</FieldError>}
      </div>
      <Switch checked={moveDeadline} onChange={setMoveDeadline} label="Move the deadline too" />
      {preview && (
        <p className="rounded-lg bg-s2 px-3 py-2.5 text-[14px]">
          {preview.dates.size} {preview.dates.size === 1 ? 'task moves' : 'tasks move'}
          {moveDeadline ? `, deadline ${formatLocalDate(preview.deadline, 'EEE d MMM')}` : ''}. Then: {preview.status}.
        </p>
      )}
      <Button
        variant="primary"
        disabled={!preview}
        onClick={() => {
          if (!preview) return;
          const undo = pushPlan(uid, plan, preview.dates, preview.deadline, tasks);
          toast(`Pushed ${n} work ${n === 1 ? 'day' : 'days'}`, { label: 'Undo', run: undo });
          onDone();
        }}
      >
        Push {ok ? `${n} work ${n === 1 ? 'day' : 'days'}` : ''}
      </Button>
    </div>
  );
}

function DeleteSheet({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  const { uid } = useData();
  const { tasksOf, sectionsOf } = usePlans();
  const toast = useToast();
  const tasks = tasksOf(plan.id);
  return (
    <Sheet open={open} onClose={onClose} title={`Delete ${plan.name}?`}>
      <p className="mt-2 text-[15px] text-ink-2">This removes the plan and its {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}. To hide it but keep the record, archive it instead.</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="danger"
          onClick={() => {
            const undo = deletePlan(uid, plan.id, sectionsOf(plan.id).map((s) => s.id), tasks.map((t) => t.id));
            toast(`Deleted ${plan.name}`, { label: 'Undo', run: () => { undo(); window.location.hash = `#/plans/${plan.id}`; } });
            onClose();
            window.location.hash = '#/metrics';
          }}
        >
          Delete the plan
        </Button>
        <Button onClick={onClose}>Keep it</Button>
      </div>
    </Sheet>
  );
}

// ── Notes and the burn-up chart ────────────────────────────────────────────

function TaskNotes({ plan, tasks }: { plan: Plan; tasks: PlanTask[] }) {
  const { today, dayOf } = useData();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<PlanTask | null>(null);
  const noted = tasks.filter((t) => t.note).sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt));
  if (noted.length === 0) return null;
  const shown = all ? noted : noted.slice(0, 5);
  return (
    <section className="mt-7" aria-labelledby="plan-notes-h">
      <h2 id="plan-notes-h" className="text-[16px] font-medium">Notes</h2>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpen(t)} className="w-full py-2.5 text-left">
              <span className="block text-[14px]">{t.note}</span>
              <span className="block truncate text-[12px] text-ink-3">{t.doneAt ? `${fmtDay(dayOf(t.doneAt), today)} · ` : ''}{plainText(t.title)}</span>
            </button>
          </li>
        ))}
      </ul>
      {noted.length > 5 && !all && <button type="button" className="mt-2 text-[14px] text-ink-2 underline underline-offset-2" onClick={() => setAll(true)}>Show all {noted.length}</button>}
      <TaskSheet task={open} plan={plan} onClose={() => setOpen(null)} />
    </section>
  );
}

function BurnUp({ plan, r, hue }: { plan: Plan; r: PlanResult<PlanTask>; hue: string }) {
  const { today, dayOf } = useData();
  const rows = useMemo(() => {
    const plannedBy = new Map<string, number>();
    for (const d of r.planned.values()) plannedBy.set(d, (plannedBy.get(d) ?? 0) + 1);
    const doneBy = new Map<string, number>();
    let doneBefore = 0;
    for (const t of r.ordered) {
      if (!t.doneAt) continue;
      const d = dayOf(t.doneAt);
      if (d < plan.startDate) doneBefore++;
      else doneBy.set(d, (doneBy.get(d) ?? 0) + 1);
    }
    let plannedBefore = 0;
    for (const d of r.planned.values()) if (d < plan.startDate) plannedBefore++;
    const lastPlanned = [...r.planned.values()].reduce((m, d) => (d > m ? d : m), plan.deadline);
    const end = lastPlanned > plan.deadline ? lastPlanned : plan.deadline;
    const out: { date: string; actual: number | null; planned: number }[] = [];
    let actual = doneBefore;
    let planned = plannedBefore;
    for (let d = plan.startDate; d <= end; d = addDays(d, 1)) {
      actual += doneBy.get(d) ?? 0;
      planned += plannedBy.get(d) ?? 0;
      out.push({ date: d, actual: d <= today ? actual : null, planned });
    }
    return out;
  }, [plan, r, today, dayOf]);
  const step = r.total <= 10 ? 2 : r.total <= 40 ? 5 : r.total <= 100 ? 20 : 50;
  const ticks: number[] = [];
  for (let v = 0; v < r.total + step; v += step) ticks.push(v);
  const lastActual = rows.reduce((last, x, i) => (x.actual !== null ? i : last), -1);
  const todayIn = today >= plan.startDate && today <= rows[rows.length - 1]?.date;

  return (
    <section className="mt-6" aria-labelledby="plan-burnup-h">
      <h2 id="plan-burnup-h" className="text-[15px] font-medium">Progress over time</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: hue }} />Done</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ink-3" />Planned</span>
      </div>
      <div className="mt-2 h-56" role="img" aria-label={`Burn-up chart: ${r.done} of ${r.total} tasks done, against the planned dates.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickFormatter={(d: string) => formatLocalDate(d, 'd MMM')} />
            <YAxis width={32} tickLine={false} axisLine={false} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} allowDecimals={false} />
            {todayIn && <ReferenceLine x={today} stroke="var(--ink-3)" strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fill: 'var(--ink-3)', fontSize: 11 }} />}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof rows)[number];
                return (
                  <div className="rounded-lg border border-line bg-s3 px-3 py-2 text-[13px] shadow-lg">
                    <div className="text-ink-3">{formatLocalDate(p.date, 'EEE d MMM')}</div>
                    {p.actual !== null && <div className="font-medium text-ink">Done {p.actual}</div>}
                    <div className="text-ink-2">Planned {p.planned}</div>
                  </div>
                );
              }}
            />
            <Line dataKey="planned" type="stepAfter" stroke="var(--ink-3)" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
            <Line
              dataKey="actual"
              type="stepAfter"
              stroke={hue}
              strokeWidth={2}
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                p.index === lastActual && p.cx != null && p.cy != null ? <circle key="now" cx={p.cx} cy={p.cy} r={4} fill={hue} stroke="var(--bg)" strokeWidth={2} /> : <g key={`d${p.index}`} />
              }
              activeDot={{ r: 4, stroke: 'var(--bg)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

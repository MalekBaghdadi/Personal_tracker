import { useMemo, useRef, useState } from 'react';
import { ChevronDown, FileUp, TriangleAlert } from 'lucide-react';
import { useData } from '../state/DataContext';
import { usePlans } from '../state/PlansContext';
import { allTasks, parsePlanMarkdown, planWarnings, summarize, type ParsedPlan } from '../lib/planMarkdown';
import { scheduleLabel } from '../lib/plans';
import { appendToPlan, createPlan, deleteParts, deletePlan, docsFromParsed } from '../lib/plansRepo';
import { uuid } from '../lib/device';
import { formatLocalDate, nowIso } from '../lib/dates';
import { Inline, PlanFieldsForm, defaultPlanFields, validatePlanFields, type PlanFields } from './Plans';
import { Button, Label, Sheet, cx, inputClass, useToast } from './ui';
import type { Plan } from '../lib/types';

/**
 * Import from Markdown: paste (the main path; picking files in an installed
 * iPhone app is awkward) or pick a .md/.txt, then a preview. Nothing is
 * written until Create. With `into`, the tasks are appended to that plan.
 */
export function PlanImportSheet({ open, onClose, into }: { open: boolean; onClose: () => void; into?: Plan }) {
  return (
    <Sheet open={open} onClose={onClose} title={into ? `Add to ${into.name}` : 'Import a plan'}>
      {open && <Body into={into} onDone={onClose} />}
    </Sheet>
  );
}

function Body({ into, onDone }: { into?: Plan; onDone: () => void }) {
  const { today } = useData();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const read = (md: string) => {
    const p = parsePlanMarkdown(md, today);
    if (allTasks(p).length === 0) {
      setError('No tasks found. Tasks are checkbox lines like “- [ ] Write the README”.');
      return;
    }
    setError(null);
    setParsed(p);
  };

  if (parsed) return <Preview parsed={parsed} into={into} onBack={() => setParsed(null)} onDone={onDone} />;

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div>
        <Label htmlFor="plan-md">Paste the plan’s Markdown</Label>
        <textarea
          id="plan-md"
          rows={9}
          className={cx(inputClass, 'h-auto py-2.5 font-mono text-[13px]')}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder={'# My plan\n\n## Week 1\n- [ ] **Mon Oct 19:** First task\n- [ ] **Tue Oct 20:** Second task\n\n**Checkpoint:** what done looks like'}
        />
        {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
        <p className="mt-1.5 text-[13px] text-ink-3">
          ## headings become sections, checkbox lines become tasks, a bold date at the start sets a task’s date, and **Checkpoint:** lines become checkpoints. Everything else is ignored.
        </p>
      </div>
      <Button variant="primary" disabled={!text.trim()} onClick={() => read(text)}>Preview</Button>
      <input
        ref={file}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const md = await f.text();
          setText(md);
          read(md);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" onClick={() => file.current?.click()}><FileUp size={16} /> Or choose a .md or .txt file</Button>
    </div>
  );
}

function Preview({ parsed, into, onBack, onDone }: { parsed: ParsedPlan; into?: Plan; onBack: () => void; onDone: () => void }) {
  const { uid, today, tz } = useData();
  const { plans, sectionsOf, tasksOf } = usePlans();
  const toast = useToast();
  const summary = useMemo(() => summarize(parsed, today), [parsed, today]);
  const [fields, setFields] = useState<PlanFields>(() => ({
    ...defaultPlanFields(today, plans.map((p) => p.color.toLowerCase())),
    name: parsed.name ?? '',
    startDate: summary.startDate,
    deadline: summary.deadline,
    schedule: summary.schedule,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openSection, setOpenSection] = useState<number | null>(null);
  const warnings = planWarnings(parsed, into?.schedule ?? fields.schedule);
  const range = summary.first && summary.last ? `${formatLocalDate(summary.first, 'd MMM')} – ${formatLocalDate(summary.last, 'd MMM')}` : 'no dates';
  const counts = [
    summary.sections ? `${summary.sections} ${summary.sections === 1 ? 'section' : 'sections'}` : null,
    `${summary.tasks} ${summary.tasks === 1 ? 'task' : 'tasks'}`,
    summary.checkpoints ? `${summary.checkpoints} ${summary.checkpoints === 1 ? 'checkpoint' : 'checkpoints'}` : null,
    range,
    scheduleLabel(into?.schedule ?? fields.schedule),
  ].filter(Boolean).join(' · ');

  const create = () => {
    if (into) {
      const sections = sectionsOf(into.id);
      const loose = tasksOf(into.id).filter((t) => t.sectionId === null);
      const docs = docsFromParsed(parsed, into, tz, {
        sectionOrder: sections.reduce((m, s) => Math.max(m, s.order), -1),
        looseOrder: loose.reduce((m, t) => Math.max(m, t.order), -1),
      });
      appendToPlan(uid, docs.sections, docs.tasks);
      toast(`Added ${docs.tasks.length} ${docs.tasks.length === 1 ? 'task' : 'tasks'}`, {
        label: 'Undo',
        run: () => deleteParts(uid, docs.sections.map((s) => s.id), docs.tasks.map((t) => t.id)),
      });
      onDone();
      return;
    }
    const errs = validatePlanFields(fields);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const now = nowIso();
    const plan: Plan = { ...fields, name: fields.name.trim(), id: uuid(), archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null };
    const docs = docsFromParsed(parsed, plan, tz);
    createPlan(uid, { plan, ...docs });
    toast(`${plan.name} created`, { label: 'Undo', run: () => { deletePlan(uid, plan.id, docs.sections.map((s) => s.id), docs.tasks.map((t) => t.id)); } });
    onDone();
  };

  return (
    <div className="mt-2 flex flex-col gap-5">
      <p className="rounded-lg bg-s2 px-3 py-2.5 text-[14px]" data-testid="plan-preview-counts">{counts}</p>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Warnings">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 text-[13px] text-ink-2">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Tasks">
        <ul className="divide-y divide-line border-y border-line">
          {parsed.loose.length > 0 && <PreviewGroup title="Not in a section" tasks={parsed.loose} open={openSection === -1} onToggle={() => setOpenSection(openSection === -1 ? null : -1)} />}
          {parsed.sections.map((s, i) => (
            <PreviewGroup key={i} title={s.title} checkpoint={s.checkpoint} tasks={s.tasks} open={openSection === i} onToggle={() => setOpenSection(openSection === i ? null : i)} />
          ))}
        </ul>
      </section>

      {!into && <PlanFieldsForm value={fields} onChange={setFields} errors={errors} />}

      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={create}>{into ? `Add ${summary.tasks} ${summary.tasks === 1 ? 'task' : 'tasks'}` : 'Create'}</Button>
        <Button onClick={onBack}>Back to the text</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function PreviewGroup({ title, checkpoint, tasks, open, onToggle }: { title: string; checkpoint?: string | null; tasks: ParsedPlan['loose']; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium"><Inline text={title} /></span>
          <span className="block text-[12px] text-ink-3">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}{checkpoint ? ' · checkpoint' : ''}</span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ol className="pb-2 text-[13px]">
          {tasks.map((t, i) => (
            <li key={i} className="flex gap-2 py-1">
              <span className="w-14 shrink-0 text-ink-3">{t.date ? formatLocalDate(t.date, 'EEE d') : '–'}</span>
              <span className={cx('min-w-0 flex-1', t.done && 'text-ink-3 line-through')}><Inline text={t.title} /></span>
            </li>
          ))}
          {checkpoint && <li className="py-1 text-ink-2"><span className="font-medium">Checkpoint:</span> <Inline text={checkpoint} /></li>}
        </ol>
      )}
    </li>
  );
}

import { setDoc, updateDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { MAX_BATCH, fire, paths } from './repo';
import { uuid } from './device';
import { instantAt, nowIso } from './dates';
import type { ParsedPlan, ParsedTask } from './planMarkdown';
import type { Plan, PlanSection, PlanTask } from './types';

/*
 * Every Plan write. Like repo.ts, none is awaited: each commits to the local
 * cache at once and syncs later, so ticking and importing work offline.
 * Deletes are soft (deletedAt), so Undo can bring things back and a restore
 * from backup never resurrects them.
 */

type Write = [DocumentReference, object];

function commit(writes: Write[], mode: 'set' | 'update' = 'set'): void {
  for (let i = 0; i < writes.length; i += MAX_BATCH) {
    const batch = writeBatch(db);
    for (const [ref, data] of writes.slice(i, i + MAX_BATCH)) {
      if (mode === 'set') batch.set(ref, data);
      else batch.update(ref, data);
    }
    fire(batch.commit());
  }
}

// ── Building from Markdown ─────────────────────────────────────────────────

export interface PlanDocs {
  plan: Plan;
  sections: PlanSection[];
  tasks: PlanTask[];
}

/**
 * Docs for parsed Markdown. Pure: `tz` only dates the done time of tasks
 * imported as already done ([x]): their target day at noon, or now.
 * `after` continues an existing plan ("Append from Markdown"): new sections
 * and loose tasks go after what's there.
 */
export function docsFromParsed(
  parsed: ParsedPlan,
  plan: Plan,
  tz: string,
  after?: { sectionOrder: number; looseOrder: number },
): { sections: PlanSection[]; tasks: PlanTask[] } {
  const now = nowIso();
  const task = (t: ParsedTask, sectionId: string | null, order: number): PlanTask => ({
    id: uuid(),
    planId: plan.id,
    sectionId,
    order,
    title: t.title,
    details: t.details,
    targetDate: t.date,
    doneAt: t.done ? (t.date ? instantAt(t.date, '12:00:00', tz).toISOString() : now) : null,
    note: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const base = after?.looseOrder ?? -1;
  const tasks = parsed.loose.map((t, i) => task(t, null, base + 1 + i));
  const sections = parsed.sections.map((s, i): PlanSection => {
    const id = uuid();
    tasks.push(...s.tasks.map((t, j) => task(t, id, j)));
    return {
      id, planId: plan.id, title: s.title, order: (after?.sectionOrder ?? -1) + 1 + i,
      checkpoint: s.checkpoint, checkpointDoneAt: null, createdAt: now, updatedAt: now, deletedAt: null,
    };
  });
  return { sections, tasks };
}

// ── Plans ──────────────────────────────────────────────────────────────────

/** The plan goes first, so nothing lands before it. */
export function createPlan(uid: string, docs: PlanDocs): void {
  commit([
    [paths.plan(uid, docs.plan.id), docs.plan],
    ...docs.sections.map((s): Write => [paths.planSection(uid, s.id), s]),
    ...docs.tasks.map((t): Write => [paths.planTask(uid, t.id), t]),
  ]);
}

export function appendToPlan(uid: string, sections: PlanSection[], tasks: PlanTask[]): void {
  commit([
    ...sections.map((s): Write => [paths.planSection(uid, s.id), s]),
    ...tasks.map((t): Write => [paths.planTask(uid, t.id), t]),
  ]);
}

/** Undo of an append: the added sections and tasks go, the plan stays. */
export function deleteParts(uid: string, sectionIds: string[], taskIds: string[]): void {
  const now = nowIso();
  commit([
    ...sectionIds.map((id): Write => [paths.planSection(uid, id), { deletedAt: now, updatedAt: now }]),
    ...taskIds.map((id): Write => [paths.planTask(uid, id), { deletedAt: now, updatedAt: now }]),
  ], 'update');
}

/** Field-level, so an edit here and a different one elsewhere both land. */
export function updatePlan(uid: string, id: string, patch: Partial<Omit<Plan, 'id' | 'createdAt'>>): void {
  fire(updateDoc(paths.plan(uid, id), { ...patch, updatedAt: nowIso() }));
}

export function setPlanArchived(uid: string, id: string, archived: boolean): void {
  updatePlan(uid, id, { archivedAt: archived ? nowIso() : null });
}

/** The plan, its sections and tasks, in one go. Returns the undo. */
export function deletePlan(uid: string, planId: string, sectionIds: string[], taskIds: string[]): () => void {
  const mark = (deletedAt: string | null): void => {
    const updatedAt = nowIso();
    commit([
      [paths.plan(uid, planId), { deletedAt, updatedAt }],
      ...sectionIds.map((id): Write => [paths.planSection(uid, id), { deletedAt, updatedAt }]),
      ...taskIds.map((id): Write => [paths.planTask(uid, id), { deletedAt, updatedAt }]),
    ], 'update');
  };
  mark(nowIso());
  return () => mark(null);
}

/**
 * Push remaining: new target dates for undone tasks (and maybe the deadline).
 * Returns the undo, which puts the old ones back.
 */
export function pushPlan(uid: string, plan: Plan, dates: Map<string, string>, deadline: string, tasks: PlanTask[]): () => void {
  const now = nowIso();
  const before = tasks.filter((t) => dates.has(t.id)).map((t) => [t.id, t.targetDate] as const);
  commit([
    ...(deadline !== plan.deadline ? [[paths.plan(uid, plan.id), { deadline, updatedAt: now }] as Write] : []),
    ...[...dates].map(([id, d]): Write => [paths.planTask(uid, id), { targetDate: d, updatedAt: now }]),
  ], 'update');
  return () => {
    const at = nowIso();
    commit([
      ...(deadline !== plan.deadline ? [[paths.plan(uid, plan.id), { deadline: plan.deadline, updatedAt: at }] as Write] : []),
      ...before.map(([id, d]): Write => [paths.planTask(uid, id), { targetDate: d, updatedAt: at }]),
    ], 'update');
  };
}

// ── Tasks ──────────────────────────────────────────────────────────────────

/** Ticking twice gives the same result; two devices ticking different tasks touch different docs. */
export function setTaskDone(uid: string, id: string, done: boolean, note?: string | null): void {
  fire(updateDoc(paths.planTask(uid, id), { doneAt: done ? nowIso() : null, ...(note !== undefined ? { note } : {}), updatedAt: nowIso() }));
}

/** Puts back an exact done time (Undo of an untick). */
export function restoreTaskDone(uid: string, id: string, doneAt: string | null): void {
  fire(updateDoc(paths.planTask(uid, id), { doneAt, updatedAt: nowIso() }));
}

export function updateTask(uid: string, id: string, patch: Partial<Pick<PlanTask, 'title' | 'details' | 'targetDate' | 'note' | 'sectionId' | 'order' | 'doneAt'>>): void {
  fire(updateDoc(paths.planTask(uid, id), { ...patch, updatedAt: nowIso() }));
}

export function addTask(uid: string, fields: Pick<PlanTask, 'planId' | 'sectionId' | 'order' | 'title' | 'details' | 'targetDate'>): string {
  const now = nowIso();
  const task: PlanTask = { ...fields, id: uuid(), doneAt: null, note: null, createdAt: now, updatedAt: now, deletedAt: null };
  fire(setDoc(paths.planTask(uid, task.id), task));
  return task.id;
}

export function setTaskDeleted(uid: string, id: string, deleted: boolean): void {
  fire(updateDoc(paths.planTask(uid, id), { deletedAt: deleted ? nowIso() : null, updatedAt: nowIso() }));
}

/** New positions (and sections) for several tasks at once: a drag, or a move to another section. */
export function placeTasks(uid: string, places: { id: string; sectionId: string | null; order: number }[]): void {
  const now = nowIso();
  commit(places.map((p): Write => [paths.planTask(uid, p.id), { sectionId: p.sectionId, order: p.order, updatedAt: now }]), 'update');
}

// ── Sections ───────────────────────────────────────────────────────────────

export function addSection(uid: string, planId: string, title: string, order: number): string {
  const now = nowIso();
  const s: PlanSection = { id: uuid(), planId, title, order, checkpoint: null, checkpointDoneAt: null, createdAt: now, updatedAt: now, deletedAt: null };
  fire(setDoc(paths.planSection(uid, s.id), s));
  return s.id;
}

export function updateSection(uid: string, id: string, patch: Partial<Pick<PlanSection, 'title' | 'order' | 'checkpoint' | 'checkpointDoneAt'>>): void {
  fire(updateDoc(paths.planSection(uid, id), { ...patch, updatedAt: nowIso() }));
}

export function placeSections(uid: string, ids: string[]): void {
  const now = nowIso();
  commit(ids.map((id, i): Write => [paths.planSection(uid, id), { order: i, updatedAt: now }]), 'update');
}

/**
 * Delete a section. Its tasks are either deleted with it or moved out of any
 * section (to the end of the loose tasks). Returns the undo.
 */
export function deleteSection(uid: string, section: PlanSection, tasks: PlanTask[], keepTasks: boolean, looseOrder: number): () => void {
  const now = nowIso();
  commit([
    [paths.planSection(uid, section.id), { deletedAt: now, updatedAt: now }],
    ...tasks.map((t, i): Write => [paths.planTask(uid, t.id), keepTasks ? { sectionId: null, order: looseOrder + 1 + i, updatedAt: now } : { deletedAt: now, updatedAt: now }]),
  ], 'update');
  return () => {
    const at = nowIso();
    commit([
      [paths.planSection(uid, section.id), { deletedAt: null, updatedAt: at }],
      ...tasks.map((t): Write => [paths.planTask(uid, t.id), { sectionId: t.sectionId, order: t.order, deletedAt: null, updatedAt: at }]),
    ], 'update');
  };
}

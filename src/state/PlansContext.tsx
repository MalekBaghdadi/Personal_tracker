import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { useData } from './DataContext';
import { paths } from '../lib/repo';
import { bySectionOrder, computePlan, type PlanResult } from '../lib/plans';
import type { Plan, PlanSection, PlanTask } from '../lib/types';

/*
 * Plans: three listeners (plans, sections, tasks; deleted ones left out) and
 * every figure derived in memory, like DataContext does for metrics. Wraps
 * the shell, so the timer's note prompt can offer the current task.
 */

interface Plans {
  /** Archived included. Nearest deadline first. */
  plans: Plan[];
  planById: Map<string, Plan>;
  /** planId → sections in order. */
  sectionsOf: (planId: string) => PlanSection[];
  /** planId → tasks (unordered; results carry them in order). */
  tasksOf: (planId: string) => PlanTask[];
  resultOf: (planId: string) => PlanResult<PlanTask>;
  /** Every non-deleted task, for History and export. */
  tasks: PlanTask[];
  sections: PlanSection[];
}

const Ctx = createContext<Plans | null>(null);

export function usePlans(): Plans {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlans outside PlansProvider');
  return v;
}

const NONE: never[] = [];

export function PlansProvider({ children }: { children: ReactNode }) {
  const { uid, today, dayOf } = useData();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sections, setSections] = useState<PlanSection[]>([]);
  const [tasks, setTasks] = useState<PlanTask[]>([]);

  useEffect(() => {
    const live = where('deletedAt', '==', null);
    const unsubs = [
      onSnapshot(query(paths.plans(uid), live), (snap) => setPlans(snap.docs.map((d) => d.data() as Plan)), (err) => console.error('[plans]', err)),
      onSnapshot(query(paths.planSections(uid), live), (snap) => setSections(snap.docs.map((d) => d.data() as PlanSection)), (err) => console.error('[planSections]', err)),
      onSnapshot(query(paths.planTasks(uid), live), (snap) => setTasks(snap.docs.map((d) => d.data() as PlanTask)), (err) => console.error('[planTasks]', err)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const value = useMemo<Plans>(() => {
    const sorted = [...plans].sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt));
    const secBy = new Map<string, PlanSection[]>();
    for (const s of sections) secBy.set(s.planId, [...(secBy.get(s.planId) ?? []), s]);
    for (const list of secBy.values()) list.sort(bySectionOrder);
    const taskBy = new Map<string, PlanTask[]>();
    for (const t of tasks) taskBy.set(t.planId, [...(taskBy.get(t.planId) ?? []), t]);
    const results = new Map<string, PlanResult<PlanTask>>();
    for (const p of sorted) results.set(p.id, computePlan(p, secBy.get(p.id) ?? NONE, taskBy.get(p.id) ?? NONE, today, dayOf));
    return {
      plans: sorted,
      planById: new Map(sorted.map((p) => [p.id, p])),
      sectionsOf: (id) => secBy.get(id) ?? NONE,
      tasksOf: (id) => taskBy.get(id) ?? NONE,
      resultOf: (id) => results.get(id) ?? computePlan({ startDate: today, deadline: today, schedule: { kind: 'daily' } }, NONE, NONE, today, dayOf),
      tasks,
      sections,
    };
  }, [plans, sections, tasks, today, dayOf]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

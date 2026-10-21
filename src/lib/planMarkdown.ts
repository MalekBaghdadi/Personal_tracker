import { addDays, weekdayOf } from './dates';
import { isScheduled } from './streaks';
import { scheduleFromDates } from './plans';
import type { Schedule } from './types';

/*
 * Markdown → a Plan, in the browser. Understands only:
 *   # Title                 the default plan name (the first one)
 *   ## Heading              a section (dropped if nothing is under it)
 *   - [ ] text / * [ ] text an undone task; - [x] a done one
 *   **Mon Oct 19:** text    a target date at the start of a task
 *   indented lines          that task's details
 *   **Checkpoint:** text    the section's checkpoint
 * Everything else (tables, paragraphs, code blocks, other headings) is ignored,
 * unless no task is found outside code blocks: then the fences are dropped, so a
 * plan pasted inside the code block an AI chat wrapped it in still reads.
 * Pure module, unit-tested against the Uptime Monitor plan.
 */

export interface ParsedTask {
  title: string;
  details: string | null;
  date: string | null;
  done: boolean;
}

export interface ParsedSection {
  title: string;
  checkpoint: string | null;
  tasks: ParsedTask[];
}

export interface ParsedPlan {
  name: string | null;
  /** Tasks before the first section heading. */
  loose: ParsedTask[];
  sections: ParsedSection[];
  /** Checkbox-looking lines that couldn't be read, as written. */
  unreadable: string[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAY = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?';
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

/** A date written by hand, without its year resolved: month 1–12, day, and the year if given. */
interface LooseDate { y: number | null; m: number; d: number }

/** "Mon Oct 19", "Oct 19", "19 Oct", "Monday, 19 October 2026", "2026-10-19". A weekday alone isn't a date. */
export function readDate(raw: string): LooseDate | null {
  const s = raw.trim().replace(/[:.,]+$/, '').trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = new RegExp(`^(?:${WEEKDAY}\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`).exec(s);
  if (m) return valid(m[3] ? +m[3] : null, monthOf(m[1]), +m[2]);
  m = new RegExp(`^(?:${WEEKDAY}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?$`).exec(s);
  if (m) return valid(m[3] ? +m[3] : null, monthOf(m[2]), +m[1]);
  return null;
}

function monthOf(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3)) + 1;
}

function valid(y: number | null, m: number, d: number): LooseDate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, '0');

const TASK = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
// "- [] x", "-[ ] x", "- [-] x": meant as checkboxes, but not ones we read.
const CHECKBOXISH = /^\s*[-*+]?\s*\[[^\]]{0,2}\]/;
const SECTION = /^##\s+(.+?)\s*#*\s*$/;
const TITLE = /^#\s+(.+?)\s*#*\s*$/;
const CHECKPOINT = /^\s*(?:[-*+]\s+)?(?:\*\*|__)checkpoint:?(?:\*\*|__):?\s*(.*)$/i;
const BOLD_LEAD = /^(?:\*\*|__)(.+?)(?:\*\*|__)\s*[:–—-]?\s*/;

/** Long text: the first sentence becomes the title, the rest the details. */
function splitSentence(text: string): [string, string | null] {
  if (text.length <= 80) return [text, null];
  // A sentence end outside `code`, followed by more text.
  let inCode = false;
  for (let i = 0; i < text.length - 1; i++) {
    const c = text[i];
    if (c === '`') inCode = !inCode;
    if (!inCode && (c === '.' || c === '!' || c === '?') && text[i + 1] === ' ' && i >= 12) {
      const rest = text.slice(i + 2).trim();
      // Not after an abbreviation like "e.g." or "i.e.".
      if (/\b(?:e\.g|i\.e|etc|vs|approx)\.$/i.test(text.slice(0, i + 1))) continue;
      if (rest) return [text.slice(0, i + 1), rest];
    }
  }
  return [text, null];
}

const FENCE = /^\s*(```|~~~)/;

export function parsePlanMarkdown(md: string, today: string): ParsedPlan {
  const p = parseLines(md, today);
  if (allTasks(p).length > 0 || !/^\s*(```|~~~)/m.test(md)) return p;
  return parseLines(md.split(/\r\n?|\n/).filter((l) => !FENCE.test(l)).join('\n'), today);
}

function parseLines(md: string, today: string): ParsedPlan {
  const out: ParsedPlan = { name: null, loose: [], sections: [], unreadable: [] };
  // Dates are kept loose until the end, when years are resolved in order.
  type Raw = { title: string; details: string[]; date: LooseDate | null; done: boolean; indent: number };
  const loose: Raw[] = [];
  const sections: { title: string; checkpoint: string | null; tasks: Raw[] }[] = [];
  let section: (typeof sections)[number] | null = null;
  let task: Raw | null = null;
  let inFence = false;

  for (const rawLine of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\t/g, '    ');
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    // Indented under a task: its details (sub-bullets included).
    if (task && indent > task.indent && !SECTION.test(line.trim()) && !CHECKPOINT.test(line)) {
      task.details.push(line.trim().replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '• '));
      continue;
    }

    let m = TITLE.exec(line);
    if (m && indent === 0) {
      out.name ??= m[1];
      task = null;
      continue;
    }
    m = SECTION.exec(line);
    if (m && indent === 0) {
      section = { title: m[1], checkpoint: null, tasks: [] };
      sections.push(section);
      task = null;
      continue;
    }
    if (/^#{3,}\s/.test(line.trim())) {
      task = null;
      continue;
    }
    m = CHECKPOINT.exec(line);
    if (m) {
      if (section && m[1].trim()) section.checkpoint = m[1].trim();
      task = null;
      continue;
    }
    m = TASK.exec(line);
    if (m) {
      let text = m[3].trim();
      let date: LooseDate | null = null;
      const lead = BOLD_LEAD.exec(text);
      if (lead) {
        const d = readDate(lead[1]);
        if (d) {
          date = d;
          text = text.slice(lead[0].length).trim();
        }
      }
      task = { title: text, details: [], date, done: m[2].toLowerCase() === 'x', indent: m[1].length };
      (section ? section.tasks : loose).push(task);
      continue;
    }
    if (CHECKBOXISH.test(line)) {
      out.unreadable.push(line.trim());
      task = null;
      continue;
    }
    // A paragraph, table row or anything else ends the task's details.
    task = null;
  }

  // Years: dates without one follow the first date's year (or this year),
  // rolling forward when the month goes backwards (Dec → Jan).
  let year = Number(today.slice(0, 4));
  const firstWithYear = [...loose, ...sections.flatMap((s) => s.tasks)].find((t) => t.date);
  if (firstWithYear?.date?.y) year = firstWithYear.date.y;
  let lastMonth = 0;
  const finish = (t: Raw): ParsedTask => {
    let date: string | null = null;
    if (t.date) {
      if (t.date.y) {
        year = t.date.y;
      } else if (t.date.m < lastMonth - 5) {
        year++;
      }
      lastMonth = t.date.m;
      date = `${t.date.y ?? year}-${pad(t.date.m)}-${pad(t.date.d)}`;
    }
    let title = t.title;
    let details = t.details.length ? t.details.join('\n') : null;
    if (!details) [title, details] = splitSentence(title);
    return { title, details, date, done: t.done };
  };
  out.loose = loose.map(finish);
  out.sections = sections
    .map((s) => ({ title: s.title, checkpoint: s.checkpoint, tasks: s.tasks.map(finish) }))
    // Headings with nothing under them (Overview, rules, costs…) aren't sections.
    .filter((s) => s.tasks.length > 0);
  return out;
}

/** The example inside the AI prompt, dated from `today`. Unit-tested to parse. */
export function promptExample(today: string): string {
  const d = (n: number) => addDays(today, n);
  return [
    '# Learn Spanish basics',
    '## Week 1: Sounds and greetings',
    `- [ ] **${d(0)}:** Learn the alphabet and vowel sounds`,
    '  - 20 minutes with a pronunciation video, then read a word list out loud',
    `- [ ] **${d(1)}:** Learn 20 greetings and polite phrases`,
    '**Checkpoint:** Introduce myself out loud without notes',
    '## Week 2: Present tense',
    `- [ ] **${d(7)}:** Conjugate the 10 most common regular verbs`,
  ].join('\n');
}

/**
 * A prompt to paste into any AI chat so that what it writes back is a plan
 * this parser reads. The goal goes last, where the cursor lands after pasting.
 */
export function planPrompt(today: string): string {
  return `I want a plan I can import into my tracker app. Help me break my goal into small tasks, about one per work day, then write the plan in the exact Markdown format below.

Today is ${today}. If I haven't said when I want to start, my deadline, or which days of the week I can work on it, ask me first, then write the plan.

Format rules (the app reads only these; anything else is ignored):
1. The first line is the plan's name: # Name
2. Group the tasks into sections with ## headings, for example ## Week 1: Setup. Every section needs at least one task.
3. Each task is one checkbox line that starts with its date in bold: - [ ] **YYYY-MM-DD:** Short task title
   - Write every date as YYYY-MM-DD, only on days I can work, in order.
   - Keep each title short (under 80 characters): one clear action.
   - Use - [x] instead of - [ ] for a task that's already done.
4. Put a task's details on lines indented by two spaces right under it, as plain text or "- " bullets. Never indent another checkbox line.
5. A section can end with one milestone line, not indented: **Checkpoint:** what should be done or working by then
6. No tables, numbered lists, ### headings or code blocks inside the plan.

Send the whole plan inside one Markdown code block so I can copy it in one go, with nothing else inside the block.

Example (only the format matters, not the content):
${promptExample(today)}

My goal: `;
}

export interface PlanSummary {
  tasks: number;
  sections: number;
  checkpoints: number;
  dated: number;
  first: string | null;
  last: string | null;
  /** Defaults for the preview (all editable). */
  startDate: string;
  deadline: string;
  schedule: Schedule;
}

export function allTasks(p: ParsedPlan): ParsedTask[] {
  return [...p.loose, ...p.sections.flatMap((s) => s.tasks)];
}

export function summarize(p: ParsedPlan, today: string): PlanSummary {
  const tasks = allTasks(p);
  const dates = tasks.map((t) => t.date).filter((d): d is string => !!d);
  const sorted = [...dates].sort();
  const first = sorted[0] ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const startDate = first ?? today;
  return {
    tasks: tasks.length,
    sections: p.sections.length,
    checkpoints: p.sections.filter((s) => s.checkpoint).length,
    dated: dates.length,
    first,
    last,
    startDate,
    // With no dates, a default four weeks to edit.
    deadline: last ?? addDays(startDate, 27),
    schedule: scheduleFromDates(dates),
  };
}

/** Things worth a second look before creating the plan. */
export function planWarnings(p: ParsedPlan, schedule: Schedule): string[] {
  const tasks = allTasks(p);
  const out: string[] = [];
  const dated = tasks.filter((t) => t.date);
  const undated = tasks.length - dated.length;
  if (dated.length > 0 && undated > 0) out.push(`${undated} ${undated === 1 ? 'task has' : 'tasks have'} no date while others do. They’re spread over the days around them.`);
  let outOfOrder = 0;
  for (let i = 1; i < dated.length; i++) if (dated[i].date! < dated[i - 1].date!) outOfOrder++;
  if (outOfOrder) out.push(`${outOfOrder} ${outOfOrder === 1 ? 'date is' : 'dates are'} earlier than the task before ${outOfOrder === 1 ? 'it' : 'them'}.`);
  const seen = new Map<string, number>();
  for (const t of dated) seen.set(t.date!, (seen.get(t.date!) ?? 0) + 1);
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  if (dupes) out.push(`${dupes} ${dupes === 1 ? 'date has' : 'dates have'} more than one task.`);
  const off = dated.filter((t) => !isScheduled(schedule, t.date!)).length;
  if (off) out.push(`${off} ${off === 1 ? 'task falls' : 'tasks fall'} on ${off === 1 ? 'a day' : 'days'} outside the schedule (${dated.filter((t) => !isScheduled(schedule, t.date!)).slice(0, 2).map((t) => weekdayName(t.date!)).join(', ')}).`);
  if (p.unreadable.length) out.push(`${p.unreadable.length} checkbox ${p.unreadable.length === 1 ? 'line' : 'lines'} couldn’t be read: “${p.unreadable[0].slice(0, 60)}”${p.unreadable.length > 1 ? '…' : ''}`);
  return out;
}

function weekdayName(d: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayOf(d)];
}

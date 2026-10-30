import type { Entry, Review } from './types';

/*
 * Phrase metrics: pure logic for the review half. A phrase is an entry of a
 * 'phrase' metric (value 1, `text`, `reference`). Each day with an older
 * phrase to review owes one review (a Review doc); the day only counts once
 * it has one. Picking what to review, scoring a recall and building the
 * fill-in-the-blanks all live here so they can be tested without React.
 */

/** A recall at or above this share of words counts as remembered. */
export const REMEMBERED = 0.8;
/** Below this the phrase is shaky and comes up sooner. */
export const SHAKY = 0.6;

// ── Words ──────────────────────────────────────────────────────────────────

/** Arabic marks (tashkeel, small signs, tatweel) and the combining marks NFKD leaves behind. */
const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/**
 * What makes two spellings "the same word" when you type from memory: no case,
 * accents, punctuation, Arabic diacritics, and the alef/ya/ta-marbuta variants a
 * phone keyboard swaps freely. Empty for a token that is only punctuation.
 */
export function wordKey(word: string): string {
  return word
    .normalize('NFKD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/[ٱآأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export interface Word {
  /** As written, punctuation included. */
  raw: string;
  /** wordKey(raw); empty when the token is only punctuation (it is shown, never asked or scored). */
  key: string;
}

export function wordsOf(text: string): Word[] {
  return text.trim().split(/\s+/).filter(Boolean).map((raw) => ({ raw, key: wordKey(raw) }));
}

/** Number of words that count (punctuation-only tokens don't). */
export function wordCount(text: string): number {
  return wordsOf(text).filter((w) => w.key).length;
}

function distanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word, allowing one slip (a dropped or swapped letter) in words of five letters or more. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && distanceAtMostOne(a, b);
}

export interface Recall {
  /** Share of the phrase's words found, in order (0–1). */
  score: number;
  /** For each counted word of the phrase, in order: was it recalled. */
  matched: boolean[];
}

/**
 * How much of `phrase` the attempt got, comparing words in order (the longest
 * common run, so an extra or forgotten word in the middle costs only itself).
 */
export function recall(phrase: string, attempt: string): Recall {
  const target = wordsOf(phrase).filter((w) => w.key).map((w) => w.key);
  const said = wordsOf(attempt).filter((w) => w.key).map((w) => w.key);
  if (target.length === 0) return { score: 0, matched: [] };
  const n = target.length;
  const m = said.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = sameWord(target[i], said[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (sameWord(target[i], said[j]) && table[i][j] === table[i + 1][j + 1] + 1) {
      matched[i] = true;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return { score: table[0][0] / n, matched };
}

// ── Fill in the blanks ─────────────────────────────────────────────────────

export type BlankLevel = 'few' | 'half' | 'most';
export const BLANK_SHARE: Record<BlankLevel, number> = { few: 0.25, half: 0.5, most: 0.8 };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which words (indices into `wordsOf(text)`) to hide. At least one, at most all of
 * the counted words; the same seed gives the same blanks, so re-rendering never
 * moves them.
 */
export function chooseBlanks(words: Word[], level: BlankLevel, seed: number): Set<number> {
  const candidates = words.map((w, i) => (w.key ? i : -1)).filter((i) => i >= 0);
  const want = Math.max(1, Math.min(candidates.length, Math.round(candidates.length * BLANK_SHARE[level])));
  const rand = rng(seed);
  const pool = [...candidates];
  const out = new Set<number>();
  while (out.size < want && pool.length) out.add(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** Share of the blanks filled in correctly. */
export function gradeBlanks(words: Word[], blanks: Set<number>, answers: Record<number, string>): number {
  if (blanks.size === 0) return 0;
  let right = 0;
  for (const i of blanks) if (sameWord(words[i].key, wordKey(answers[i] ?? ''))) right++;
  return right / blanks.size;
}

/** The first `count` words as written, for the "reveal next word" help. */
export function revealed(text: string, count: number): string {
  return wordsOf(text).slice(0, Math.max(0, count)).map((w) => w.raw).join(' ');
}

/** A stable number from a string (an entry id), to seed the blanks. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── What is owed, and what to review ───────────────────────────────────────

/** Entries of this metric that are phrases, oldest first. */
export function phrasesOf(entries: Entry[], metricId: string): Entry[] {
  return entries
    .filter((e) => e.metricId === metricId && typeof e.text === 'string' && e.text.trim() !== '')
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.occurredAt.localeCompare(b.occurredAt));
}

/**
 * Whether a review is owed on `day`: a phrase from an earlier day exists to
 * review. `firstDay` is the date of the metric's oldest phrase. Before that
 * (and on the first phrase day itself) there's nothing to review, so the
 * day isn't held up.
 */
export function reviewOwed(firstDay: string | null, day: string): boolean {
  return firstDay !== null && firstDay < day;
}

/** The phrases that can be picked for a review on `day`: those from earlier days. */
export function reviewPool(phrases: Entry[], day: string): Entry[] {
  return phrases.filter((e) => e.localDate < day);
}

export interface PhraseHistory {
  count: number;
  last: Review | null;
}

export function historyByPhrase(reviews: Review[]): Map<string, PhraseHistory> {
  const out = new Map<string, PhraseHistory>();
  for (const r of reviews) {
    const h = out.get(r.entryId) ?? { count: 0, last: null };
    h.count++;
    if (!h.last || r.createdAt > h.last.createdAt) h.last = r;
    out.set(r.entryId, h);
  }
  return out;
}

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** How likely a phrase is to be picked: never reviewed or long ago, or shaky last time, count for more. */
export function weightOf(h: PhraseHistory | undefined, day: string): number {
  if (!h?.last) return 7;
  const gap = Math.max(0, dayNumber(day) - dayNumber(h.last.localDate));
  const shaky = h.last.mode === 'type' && h.last.score != null && h.last.score < SHAKY;
  const w = 1 + Math.min(gap, 60) / 6 + (shaky ? 5 : 0);
  // Already seen today: leave it for another day unless it's all there is.
  return gap === 0 ? w * 0.1 : w;
}

/**
 * A random phrase from the pool, favouring ones not reviewed for longest or
 * recalled badly. `avoid` skips one (the "show me another" button) unless it
 * is the only choice.
 */
export function pickPhrase(pool: Entry[], history: Map<string, PhraseHistory>, day: string, rand: () => number, avoid?: string): Entry | null {
  const options = pool.length > 1 && avoid ? pool.filter((e) => e.id !== avoid) : pool;
  if (options.length === 0) return null;
  const weights = options.map((e) => weightOf(history.get(e.id), day));
  let roll = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll < 0) return options[i];
  }
  return options[options.length - 1];
}

/**
 * The carousel's shuffle: a random phrase not yet shown this round (`seen`, in
 * the order shown). Once all are shown the round restarts, and its first pick
 * never repeats the last one shown. Phrases added mid-round join it; deleted
 * ones are ignored. Null when there is nothing to show.
 */
export function drawPhrase(ids: string[], seen: ReadonlySet<string>, rand: () => number): { id: string; seen: Set<string> } | null {
  if (ids.length === 0) return null;
  let round = new Set(seen);
  let left = ids.filter((id) => !round.has(id));
  if (left.length === 0) {
    const last = [...seen].pop();
    round = new Set();
    left = ids.length > 1 ? ids.filter((id) => id !== last) : ids;
  }
  const id = left[Math.floor(rand() * left.length)];
  return { id, seen: round.add(id) };
}

/** Base seconds on screen per pace; the carousel adds time for the length of the phrase. */
export const CAROUSEL_BASE_S = { fast: 6, normal: 10, slow: 16 } as const;

/** How long the carousel keeps a phrase up: the pace's base plus 40ms a character so a long one can be read. */
export function dwellMs(text: string, pace: keyof typeof CAROUSEL_BASE_S): number {
  return CAROUSEL_BASE_S[pace] * 1000 + text.length * 40;
}

/** What a recall score says: "Word perfect", "Remembered", "Needs another look". */
export function verdictOf(score: number): string {
  return score >= 1 ? 'Word perfect' : score >= REMEMBERED ? 'Remembered' : 'Needs another look';
}

/** "Remembered 90%", "Needs another look · 40%", "Reviewed": a review in words. */
export function describeReview(r: Pick<Review, 'mode' | 'score'>): string {
  if (r.mode === 'tap' || r.score == null) return 'Reviewed';
  const pct = Math.round(r.score * 100);
  if (r.score >= 1) return verdictOf(r.score);
  return r.score >= REMEMBERED ? `${verdictOf(r.score)} ${pct}%` : `${verdictOf(r.score)} · ${pct}%`;
}

/** Search text for the collection: phrase and reference, ignoring case and Arabic marks. */
export function matchesSearch(e: Pick<Entry, 'text' | 'reference'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const plain = (s: string) => s.normalize('NFKD').replace(MARKS, '').toLowerCase();
  return plain(`${e.text ?? ''} ${e.reference ?? ''}`).includes(plain(q));
}

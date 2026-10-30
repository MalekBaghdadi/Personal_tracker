import { describe, expect, it } from 'vitest';
import {
  chooseBlanks, describeReview, gradeBlanks, historyByPhrase, matchesSearch, pickPhrase, phrasesOf, recall, reviewOwed, reviewPool,
  revealed, sameWord, seedOf, wordCount, wordKey, wordsOf, weightOf,
} from './phrases';
import { buildDayStats } from './admin';
import { computeStreaks, isHitDay } from './streaks';
import { evaluate } from './achievements';
import { planImport } from './importer';
import { dayOf } from './dates';
import type { Entry, Metric, Review } from './types';

const metric = (over: Partial<Metric> = {}): Metric => ({
  id: 'q',
  name: 'Ahadeeth',
  type: 'phrase',
  unit: 'phrases',
  target: 1,
  targetDirection: 'at_least',
  targetMin: null,
  schedule: { kind: 'daily' },
  timerEnabled: false,
  quickAdd: [],
  color: '#6690E6',
  icon: 'Quote',
  theme: 'wisdom',
  order: 0,
  archivedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '',
  ...over,
});

let n = 0;
const phrase = (localDate: string, text: string, over: Partial<Entry> = {}): Entry => ({
  id: `p${n++}`,
  metricId: 'q',
  localDate,
  value: 1,
  source: 'manual',
  note: null,
  text,
  reference: null,
  occurredAt: `${localDate}T12:00:00.000Z`,
  createdAt: `${localDate}T12:00:00.000Z`,
  updatedAt: '',
  deletedAt: null,
  ...over,
});

const review = (localDate: string, entryId: string, over: Partial<Review> = {}): Review => ({
  id: `r${n++}`,
  metricId: 'q',
  entryId,
  localDate,
  mode: 'tap',
  style: null,
  score: null,
  hints: 0,
  words: 5,
  createdAt: `${localDate}T13:00:00.000Z`,
  updatedAt: '',
  deletedAt: null,
  ...over,
});

describe('words', () => {
  it('ignore case, punctuation and accents', () => {
    expect(wordKey('Actions,')).toBe('actions');
    expect(wordKey('“Café”')).toBe('cafe');
    expect(wordsOf('Actions are — by intentions.').map((w) => w.key)).toEqual(['actions', 'are', '', 'by', 'intentions']);
    expect(wordCount('Actions are — by intentions.')).toBe(4);
  });
  it('ignore Arabic diacritics and the usual keyboard swaps', () => {
    expect(wordKey('إِنَّمَا')).toBe(wordKey('انما'));
    expect(wordKey('الْأَعْمَالُ')).toBe(wordKey('الاعمال'));
    expect(wordKey('نِيَّةٌ')).toBe(wordKey('نيه'));
    expect(wordKey('مصطفى')).toBe(wordKey('مصطفي'));
  });
  it('allow one slip in a longer word, never in a short one', () => {
    expect(sameWord('intentions', 'intenttions')).toBe(true);
    expect(sameWord('intentions', 'intension')).toBe(false);
    expect(sameWord('cat', 'cut')).toBe(false);
  });
});

describe('recall', () => {
  const text = 'Actions are judged by intentions';
  it('is perfect for the same words, however written', () => {
    expect(recall(text, 'actions ARE judged, by intentions!').score).toBe(1);
  });
  it('counts only the words found in order', () => {
    const r = recall(text, 'actions judged by');
    expect(r.score).toBeCloseTo(3 / 5);
    expect(r.matched).toEqual([true, false, true, true, false]);
  });
  it('an extra word costs nothing, a swapped order costs the odd one out', () => {
    expect(recall(text, 'actions are really judged by intentions').score).toBe(1);
    expect(recall(text, 'intentions actions are judged by').score).toBeCloseTo(4 / 5);
  });
  it('is zero for nothing, or for an empty phrase', () => {
    expect(recall(text, '').score).toBe(0);
    expect(recall('', 'anything').score).toBe(0);
  });
});

describe('blanks', () => {
  const words = wordsOf('Actions are judged by their intentions, and everyone gets what they intended.');
  it('hide a share of the words, at least one, never punctuation', () => {
    const few = chooseBlanks(words, 'few', 7);
    const most = chooseBlanks(words, 'most', 7);
    expect(words).toHaveLength(12);
    expect(few.size).toBe(3);
    expect(most.size).toBe(10);
    expect(chooseBlanks(wordsOf('Hello'), 'few', 1).size).toBe(1);
    expect(chooseBlanks(wordsOf('— —'), 'half', 1).size).toBe(0);
    for (const i of most) expect(words[i].key).not.toBe('');
  });
  it('are the same for the same seed', () => {
    expect([...chooseBlanks(words, 'half', seedOf('abc'))]).toEqual([...chooseBlanks(words, 'half', seedOf('abc'))]);
  });
  it('grade the share of blanks filled correctly', () => {
    const blanks = new Set([0, 2]);
    expect(gradeBlanks(words, blanks, { 0: 'actions', 2: 'Judged' })).toBe(1);
    expect(gradeBlanks(words, blanks, { 0: 'actions', 2: 'wrong' })).toBe(0.5);
    expect(gradeBlanks(words, blanks, {})).toBe(0);
  });
  it('reveal the first words as written', () => {
    expect(revealed('Actions are judged by intentions', 2)).toBe('Actions are');
    expect(revealed('Actions are', 9)).toBe('Actions are');
  });
});

describe('what a review is owed on', () => {
  it('needs a phrase from an earlier day', () => {
    expect(reviewOwed(null, '2026-10-10')).toBe(false);
    expect(reviewOwed('2026-10-10', '2026-10-10')).toBe(false);
    expect(reviewOwed('2026-10-10', '2026-10-11')).toBe(true);
  });
  it('picks only from phrases before the day', () => {
    const list = phrasesOf([phrase('2026-10-12', 'b'), phrase('2026-10-10', 'a'), phrase('2026-10-13', 'c')], 'q');
    expect(list.map((e) => e.text)).toEqual(['a', 'b', 'c']);
    expect(reviewPool(list, '2026-10-13').map((e) => e.text)).toEqual(['a', 'b']);
    expect(reviewPool(list, '2026-10-10')).toEqual([]);
  });
});

describe('picking a phrase', () => {
  const a = phrase('2026-10-01', 'a');
  const b = phrase('2026-10-02', 'b');
  const c = phrase('2026-10-03', 'c');
  it('favours never-reviewed, long-ago and shaky phrases', () => {
    const history = historyByPhrase([
      review('2026-10-09', a.id, { mode: 'type', score: 1 }),
      review('2026-10-05', b.id, { mode: 'type', score: 0.2 }),
    ]);
    const day = '2026-10-10';
    expect(weightOf(undefined, day)).toBeGreaterThan(weightOf(history.get(a.id), day));
    expect(weightOf(history.get(b.id), day)).toBeGreaterThan(weightOf(history.get(a.id), day));
    // Seen today: almost never again.
    expect(weightOf(history.get(a.id), '2026-10-09')).toBeLessThan(1);
  });
  it('can be steered by the roll and skips the one to avoid', () => {
    const pool = [a, b, c];
    const none = new Map();
    expect(pickPhrase(pool, none, '2026-10-10', () => 0)?.id).toBe(a.id);
    expect(pickPhrase(pool, none, '2026-10-10', () => 0.999)?.id).toBe(c.id);
    expect(pickPhrase(pool, none, '2026-10-10', () => 0, a.id)?.id).toBe(b.id);
    expect(pickPhrase([a], none, '2026-10-10', () => 0, a.id)?.id).toBe(a.id);
    expect(pickPhrase([], none, '2026-10-10', () => 0)).toBeNull();
  });
});

describe('describing a review', () => {
  it('says what happened', () => {
    expect(describeReview({ mode: 'tap', score: null })).toBe('Reviewed');
    expect(describeReview({ mode: 'type', score: 1 })).toBe('Word perfect');
    expect(describeReview({ mode: 'type', score: 0.9 })).toBe('Remembered 90%');
    expect(describeReview({ mode: 'type', score: 0.4 })).toBe('Needs another look · 40%');
  });
  it('search ignores case and Arabic marks, and looks at the source too', () => {
    const e = { text: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ', reference: 'Sahih al-Bukhari' };
    expect(matchesSearch(e, 'الاعمال')).toBe(true);
    expect(matchesSearch(e, 'BUKHARI')).toBe(true);
    expect(matchesSearch(e, 'muslim')).toBe(false);
    expect(matchesSearch(e, '  ')).toBe(true);
  });
});

describe('a phrase day counts only with its review', () => {
  const m = metric();
  const entries = [phrase('2026-10-10', 'one'), phrase('2026-10-11', 'two'), phrase('2026-10-12', 'three')];
  const stats = (reviews: Review[]) => buildDayStats(entries, [m], reviews).get('q')!;

  it('has no review owed on the first day, so adding is enough', () => {
    const s = stats([]);
    expect(s.get('2026-10-10')?.open).toBeUndefined();
    expect(isHitDay(m, '2026-10-10', s.get('2026-10-10'))).toBe(true);
  });
  it('is open on later days until a review is done that day', () => {
    const s = stats([review('2026-10-11', entries[0].id)]);
    expect(s.get('2026-10-11')?.open).toBeUndefined();
    expect(s.get('2026-10-12')?.open).toBe(true);
    expect(isHitDay(m, '2026-10-11', s.get('2026-10-11'))).toBe(true);
    expect(isHitDay(m, '2026-10-12', s.get('2026-10-12'))).toBe(false);
  });
  it('a review on another day does not help', () => {
    const s = stats([review('2026-10-12', entries[0].id)]);
    expect(isHitDay(m, '2026-10-11', s.get('2026-10-11'))).toBe(false);
    expect(isHitDay(m, '2026-10-12', s.get('2026-10-12'))).toBe(true);
  });
  it('streaks follow, and today never breaks one', () => {
    const missed = stats([review('2026-10-11', entries[0].id)]);
    expect(computeStreaks(m, missed, '2026-10-12')?.current).toBe(2);
    expect(computeStreaks(m, missed, '2026-10-13')?.current).toBe(0);
    const done = stats([review('2026-10-11', entries[0].id), review('2026-10-12', entries[1].id)]);
    expect(computeStreaks(m, done, '2026-10-12')?.current).toBe(3);
  });
  it('enough phrases is still needed', () => {
    const two = metric({ target: 2 });
    const s = buildDayStats(entries, [two], [review('2026-10-11', entries[0].id)]).get('q')!;
    expect(isHitDay(two, '2026-10-11', s.get('2026-10-11'))).toBe(false);
  });
});

describe('phrase achievements', () => {
  const m = metric();
  const input = (entries: Entry[], reviews: Review[], today = '2026-10-20', metrics: Metric[] = [m]) => evaluate({
    metrics,
    entries,
    reviews,
    dayStats: buildDayStats(entries, metrics, reviews),
    today,
    tz: 'UTC',
    dayOf: (iso) => dayOf(iso, 'UTC', 0),
    weekStartsOn: 1,
    goals: [],
    plans: [],
    tasks: [],
    wins: [],
  });
  const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`);

  it('counts phrases collected and reviews done', () => {
    const entries = days(1, 10).map((d) => phrase(d, `phrase ${d}`));
    const reviews = days(2, 3).map((d) => review(d, entries[0].id));
    const r = input(entries, reviews);
    expect(r.unlocked.get('wisdom.phrases.1')?.on).toBe('2026-10-01');
    expect(r.unlocked.get('wisdom.phrases.2')?.on).toBe('2026-10-10');
    expect(r.unlocked.get('wisdom.phrases.3')).toBeUndefined();
    expect(r.unlocked.get('wisdom.reviews.1')?.on).toBe('2026-10-02');
    expect(r.best.get('wisdom.reviews')).toBe(2);
  });
  it('counts a recall only when it was remembered', () => {
    const entries = [phrase('2026-10-01', 'a b c d e')];
    const bad = input(entries, [review('2026-10-02', entries[0].id, { mode: 'type', style: 'full', score: 0.4 })]);
    expect(bad.unlocked.get('wisdom.recall.1')).toBeUndefined();
    const good = input(entries, [review('2026-10-02', entries[0].id, { mode: 'type', style: 'full', score: 0.8 })]);
    expect(good.unlocked.get('wisdom.recall.1')?.on).toBe('2026-10-02');
    const tap = input(entries, [review('2026-10-02', entries[0].id)]);
    expect(tap.unlocked.get('wisdom.recall.1')).toBeUndefined();
  });
  it('counts a day on target only with its review', () => {
    const entries = days(1, 8).map((d) => phrase(d, `phrase ${d}`));
    const none = input(entries, []);
    expect(none.unlocked.get('wisdom.days.1')).toBeUndefined();
    const reviews = days(2, 8).map((d) => review(d, entries[0].id));
    const all = input(entries, reviews);
    // The first day owes no review, so seven days are counted by the 7th.
    expect(all.unlocked.get('wisdom.days.1')?.on).toBe('2026-10-07');
  });
  it('unlocks the secrets only for the real thing', () => {
    const long = Array.from({ length: 32 }, (_, i) => `w${i}`).join(' ');
    const entries = [phrase('2026-10-01', long)];
    const perfect = review('2026-10-02', entries[0].id, { mode: 'type', style: 'full', score: 1, hints: 0, words: 32 });
    const r = input(entries, [perfect]);
    expect(r.unlocked.has('secret.wordPerfect')).toBe(true);
    expect(r.unlocked.has('secret.longBreath')).toBe(true);
    const hinted = input(entries, [{ ...perfect, hints: 1 }]);
    expect(hinted.unlocked.has('secret.wordPerfect')).toBe(false);
    const blanks = input(entries, [{ ...perfect, style: 'blanks' }]);
    expect(blanks.unlocked.has('secret.wordPerfect')).toBe(false);
    const five = days(2, 6).length;
    const spree = input(entries, Array.from({ length: five }, () => review('2026-10-02', entries[0].id)));
    expect(spree.unlocked.get('secret.revisionSpree')?.on).toBe('2026-10-02');
  });
  it('applies only to accounts with a phrase metric linked to the Phrases binder', () => {
    const other = metric({ id: 'z', type: 'count', unit: 'x', theme: 'study' });
    expect(input([], [], '2026-10-20', [other]).ladders.some((l) => l.id === 'wisdom.phrases')).toBe(false);
    expect(input([], []).ladders.some((l) => l.id === 'wisdom.phrases')).toBe(true);
  });
});

describe('importing reviews', () => {
  const m = metric();
  const existing = { metrics: [] as Metric[], entryIds: new Set<string>(), itemIds: new Set<string>(), goals: [] };
  it('brings phrases and their reviews, skipping ones it has', () => {
    const e = phrase('2026-10-01', 'a b c', { reference: 'Source' });
    const r = review('2026-10-02', e.id, { mode: 'type', style: 'full', score: 0.9, hints: 1, words: 3 });
    const backup = { format: 'personal-tracker/1', metrics: [m], entries: [e], reviews: [r, { id: 'bad' }] };
    const res = planImport(backup, existing, '2026-10-20T00:00:00.000Z');
    if (!res.ok) throw new Error(res.error);
    expect(res.plan.metrics).toHaveLength(1);
    expect(res.plan.entries[0]).toMatchObject({ text: 'a b c', reference: 'Source', value: 1 });
    expect(res.plan.reviews).toHaveLength(1);
    expect(res.plan.reviews[0]).toMatchObject({ mode: 'type', style: 'full', score: 0.9, hints: 1, words: 3, deletedAt: null });
    expect(res.plan.invalid).toBe(1);
    const again = planImport(backup, { ...existing, metrics: [m], entryIds: new Set([e.id]), reviewIds: new Set([r.id]) }, '2026-10-20T00:00:00.000Z');
    if (!again.ok) throw new Error(again.error);
    expect(again.plan.entries).toHaveLength(0);
    expect(again.plan.reviews).toHaveLength(0);
  });
  it('ignores reviews of metrics that are not phrase metrics', () => {
    const count = metric({ id: 'c', type: 'count', unit: 'x' });
    const res = planImport({ format: 'personal-tracker/1', metrics: [count], reviews: [review('2026-10-02', 'e', { metricId: 'c' })] }, existing, '2026-10-20T00:00:00.000Z');
    if (!res.ok) throw new Error(res.error);
    expect(res.plan.reviews).toHaveLength(0);
    expect(res.plan.invalid).toBe(1);
  });
});

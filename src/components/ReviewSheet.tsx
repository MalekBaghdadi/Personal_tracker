import { useMemo, useState } from 'react';
import { Check, Eye, Shuffle, Undo2 } from 'lucide-react';
import { Button, Segmented, Sheet, cx, inputClass } from './ui';
import { useData } from '../state/DataContext';
import { usePhraseDay } from '../state/phrases';
import { addReview, softDeleteReview } from '../lib/repo';
import { formatLocalDate } from '../lib/dates';
import {
  chooseBlanks, describeReview, gradeBlanks, pickPhrase, recall, revealed, sameWord, seedOf, verdictOf, wordCount, wordKey, wordsOf,
  type BlankLevel,
} from '../lib/phrases';
import type { Entry, Metric } from '../lib/types';

/**
 * The daily review of a phrase metric. A phrase is picked at random from the
 * ones added on earlier days (favouring ones not seen for longest or recalled
 * badly), and you either tap "I've reviewed it" or test yourself from memory,
 * with blanks to fill in or the whole phrase to type, and helps (the source,
 * the next word). Every finished review is one Review doc; the day counts only
 * once it has one.
 */
export function ReviewSheet({ metric, day, open, onClose }: { metric: Metric; day: string; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Review · ${metric.name}`}>
      {open && <Body metric={metric} day={day} onClose={onClose} />}
    </Sheet>
  );
}

function Body({ metric, day, onClose }: { metric: Metric; day: string; onClose: () => void }) {
  const { uid } = useData();
  const ph = usePhraseDay(metric, day);
  const [picked, setPicked] = useState<Entry | null>(() => pickPhrase(ph.pool, ph.history, day, Math.random));
  const [stage, setStage] = useState<'ask' | 'test' | 'tapped'>('ask');
  const [tapId, setTapId] = useState<string | null>(null);
  // Bumped to remount the test with a fresh state when another phrase is picked.
  const [round, setRound] = useState(0);

  if (!picked) {
    return (
      <div className="mt-2">
        <p className="text-[15px] text-ink-2">
          Nothing to review yet. Reviews come from phrases you added on an earlier day, so add one today and there will be one to look at tomorrow.
        </p>
        <Button className="mt-4 w-full" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const another = () => {
    setPicked(pickPhrase(ph.pool, ph.history, day, Math.random, picked.id));
    setStage('ask');
    setTapId(null);
    setRound((r) => r + 1);
  };

  const history = ph.history.get(picked.id);
  const wordsIn = wordCount(picked.text ?? '');

  if (stage === 'test') {
    return <Test key={`${picked.id}-${round}`} metric={metric} day={day} entry={picked} onBack={() => setStage('ask')} onAnother={another} onClose={onClose} />;
  }

  if (stage === 'tapped') {
    return (
      <div className="mt-2" data-testid="review-done">
        <p className="flex items-center gap-2 text-[17px] font-medium"><Check size={20} className="text-ok" aria-hidden /> Reviewed</p>
        <Phrase entry={picked} />
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" onClick={onClose}>Done</Button>
          {ph.pool.length > 1 && <Button onClick={another}><Shuffle size={16} aria-hidden /> Review another</Button>}
          <Button
            variant="ghost"
            onClick={() => {
              if (tapId) softDeleteReview(uid, tapId);
              setTapId(null);
              setStage('ask');
            }}
          >
            <Undo2 size={16} aria-hidden /> Undo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[14px] text-ink-2">
        {ph.reviewDone ? 'Today’s review is done. Here’s another one if you want it.' : 'Read it, say it back, then pick how you want to review it.'}
      </p>
      <Phrase entry={picked} />
      <p className="mt-2 text-[13px] text-ink-3">
        Added {formatLocalDate(picked.localDate, 'd MMM yyyy')} · {wordsIn} {wordsIn === 1 ? 'word' : 'words'}
        {history ? ` · reviewed ${history.count} ${history.count === 1 ? 'time' : 'times'}${history.last ? `, last: ${describeReview(history.last).toLowerCase()}` : ''}` : ' · not reviewed yet'}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="primary"
          onClick={() => {
            setTapId(addReview(uid, { metricId: metric.id, entryId: picked.id, localDate: day, mode: 'tap', style: null, score: null, hints: 0, words: wordsIn }));
            setStage('tapped');
          }}
        >
          <Check size={17} aria-hidden /> I’ve reviewed it
        </Button>
        <Button onClick={() => setStage('test')}>Test myself from memory</Button>
        {ph.pool.length > 1 && (
          <Button variant="ghost" onClick={another}><Shuffle size={16} aria-hidden /> Show me another</Button>
        )}
      </div>
    </div>
  );
}

function Phrase({ entry }: { entry: Entry }) {
  return (
    <figure className="mt-3 rounded-xl border border-line bg-bg p-4">
      <blockquote dir="auto" className="text-[18px] leading-relaxed whitespace-pre-wrap" data-testid="review-phrase">{entry.text}</blockquote>
      {entry.reference && <figcaption dir="auto" className="mt-2 text-[13px] text-ink-3">{entry.reference}</figcaption>}
    </figure>
  );
}

// ── The test from memory ───────────────────────────────────────────────────

type Style = 'blanks' | 'full';

interface Graded {
  id: string;
  style: Style;
  score: number;
  hints: number;
  /** Full: which counted words were recalled. */
  matched: boolean[];
  /** Blanks: where, and what was typed. */
  blanks: Set<number>;
  answers: Record<number, string>;
}

function Test({ metric, day, entry, onBack, onAnother, onClose }: {
  metric: Metric;
  day: string;
  entry: Entry;
  onBack: () => void;
  onAnother: () => void;
  onClose: () => void;
}) {
  const { uid } = useData();
  const { pool } = usePhraseDay(metric, day);
  const text = entry.text ?? '';
  const words = useMemo(() => wordsOf(text), [text]);
  const [style, setStyle] = useState<Style>('blanks');
  const [level, setLevel] = useState<BlankLevel>('half');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [attempt, setAttempt] = useState('');
  const [sourceShown, setSourceShown] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const [graded, setGraded] = useState<Graded | null>(null);

  const blanks = useMemo(() => chooseBlanks(words, level, seedOf(`${entry.id}:${level}`)), [words, level, entry.id]);
  const hints = (sourceShown ? 1 : 0) + (style === 'full' ? revealCount : 0);
  const filled = style === 'blanks' ? [...blanks].some((i) => (answers[i] ?? '').trim()) : attempt.trim().length > 0;

  const check = () => {
    let score: number;
    let matched: boolean[] = [];
    if (style === 'blanks') score = gradeBlanks(words, blanks, answers);
    else {
      const r = recall(text, attempt);
      score = r.score;
      matched = r.matched;
    }
    score = Math.round(score * 1000) / 1000;
    const id = addReview(uid, { metricId: metric.id, entryId: entry.id, localDate: day, mode: 'type', style, score, hints, words: wordCount(text) });
    setGraded({ id, style, score, hints, matched, blanks, answers });
  };

  if (graded) {
    return (
      <div className="mt-2" data-testid="review-result">
        <p className="text-[24px] font-semibold tracking-tight">{Math.round(graded.score * 100)}%</p>
        <p className="text-[15px] text-ink-2" data-testid="review-verdict">{verdictOf(graded.score)}</p>
        <figure className="mt-3 rounded-xl border border-line bg-bg p-4">
          <p dir="auto" className="text-[17px] leading-[2.1]">
            {graded.style === 'full' ? <Marked words={words} matched={graded.matched} /> : <BlankResult words={words} blanks={graded.blanks} answers={graded.answers} />}
          </p>
          {entry.reference && <figcaption dir="auto" className="mt-2 text-[13px] text-ink-3">{entry.reference}</figcaption>}
        </figure>
        <p className="mt-2 text-[13px] text-ink-3">
          {graded.hints > 0 ? `${graded.hints} ${graded.hints === 1 ? 'hint' : 'hints'} used. ` : 'No hints used. '}
          {graded.score < 0.8 ? 'It will come up again sooner.' : 'Saved to your reviews.'}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" onClick={onClose}>Done</Button>
          {pool.length > 1 && <Button onClick={onAnother}><Shuffle size={16} aria-hidden /> Review another</Button>}
          <Button
            variant="ghost"
            onClick={() => {
              softDeleteReview(uid, graded.id);
              setGraded(null);
            }}
          >
            <Undo2 size={16} aria-hidden /> Undo and try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Segmented
        label="How to test"
        value={style}
        onChange={setStyle}
        options={[{ value: 'blanks', label: 'Fill the blanks' }, { value: 'full', label: 'Type it out' }]}
      />

      {style === 'blanks' ? (
        <div className="mt-3">
          <Segmented
            label="How many blanks"
            value={level}
            onChange={(l) => { setLevel(l); setAnswers({}); }}
            options={[{ value: 'few', label: 'Few' }, { value: 'half', label: 'Half' }, { value: 'most', label: 'Most' }]}
          />
          <p dir="auto" className="mt-3 text-[17px] leading-[2.6]" data-testid="review-blanks">
            {words.map((w, i) => (
              <span key={i}>
                {blanks.has(i) ? (
                  <input
                    dir="auto"
                    aria-label={`Blank ${[...blanks].sort((a, b) => a - b).indexOf(i) + 1}`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={answers[i] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    style={{ width: `${Math.max(4, w.key.length * 0.85 + 2)}em` }}
                    className="mx-0.5 inline-block h-9 rounded-md border border-line bg-bg px-2 text-center align-middle text-[16px] text-ink focus:border-focus focus:outline-none"
                  />
                ) : w.raw}
                {' '}
              </span>
            ))}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor="review-attempt" className="mb-1.5 block text-[13px] font-medium text-ink-2">The whole phrase, from memory</label>
          <textarea
            id="review-attempt"
            dir="auto"
            rows={5}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${inputClass} min-h-32 py-2.5 leading-relaxed`}
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
          />
          {revealCount > 0 && (
            <p dir="auto" className="mt-2 rounded-lg bg-s2 px-3 py-2 text-[15px] text-ink-2" data-testid="review-reveal">
              Starts: <span className="text-ink">{revealed(text, revealCount)}</span>{revealCount < words.length ? ' …' : ''}
            </p>
          )}
        </div>
      )}

      {sourceShown && entry.reference && (
        <p dir="auto" className="mt-2 rounded-lg bg-s2 px-3 py-2 text-[14px] text-ink-2" data-testid="review-source">Source: <span className="text-ink">{entry.reference}</span></p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {entry.reference && !sourceShown && (
          <Button onClick={() => setSourceShown(true)}><Eye size={16} aria-hidden /> Show source</Button>
        )}
        {style === 'full' && revealCount < words.length && (
          <Button onClick={() => setRevealCount((n) => n + 1)}>Reveal next word</Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="primary" disabled={!filled} onClick={check}>Check</Button>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}

/** The phrase with each recalled word plain and each missed one marked. */
function Marked({ words, matched }: { words: ReturnType<typeof wordsOf>; matched: boolean[] }) {
  let c = -1;
  return (
    <>
      {words.map((w, i) => {
        if (!w.key) return <span key={i}>{w.raw} </span>;
        c++;
        const ok = matched[c];
        return (
          <span key={i} className={cx(ok ? 'text-ok' : 'text-danger underline decoration-dotted underline-offset-4')}>
            {w.raw}{' '}
          </span>
        );
      })}
    </>
  );
}

function BlankResult({ words, blanks, answers }: { words: ReturnType<typeof wordsOf>; blanks: Set<number>; answers: Record<number, string> }) {
  return (
    <>
      {words.map((w, i) => {
        if (!blanks.has(i)) return <span key={i}>{w.raw} </span>;
        const given = (answers[i] ?? '').trim();
        const ok = sameWord(w.key, wordKey(given));
        return ok ? (
          <span key={i} className="text-ok">{w.raw} </span>
        ) : (
          <span key={i}>
            {given && <s className="text-ink-3">{given}</s>}{given ? ' ' : ''}<span className="text-danger">{w.raw}</span>{' '}
          </span>
        );
      })}
    </>
  );
}

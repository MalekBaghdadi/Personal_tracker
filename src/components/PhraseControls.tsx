import { useState } from 'react';
import { CircleCheck, Circle, Library, Plus, RefreshCw } from 'lucide-react';
import { useHue } from '../state/theme';
import { usePhraseDay } from '../state/phrases';
import { EntrySheet, type EntrySheetState } from './EntrySheet';
import { PhraseCarousel } from './PhraseCarousel';
import { ReviewSheet } from './ReviewSheet';
import { Button, cx } from './ui';
import { useData } from '../state/DataContext';
import { describeReview } from '../lib/phrases';
import type { Metric } from '../lib/types';

/**
 * A phrase metric's two steps for a day: how many phrases are added against
 * the target, and the review (owed once there's an older phrase to look at).
 * The day only counts when both are done.
 */
export function PhraseSteps({ metric, day }: { metric: Metric; day: string }) {
  const ph = usePhraseDay(metric, day);
  const added = ph.added.length;
  const review = ph.reviewDone ? 'done' : ph.owed ? 'todo' : 'none';
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label="Steps for the day">
      <Step done={added >= ph.target} text={`Add ${Math.min(added, ph.target)} of ${ph.target}`} />
      <Step done={review === 'done'} dim={review === 'none'} text={review === 'done' ? 'Review done' : review === 'todo' ? 'Review one' : 'Nothing to review yet'} />
    </ul>
  );
}

function Step({ done, dim, text }: { done: boolean; dim?: boolean; text: string }) {
  return (
    <li className={cx('inline-flex items-center gap-1.5', done ? 'text-ink' : dim ? 'text-ink-3' : 'text-ink-2')}>
      {done ? <CircleCheck size={15} className="text-ok" aria-hidden /> : <Circle size={15} aria-hidden />}
      {text}
    </li>
  );
}

/** Add a phrase, review one, open the collection: the buttons of a phrase metric's row (with its carousel, if `carousel` and the metric has one). */
export function PhraseControls({ metric, day, tour, carousel }: { metric: Metric; day: string; tour?: boolean; carousel?: boolean }) {
  const hue = useHue(metric.color);
  const ph = usePhraseDay(metric, day);
  const [add, setAdd] = useState<EntrySheetState | null>(null);
  const [review, setReview] = useState(false);
  // The review is what's left to do: draw the eye to it once it's owed.
  const urgent = ph.owed && !ph.reviewDone;

  return (
    <>
      {carousel && metric.carousel && ph.all.length > 0 && <PhraseCarousel phrases={ph.all} style={metric.carousel.style} pace={metric.carousel.pace} tour={tour} />}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAdd({ mode: 'add', metric, date: day })}
          data-tour={tour ? 'today-phrase-add' : undefined}
          aria-label={`Add a phrase to ${metric.name}`}
          className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-3.5 text-[14px] font-medium text-ink hover:bg-s3"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden /> Add phrase
        </button>
        <button
          type="button"
          onClick={() => setReview(true)}
          disabled={!ph.owed}
          data-tour={tour ? 'today-phrase-review' : undefined}
          aria-label={`Review a phrase from ${metric.name}`}
          className={cx(
            'press inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-40',
            !urgent && 'bg-s2 text-ink hover:bg-s3',
          )}
          style={urgent ? { background: hue, color: '#0e1420' } : undefined}
        >
          <RefreshCw size={16} aria-hidden /> {ph.reviewDone ? 'Review another' : 'Review'}
        </button>
        <a
          href={`#/phrases/${metric.id}`}
          aria-label={`Open the ${metric.name} collection`}
          className="press ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-3 text-[14px] font-medium text-ink hover:bg-s3"
        >
          <Library size={17} aria-hidden /> <span className="hidden sm:inline">Collection</span>
          <span className="text-[13px] text-ink-3">{ph.all.length}</span>
        </a>
        <EntrySheet state={add} onClose={() => setAdd(null)} />
        <ReviewSheet metric={metric} day={day} open={review} onClose={() => setReview(false)} />
      </div>
    </>
  );
}

/** What a phrase metric's day is missing, the reviews done on it, and a way to do one for that day. */
export function PhraseDayStatus({ metric, date }: { metric: Metric; date: string }) {
  const { today } = useData();
  const ph = usePhraseDay(metric, date);
  const [review, setReview] = useState(false);
  const missing = Math.max(0, ph.target - ph.added.length);
  const needReview = ph.owed && !ph.reviewDone;
  const counted = missing === 0 && !needReview;
  const todo = [
    missing > 0 ? `${missing} more ${missing === 1 ? 'phrase' : 'phrases'} to add` : null,
    needReview ? 'no review done' : null,
  ].filter(Boolean).join(', ');
  const text = counted ? 'This day counts: the phrases are added and a review is done.' : `Doesn’t count yet: ${todo}.`;
  const excerpt = (id: string) => {
    const t = ph.all.find((e) => e.id === id)?.text ?? '';
    return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
  };
  return (
    <section className="mt-5" aria-label={`${metric.name} review`}>
      <h3 className="mb-1.5 text-[13px] font-medium text-ink-2">Review</h3>
      {ph.done.length > 0 && (
        <ul className="mb-1.5 divide-y divide-line border-y border-line">
          {ph.done.map((r) => (
            <li key={r.id} className="py-2 text-[14px]">
              <span className="font-medium">{describeReview(r)}</span>
              {excerpt(r.entryId) && <span dir="auto" className="block truncate text-[13px] text-ink-3">{excerpt(r.entryId)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-ink-3" data-testid="phrase-day-status">{ph.owed || ph.added.length > 0 ? text : 'Nothing to review on this day.'}</p>
      {date <= today && needReview && (
        <Button className="mt-2" onClick={() => setReview(true)}><RefreshCw size={16} aria-hidden /> Review for this day</Button>
      )}
      <ReviewSheet metric={metric} day={date} open={review} onClose={() => setReview(false)} />
    </section>
  );
}

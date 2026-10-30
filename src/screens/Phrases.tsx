import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, RefreshCw, Search } from 'lucide-react';
import { useData } from '../state/DataContext';
import { usePhraseDay } from '../state/phrases';
import { useHue } from '../state/theme';
import { EntrySheet, type EntrySheetState } from '../components/EntrySheet';
import { ReviewSheet } from '../components/ReviewSheet';
import { Segmented, inputClass } from '../components/ui';
import { formatLocalDate } from '../lib/dates';
import { SHAKY, describeReview, matchesSearch } from '../lib/phrases';
import { iconFor } from '../lib/icons';
import type { Entry, Metric } from '../lib/types';

type Filter = 'all' | 'new' | 'shaky';
const PAGE = 40;

/**
 * Every phrase a phrase metric has collected, newest first: search the text and
 * the source, filter to ones never reviewed or recalled badly, tap one to
 * edit it, or review one now. Reached from the metric's row on Today.
 */
export function Phrases({ id }: { id: string | null }) {
  const { metrics } = useData();
  const phraseMetrics = metrics.filter((m) => m.type === 'phrase');
  const metric = id ? phraseMetrics.find((m) => m.id === id) : undefined;

  if (!metric) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
        <h1 className="text-[22px] font-semibold tracking-tight">Collection</h1>
        {phraseMetrics.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-2">
            You have no phrase metric yet. Create one under <a href="#/metrics" className="underline">Metrics</a> by choosing Phrases as how it’s measured.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {phraseMetrics.map((m) => (
              <li key={m.id}>
                <a href={`#/phrases/${m.id}`} className="flex min-h-12 items-center py-2 text-[15px] font-medium hover:bg-s2/50">{m.name}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return <Collection key={metric.id} metric={metric} />;
}

function Collection({ metric }: { metric: Metric }) {
  const { today } = useData();
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);
  const ph = usePhraseDay(metric, today);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState<EntrySheetState | null>(null);
  const [review, setReview] = useState(false);

  const shaky = (e: Entry) => {
    const last = ph.history.get(e.id)?.last;
    return !!last && last.mode === 'type' && last.score != null && last.score < SHAKY;
  };
  const shown = useMemo(() => {
    return [...ph.all]
      .reverse()
      .filter((e) => matchesSearch(e, query))
      .filter((e) => (filter === 'new' ? !ph.history.has(e.id) : filter === 'shaky' ? shaky(e) : true));
  }, [ph.all, ph.history, query, filter]);
  const reviewed = ph.all.filter((e) => ph.history.has(e.id)).length;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <a href="#/today" className="press -ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[14px] text-ink-2 hover:text-ink">
        <ChevronLeft size={18} aria-hidden /> Today
      </a>
      <header className="mt-1 flex items-center gap-2.5">
        <Icon size={22} style={{ color: hue }} aria-hidden />
        <h1 className="min-w-0 truncate text-[22px] font-semibold tracking-tight">{metric.name}</h1>
      </header>
      <p className="mt-1 text-[14px] text-ink-2" data-testid="collection-summary">
        {ph.all.length} {ph.all.length === 1 ? 'phrase' : 'phrases'} collected · {reviewed} reviewed · {ph.reviews.length} {ph.reviews.length === 1 ? 'review' : 'reviews'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" data-tour="phrases-actions">
        <button
          type="button"
          onClick={() => setSheet({ mode: 'add', metric })}
          className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-3.5 text-[14px] font-medium hover:bg-s3"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden /> Add phrase
        </button>
        <button
          type="button"
          onClick={() => setReview(true)}
          disabled={!ph.owed}
          className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-3.5 text-[14px] font-medium hover:bg-s3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden /> Review one now
        </button>
      </div>

      {ph.all.length > 0 && (
        <>
          <div className="relative mt-4" data-tour="phrases-search">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              dir="auto"
              type="search"
              aria-label="Search phrases"
              placeholder="Search the text or the source"
              className={`${inputClass} pl-10`}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            />
          </div>
          <div className="mt-3" data-tour="phrases-filter">
            <Segmented
              label="Show"
              value={filter}
              onChange={(f) => { setFilter(f); setLimit(PAGE); }}
              options={[{ value: 'all', label: 'All' }, { value: 'new', label: 'Not reviewed' }, { value: 'shaky', label: 'Needs a look' }]}
            />
          </div>
        </>
      )}

      {ph.all.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-[16px] font-medium">No phrases yet</p>
          <p className="mt-1 text-[14px] text-ink-2">Add one and it lands here, with the day you found it.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-[14px] text-ink-3">Nothing matches.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" data-tour="phrases-list" aria-label="Phrases">
          {shown.slice(0, limit).map((e) => {
            const h = ph.history.get(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  data-testid="phrase-card"
                  onClick={() => setSheet({ mode: 'edit', metric, entry: e })}
                  className="press w-full rounded-xl border border-line px-3.5 py-3 text-left hover:bg-s2"
                >
                  <span dir="auto" className="block text-[16px] leading-relaxed whitespace-pre-wrap">{e.text}</span>
                  {e.reference && <span dir="auto" className="mt-1 block text-[13px] text-ink-2">{e.reference}</span>}
                  <span className="mt-1.5 block text-[12px] text-ink-3">
                    Added {formatLocalDate(e.localDate, 'd MMM yyyy')}
                    {h ? ` · reviewed ${h.count} ${h.count === 1 ? 'time' : 'times'}${h.last ? `, last: ${describeReview(h.last).toLowerCase()}` : ''}` : ' · not reviewed yet'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="press mt-3 min-h-11 w-full rounded-lg bg-s2 text-[14px] font-medium hover:bg-s3">
          Show more ({shown.length - limit} left)
        </button>
      )}

      <EntrySheet state={sheet} onClose={() => setSheet(null)} />
      <ReviewSheet metric={metric} day={today} open={review} onClose={() => setReview(false)} />
    </div>
  );
}

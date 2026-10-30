import { useMemo } from 'react';
import { useData } from './DataContext';
import { historyByPhrase, phrasesOf, reviewPool, type PhraseHistory } from '../lib/phrases';
import type { Entry, Metric, Review } from '../lib/types';

export interface PhraseDay {
  /** Every phrase of the metric, oldest first. */
  all: Entry[];
  /** Phrases added on the day. */
  added: Entry[];
  /** What a review on the day can pick from: phrases from earlier days. */
  pool: Entry[];
  /** A review is owed on the day (there is something to review). */
  owed: boolean;
  /** Reviews done on the day. */
  done: Review[];
  reviewDone: boolean;
  /** Every review of the metric. */
  reviews: Review[];
  history: Map<string, PhraseHistory>;
  /** Phrases the metric asks for each day (at least 1). */
  target: number;
}

/** A phrase metric's phrases and reviews, and where `day` stands: what's added, what's owed, what's done. */
export function usePhraseDay(metric: Metric, day: string): PhraseDay {
  const { entries, reviews } = useData();
  return useMemo(() => {
    const all = phrasesOf(entries, metric.id);
    const mine = reviews.filter((r) => r.metricId === metric.id);
    const pool = reviewPool(all, day);
    const done = mine.filter((r) => r.localDate === day);
    return {
      all,
      added: all.filter((e) => e.localDate === day),
      pool,
      owed: pool.length > 0,
      done,
      reviewDone: done.length > 0,
      reviews: mine,
      history: historyByPhrase(mine),
      target: metric.target ?? 1,
    };
  }, [entries, reviews, metric.id, metric.target, day]);
}

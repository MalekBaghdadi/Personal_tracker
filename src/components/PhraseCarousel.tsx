import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { drawPhrase, dwellMs } from '../lib/phrases';
import { cx, prefersReducedMotion } from './ui';
import type { CarouselPace, CarouselStyle, Entry } from '../lib/types';

interface Deck {
  /** Phrase ids in the order shown, so "back" can step through them. */
  trail: string[];
  at: number;
  seen: Set<string>;
  /** Which way the last move went, for the slide and stack styles. */
  dir: 1 | -1;
}

const SWIPE_PX = 48;
const arrow = 'press inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-s3 disabled:opacity-40';

/**
 * A phrase metric's collection on Today, one phrase at a time in a shuffled
 * order (every phrase once before any repeats). It only reads the phrases the
 * app already holds: cycling never touches Firestore. Pauses while held, hovered,
 * paused with the button or off-screen; under reduced motion it doesn't move on
 * its own, you step with the arrows.
 */
export function PhraseCarousel({ phrases, style, pace, tour }: { phrases: Entry[]; style: CarouselStyle; pace: CarouselPace; tour?: boolean }) {
  const idsRef = useRef<string[]>([]);
  idsRef.current = phrases.map((p) => p.id);
  const [deck, setDeck] = useState<Deck>(() => {
    const d = drawPhrase(idsRef.current, new Set(), Math.random)!;
    return { trail: [d.id], at: 0, seen: d.seen, dir: 1 };
  });
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const swipeFrom = useRef<number | null>(null);
  const reduced = prefersReducedMotion();
  const many = phrases.length > 1;
  const playing = !paused && !held && !hidden;
  const running = many && !reduced && playing;
  const cur = phrases.find((p) => p.id === deck.trail[deck.at]);

  const go = (dir: 1 | -1) => setDeck((s) => {
    if (dir < 0) return s.at > 0 ? { ...s, at: s.at - 1, dir } : s;
    if (s.at < s.trail.length - 1) return { ...s, at: s.at + 1, dir };
    const d = drawPhrase(idsRef.current, s.seen, Math.random);
    return d ? { trail: [...s.trail, d.id], at: s.at + 1, seen: d.seen, dir } : s;
  });

  useEffect(() => {
    const f = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  // The phrase on screen was deleted: move on.
  useEffect(() => {
    if (!cur) go(1);
  }, [cur, deck.at, deck.trail.length]);

  useEffect(() => {
    if (!running || !cur || style === 'ticker') return;
    const t = window.setTimeout(() => go(1), dwellMs(cur.text ?? '', pace));
    return () => window.clearTimeout(t);
  }, [running, cur?.id, deck.at, style, pace]);

  if (!cur) return null;
  const text = cur.text ?? '';
  const scrolling = style === 'ticker' && !reduced;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Your phrases"
      data-testid="phrase-carousel"
      data-style={style}
      data-tour={tour ? 'today-phrase-carousel' : undefined}
      className={cx('relative mt-2.5 touch-pan-y', style === 'stack' && 'mb-4')}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onPointerDown={(e) => { swipeFrom.current = e.clientX; }}
      onPointerUp={(e) => {
        const from = swipeFrom.current;
        swipeFrom.current = null;
        if (from != null && many && Math.abs(e.clientX - from) > SWIPE_PX) go(e.clientX < from ? 1 : -1);
      }}
    >
      {style === 'stack' && many && (
        <>
          <span aria-hidden className="absolute inset-x-3 -bottom-1.5 h-full rounded-xl border border-line bg-s2/70" />
          <span aria-hidden className="absolute inset-x-6 -bottom-3 h-full rounded-xl border border-line bg-s2/40" />
        </>
      )}
      <div className={cx('relative rounded-xl border border-line bg-s2 px-3.5 pt-3 pb-1.5', style === 'slide' && 'overflow-hidden')}>
        <div
          key={deck.at}
          dir={scrolling ? 'ltr' : undefined}
          aria-live={running ? 'off' : 'polite'}
          style={{ '--dir': deck.dir } as CSSProperties}
          className={cx(!scrolling && 'min-h-[4.25rem]', !scrolling && (style === 'ticker' ? 'car-fade' : `car-${style}`), scrolling && 'overflow-hidden')}
        >
          {scrolling ? (
            <span
              dir="auto"
              className="car-ticker text-[16px]"
              style={{
                animationDuration: `${dwellMs(text, pace)}ms`,
                animationPlayState: playing ? 'running' : 'paused',
                animationIterationCount: many ? 1 : 'infinite',
              }}
              onAnimationEnd={() => go(1)}
            >
              {text}{cur.reference ? ` · ${cur.reference}` : ''}
            </span>
          ) : (
            <>
              <span dir="auto" className="line-clamp-6 block text-[16px] leading-relaxed whitespace-pre-wrap">{text}</span>
              {cur.reference && <span dir="auto" className="mt-1 block text-[13px] text-ink-2">{cur.reference}</span>}
            </>
          )}
        </div>
        {many && (
          <div className="mt-1 flex items-center justify-end">
            <button type="button" aria-label="Previous phrase" disabled={deck.at === 0} onClick={() => go(-1)} className={arrow}>
              <ChevronLeft size={20} aria-hidden />
            </button>
            {!reduced && (
              <button type="button" aria-label={paused ? 'Resume the carousel' : 'Pause the carousel'} onClick={() => setPaused((p) => !p)} className={arrow}>
                {paused ? <Play size={17} aria-hidden /> : <Pause size={17} aria-hidden />}
              </button>
            )}
            <button type="button" aria-label="Next phrase" onClick={() => go(1)} className={arrow}>
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

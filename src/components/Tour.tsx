import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useData } from '../state/DataContext';
import { markTourSeen } from '../lib/repo';
import { tourFor, type Tour, type TourStep } from '../lib/tours';

const PAD = 6;
const GAP = 12;
const START_DELAY_MS = 600;

/**
 * Browser tests run in emulator builds; tours would cover what every suite
 * clicks, so there they only run when a test opts in.
 */
function toursEnabled(): boolean {
  if (import.meta.env.VITE_USE_EMULATORS !== '1') return true;
  try {
    return localStorage.getItem('logbook:e2e-tours') === '1';
  } catch {
    return false;
  }
}

const targetOf = (s: TourStep): HTMLElement | null =>
  s.target ? document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`) : null;

/** Steps that can show now: centred ones, and ones whose marker is on screen. */
function visibleSteps(t: Tour): TourStep[] {
  return t.steps.filter((s) => {
    if (!s.target) return true;
    const el = targetOf(s);
    return !!el && el.getClientRects().length > 0;
  });
}

/**
 * Starts a tab's tour the first time it opens (settings.toursSeen), after the
 * screen has settled and only if no sheet is open. Finishing or skipping marks
 * it seen; Settings → Tutorials removes the mark to replay it.
 */
export function TourHost({ route }: { route: string }) {
  const { uid, settings } = useData();
  const [active, setActive] = useState<{ tour: Tour; steps: TourStep[] } | null>(null);
  // Covers the moment between finishing and the settings snapshot catching up.
  const finished = useRef(new Set<string>());
  const seen = settings?.toursSeen;

  useEffect(() => {
    const tour = tourFor(route);
    if (!tour || active || !settings || !toursEnabled()) return;
    if (seen?.includes(tour.id)) {
      finished.current.delete(tour.id); // replayed later from Settings
      return;
    }
    if (finished.current.has(tour.id)) return;
    const id = window.setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      const steps = visibleSteps(tour);
      if (steps.length === 0) return;
      setActive({ tour, steps });
    }, START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [route, seen, settings, active]);

  // Leaving the tab ends the tour without marking it, so it shows next time.
  useEffect(() => {
    if (active && active.tour.id !== route) setActive(null);
  }, [route, active]);

  const done = useCallback(() => {
    if (!active) return;
    finished.current.add(active.tour.id);
    markTourSeen(uid, active.tour.id);
    setActive(null);
  }, [active, uid]);

  if (!active) return null;
  return <Spotlight key={active.tour.id} steps={active.steps} onDone={done} />;
}

type Rect = { top: number; left: number; width: number; height: number };

function Spotlight({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [cardH, setCardH] = useState(160);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Bring the target into view, then follow it on scroll and resize.
  useLayoutEffect(() => {
    const el = targetOf(step);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    nextRef.current?.focus({ preventScroll: true });
  }, [i, rect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone, steps.length]);

  const width = Math.min(340, vp.w - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + GAP;
    const fitsBelow = below + cardH <= vp.h - 16;
    const top = fitsBelow ? below : Math.max(16, rect.top - GAP - cardH);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vp.w - width - 16);
    cardStyle = { top, left, width };
  } else {
    cardStyle = { top: Math.max(16, (vp.h - cardH) / 2), left: (vp.w - width) / 2, width };
  }

  return (
    <div className="fixed inset-0 z-[900]" data-testid="tour">
      {/* Swallows taps so the screen underneath can't be used mid-tour. */}
      <div className="absolute inset-0" style={rect ? undefined : { background: 'rgb(0 0 0 / 0.65)' }} aria-hidden />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{ ...rect, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.65)' }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-xl border border-line bg-raise p-4 shadow-xl"
        style={cardStyle}
      >
        <h2 id="tour-title" className="text-[16px] font-semibold">{step.title}</h2>
        <p id="tour-body" className="mt-1 text-[14px] leading-snug text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button type="button" onClick={onDone} className="press min-h-10 rounded-lg px-2 text-[14px] text-ink-2 hover:text-ink">
              Skip
            </button>
          )}
          <span className="ml-auto text-[13px] text-ink-3" aria-live="polite">{i + 1} of {steps.length}</span>
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="press min-h-10 rounded-lg bg-s2 px-3 text-[14px] font-medium hover:bg-s3">
              Back
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? onDone() : setI(i + 1))}
            className="press min-h-10 rounded-lg bg-ink px-4 text-[14px] font-medium text-bg"
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAchievements } from '../state/AchievementsContext';
import { TIERS, achievementById, rankFor } from '../lib/achievementCatalog';
import { xpOf } from '../lib/achievements';
import { AchievementCard, CardBack, MiniCard, TIER_ON_DARK } from './AchievementCard';
import { Confetti } from './Confetti';
import { Button, cx, prefersReducedMotion } from './ui';
import { rankIcon } from '../lib/achievementArt';

/**
 * Collecting: each waiting card face down, one at a time. Tapping flips it
 * and collects it (the write happens on the flip, so closing early keeps
 * what's been flipped). Gold and up get a sunburst and confetti. "Collect
 * all" takes the rest in one go and shows what came in.
 */
export function Reveal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const { collect, collected, summary, evaluation } = useAchievements();
  const ref = useRef<HTMLDialogElement>(null);
  // The queue is fixed when the reveal opens; cards collected meanwhile drop out.
  const [queue] = useState(() => ids.filter((id) => evaluation.unlocked.has(id) && !collected.has(id) && achievementById.has(id)));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [confetti, setConfetti] = useState(0);
  // The level just before the last flip (or Collect all), so "Level up" shows on the card that did it.
  const [levelBefore, setLevelBefore] = useState(summary.level);
  const [all, setAll] = useState<string[] | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    if (queue.length === 0) onClose();
  }, [queue.length, onClose]);
  if (queue.length === 0) return null;

  const id = queue[i];
  const def = achievementById.get(id)!;
  const unlock = evaluation.unlocked.get(id);
  const left = queue.length - i - 1;
  const leveledUp = summary.level > levelBefore;

  const flip = () => {
    if (flipped) return;
    setLevelBefore(summary.level);
    setFlipped(true);
    collect([id]);
    if (def.tier >= 2 && !prefersReducedMotion()) setConfetti((n) => n + 1);
  };
  const next = () => {
    setFlipped(false);
    setI(i + 1);
  };
  const collectAll = () => {
    const rest = queue.slice(flipped ? i + 1 : i);
    setLevelBefore(summary.level);
    collect(rest);
    setAll(queue.slice(0, flipped ? i + 1 : i).concat(rest));
    if (!prefersReducedMotion()) setConfetti((n) => n + 1);
  };

  // Card width: big on phones, not huge on desktop.
  const w = Math.min(280, Math.round(window.innerWidth * 0.72));

  return (
    <dialog
      ref={ref}
      aria-label="Collect achievements"
      data-testid="reveal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-[#05070d]/95 backdrop:backdrop-blur-md"
    >
      <div className="safe-top safe-bottom relative flex h-full flex-col items-center justify-center px-4 text-center text-[#eef1f7]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute top-[calc(env(safe-area-inset-top,0px)+12px)] right-3 grid size-11 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X size={22} />
        </button>

        {all ? (
          <AllCollected ids={all} xp={xpOf(all)} level={leveledUp ? summary.level : null} onDone={onClose} />
        ) : (
          <>
            <p className="mb-5 text-[13px] font-medium tracking-[0.16em] text-white/60 uppercase" aria-live="polite">
              {flipped ? `${TIERS[def.tier].name} · collected` : queue.length > 1 ? `Card ${i + 1} of ${queue.length}` : 'New achievement'}
            </p>
            <div className="relative" style={{ width: w, aspectRatio: '5 / 7' }}>
              {flipped && def.tier >= 2 && <div className="ach-rays" aria-hidden />}
              <button
                type="button"
                onClick={flip}
                disabled={flipped}
                aria-label={flipped ? def.name : `Flip the ${TIERS[def.tier].name} card`}
                className={cx('ach-flip relative block size-full', flipped && 'flipped')}
              >
                <span className="ach-flip-inner block">
                  <span className="ach-side block"><CardBack tier={def.tier} w={w} label="Tap to flip" /></span>
                  {/* The face only exists once flipped: Safari can show a hidden back face through, and blend modes make it worse. */}
                  {flipped && <span className="ach-side front block"><AchievementCard def={def} w={w} on={unlock?.on} /></span>}
                </span>
              </button>
            </div>

            <div className="mt-6 flex min-h-28 w-full max-w-xs flex-col items-center gap-3">
              {flipped ? (
                <>
                  <div className="ach-pop flex flex-wrap items-center justify-center gap-2" key={id}>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[14px] font-semibold" style={{ color: TIER_ON_DARK[def.tier] }}>
                      +{TIERS[def.tier].xp} XP
                    </span>
                    {unlock?.detail && <span className="text-[13px] text-white/70">{unlock.detail}</span>}
                  </div>
                  {leveledUp && <LevelUp level={summary.level} />}
                  <div className="flex w-full flex-col gap-2">
                    {left > 0 ? (
                      <>
                        <Button variant="primary" className="w-full bg-white text-[#0d1220]" onClick={next}>Next card ({left} left)</Button>
                        {left > 1 && <Button className="w-full bg-white/10 text-white hover:bg-white/15" onClick={collectAll}>Collect all {left}</Button>}
                      </>
                    ) : (
                      <Button variant="primary" className="w-full bg-white text-[#0d1220]" onClick={onClose}>Done</Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[14px] text-white/70">Tap the card to flip it into your binder.</p>
                  {queue.length - i > 1 && (
                    <Button className="w-full bg-white/10 text-white hover:bg-white/15" onClick={collectAll}>Collect all {queue.length - i}</Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
      {confetti > 0 && <Confetti key={confetti} origin={{ x: 0.5, y: 0.35 }} />}
    </dialog>
  );
}

function LevelUp({ level }: { level: number }) {
  const rank = rankFor(level);
  const Icon = rankIcon(rank.name);
  return (
    <p className="ach-pop rounded-xl bg-gradient-to-r from-[#e0a03a]/25 to-[#f472b6]/25 px-4 py-2 text-[15px] font-semibold" data-testid="level-up">
      Level up! Level {level} · <Icon size={17} className="-mt-0.5 inline" aria-hidden /> {rank.name}
    </p>
  );
}

/** "Collect all": everything that came in, at a glance. */
function AllCollected({ ids, xp, level, onDone }: { ids: string[]; xp: number; level: number | null; onDone: () => void }) {
  const best = [...ids].sort((a, b) => achievementById.get(b)!.tier - achievementById.get(a)!.tier)[0];
  const tiers = TIERS.map((_, t) => ids.filter((id) => achievementById.get(id)!.tier === t).length);
  return (
    <div className="ach-in flex w-full max-w-sm flex-col items-center" data-testid="collected-all">
      <p className="text-[13px] font-medium tracking-[0.16em] text-white/60 uppercase">Collected</p>
      <p className="mt-1 text-[28px] font-semibold">{ids.length} {ids.length === 1 ? 'card' : 'cards'}</p>
      <p className="text-[15px] text-white/75">+{xp} XP{best ? ` · best: ${achievementById.get(best)!.name}` : ''}</p>
      {level !== null && <div className="mt-3"><LevelUp level={level} /></div>}
      <div className="mt-5 flex max-h-[45dvh] flex-wrap justify-center gap-2 overflow-y-auto">
        {ids.slice(0, 30).map((id) => <MiniCard key={id} def={achievementById.get(id)!} state="collected" w={52} />)}
      </div>
      {ids.length > 30 && <p className="mt-2 text-[13px] text-white/60">and {ids.length - 30} more in your binder</p>}
      <p className="mt-3 text-[12px] text-white/55">
        {tiers.map((n, t) => (n ? `${n} ${TIERS[t].name}` : null)).filter(Boolean).join(' · ')}
      </p>
      <Button variant="primary" className="mt-6 w-full bg-white text-[#0d1220]" onClick={onDone}>Done</Button>
    </div>
  );
}

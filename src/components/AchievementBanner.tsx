import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAchievements } from '../state/AchievementsContext';
import { TIERS, achievementById } from '../lib/achievementCatalog';
import { MiniBack } from './MiniBack';

const SHOW_MS = 9000;

/**
 * "Achievement unlocked", dropped in at the top of whatever tab is open, the
 * moment something unlocks (and once per device for a backlog). Collect
 * opens the profile's reveal; otherwise the Profile tab keeps a count until
 * they're collected.
 */
export function AchievementBanner() {
  const { announcement, dismissAnnouncement, waiting } = useAchievements();
  const waitingIds = new Set(waiting.map((u) => u.id));
  const ids = (announcement?.ids ?? []).filter((id) => waitingIds.has(id) && achievementById.has(id));

  useEffect(() => {
    if (!announcement) return;
    const t = window.setTimeout(dismissAnnouncement, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [announcement, dismissAnnouncement]);

  if (!announcement || ids.length === 0) return null;
  const defs = ids.map((id) => achievementById.get(id)!).sort((a, b) => b.tier - a.tier);
  const best = defs[0];
  const many = ids.length > 1;
  const title = announcement.backlog
    ? `${ids.length} ${many ? 'achievements' : 'achievement'} to collect`
    : many ? `${ids.length} achievements unlocked` : 'Achievement unlocked';
  const sub = announcement.backlog
    ? 'Your history already earned these. Flip them into your binder.'
    : many
      ? `${defs.slice(0, 2).map((d) => d.name).join(', ')}${ids.length > 2 ? ` and ${ids.length - 2} more` : ''}`
      : `${best.name} · ${TIERS[best.tier].name}`;

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+8px)] z-40 flex justify-center px-3">
      <div className="ach-drop pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-s3 py-2 pr-1.5 pl-2.5 shadow-xl" data-testid="ach-banner">
        <MiniBack tier={best.tier} w={38} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{title}</p>
          <p className="truncate text-[13px] text-ink-2">{sub}</p>
        </div>
        <a
          href="#/profile/collect"
          onClick={dismissAnnouncement}
          className="press inline-flex min-h-10 shrink-0 items-center rounded-lg bg-ink px-3.5 text-[14px] font-semibold text-bg"
        >
          Collect
        </a>
        <button type="button" aria-label="Dismiss" onClick={dismissAnnouncement} className="press grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-s2 hover:text-ink">
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

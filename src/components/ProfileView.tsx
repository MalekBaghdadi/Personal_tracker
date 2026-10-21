import { useState } from 'react';
import { TIERS, achievementById } from '../lib/achievementCatalog';
import { formatLocalDate } from '../lib/dates';
import type { SharedCard, SharedProfile } from '../lib/profile';
import { AchievementCard, Avatar, MiniCard, useTierInk } from './AchievementCard';
import { cx } from './ui';

/** Collected cards per tier: six small gems with counts. */
export function TierCounts({ tiers, className }: { tiers: number[]; className?: string }) {
  const ink = useTierInk();
  return (
    <ul className={cx('flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2', className)} aria-label="Cards by tier">
      {TIERS.map((t, i) => (
        <li key={t.name} className={cx('inline-flex items-center gap-1.5', !tiers[i] && 'opacity-45')} title={t.name}>
          <i aria-hidden className="size-2.5 rotate-45 rounded-[2px]" style={{ background: ink(i) }} />
          <span className="tabular-nums">{tiers[i] ?? 0}</span>
          <span className="sr-only">{t.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** A row of shared cards with their names; tap one to see it in full. */
function CardRow({ cards, onOpen }: { cards: SharedCard[]; onOpen: (c: SharedCard) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onOpen(c)} className="press flex w-full flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-s2">
            <MiniCard def={c} state="collected" w={64} />
            <span className="line-clamp-2 text-center text-[12px] leading-tight font-medium">{c.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Someone's profile as they share it with their Compete partner: title,
 * level, pinned cards, counts, what they collected lately. Only cards.
 */
export function SharedProfileView({ profile }: { profile: SharedProfile }) {
  const ink = useTierInk();
  const [open, setOpen] = useState<SharedCard | null>(null);
  const def = open ? achievementById.get(open.id) : undefined;
  return (
    <div data-testid="shared-profile">
      <div className="flex items-center gap-4">
        <Avatar art={profile.title?.art[0] ?? profile.rankArt} tier={profile.title?.tier ?? null} size={64} label={profile.title ? `Wearing ${profile.title.name}` : profile.rank} />
        <div className="min-w-0">
          <p className="truncate text-[18px] font-semibold">{profile.name}</p>
          <p className="truncate text-[14px] font-medium" style={profile.title ? { color: ink(profile.title.tier) } : undefined}>{profile.title?.name ?? profile.rank}</p>
          <p className="text-[13px] text-ink-3">Level {profile.level} · {profile.rankArt} {profile.rank}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-s2 px-3 py-2.5">
        <span className="text-[14px]"><strong className="font-semibold">{profile.collected}</strong> <span className="text-ink-2">of {profile.total} collected</span></span>
        <TierCounts tiers={profile.tiers} />
      </div>

      {def && open && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <AchievementCard def={def} w={220} on={open.on || null} />
          {open.detail && <p className="text-center text-[13px] text-ink-2">{open.detail}</p>}
          <button type="button" onClick={() => setOpen(null)} className="text-[13px] font-medium text-ink-2 underline underline-offset-2">Close card</button>
        </div>
      )}

      {profile.pinned.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-ink-3">Showcase</h3>
          <CardRow cards={profile.pinned} onOpen={setOpen} />
        </section>
      )}
      {profile.recent.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-ink-3">Collected lately</h3>
          <CardRow cards={profile.recent} onOpen={setOpen} />
        </section>
      )}
      {profile.collected === 0 && <p className="mt-4 text-[14px] text-ink-2">No cards yet. Give it a day.</p>}
      <p className="mt-5 text-[12px] text-ink-3">Updated {formatLocalDate(profile.updatedAt.slice(0, 10), 'd MMM')}. It updates when they open the app.</p>
    </div>
  );
}

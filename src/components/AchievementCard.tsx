import type { CSSProperties } from 'react';
import { GROUPS, TIERS, type AchievementDef, type Tier } from '../lib/achievementCatalog';
import { needOf } from '../lib/achievements';
import { rankIcon } from '../lib/achievementArt';
import { BINDER_ICON } from '../lib/binderIcons';
import { themeById } from '../lib/themes';
import { formatLocalDate } from '../lib/dates';
import { useTheme } from '../state/theme';
import { MiniBack } from './MiniBack';
import { PinArt, SteelPin } from './PinArt';
import { cx } from './ui';

/*
 * Achievement cards (styles in index.css, "Achievements"). A card is drawn at
 * any width (--w) and scales as a whole; a mini card is art only, for ladder
 * rows and the binder.
 */

const width = (w: number) => ({ '--w': `${w}px` }) as CSSProperties;

/** Tier colours for text in the app's own UI (cards carry their own): readable on either theme. */
const INK = {
  dark: ['#e0a873', '#d0d8e4', '#f3cd5e', '#9fe9db', '#b0c6ff', '#ffb8ee'],
  light: ['#9a5b2b', '#5d6878', '#8a6400', '#1f7266', '#3d55c4', '#b0369a'],
};

/** The same, on the reveal's always-dark backdrop. */
export const TIER_ON_DARK = INK.dark;

export function useTierInk(): (tier: number) => string {
  const theme = useTheme();
  return (tier) => INK[theme][tier] ?? INK[theme][0];
}

/** A round medallion: the worn card's pin in its tier's metal, or the rank's icon on a plain steel coin. */
export function Avatar({ worn, rank, size = 64, label }: { worn: { id: string; tier: number } | null | undefined; rank: string; size?: number; label: string }) {
  return (
    <div className={cx('ach-avatar', worn && `ach-t${worn.tier}`)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <span>{worn ? <PinArt id={worn.id} tier={worn.tier} /> : <SteelPin icon={rankIcon(rank)} />}</span>
    </div>
  );
}

export function Art({ id, tier }: { id: string; tier: number }) {
  return (
    <div className="ach-art" aria-hidden>
      <PinArt id={id} tier={tier} />
    </div>
  );
}

function Pips({ tier }: { tier: number }) {
  return (
    <span className="ach-pips" aria-hidden>
      {TIERS.map((_, i) => <i key={i} className={i <= tier ? 'on' : undefined} />)}
    </span>
  );
}

/** Where a card lives, with its binder's icon: Study, Streaks, Secret. */
export function PlaceLabel({ def }: { def: AchievementDef }) {
  const l = def.ladder;
  const key = def.secret ? 'secrets' : l!.theme ?? l!.group;
  const label = def.secret ? 'Secret' : l!.theme ? themeById.get(l!.theme)!.label : GROUPS.find((x) => x.id === l!.group)?.title ?? l!.title;
  const Icon = BINDER_ICON[key];
  return (
    <span className="ach-place">
      {Icon && <Icon aria-hidden />}
      <span className="truncate">{label}</span>
    </span>
  );
}

const no = (n: number) => `#${String(n).padStart(3, '0')}`;

/**
 * The full card face. Locked, the art is a silhouette and the flavor stays
 * hidden; a locked secret hides its name and what it takes too.
 */
export function AchievementCard({ def, w = 260, on, locked, className }: { def: AchievementDef; w?: number; on?: string | null; locked?: boolean; className?: string }) {
  const hidden = locked && !!def.secret;
  const label = hidden
    ? `Locked secret card. Hint: ${def.secret!.hint}`
    : `${TIERS[def.tier].name} card${locked ? ', locked' : ''}: ${def.name}. ${needOf(def)}.${locked ? '' : ` ${def.flavor}`}`;
  return (
    <div className={cx('ach', `ach-t${def.tier}`, locked && 'ach-locked', className)} style={width(w)} role="img" aria-label={label}>
      <div className="ach-face" aria-hidden>
        <div className="ach-top">
          <span>{TIERS[def.tier].name}</span>
          <Pips tier={def.tier} />
        </div>
        {hidden ? <div className="ach-art"><span className="main ach-q">?</span></div> : <Art id={def.id} tier={def.tier} />}
        <div className="ach-name">{hidden ? '???' : def.name}</div>
        <div className="ach-need">{hidden ? def.secret!.hint : needOf(def)}</div>
        {locked ? <p className="ach-flavor opacity-60">Locked</p> : <p className="ach-flavor">“{def.flavor}”</p>}
        <div className="ach-foot">
          <PlaceLabel def={def} />
          <span className="shrink-0">{on ? `${formatLocalDate(on, 'd MMM yyyy')} · ` : ''}{no(def.no)}</span>
        </div>
      </div>
      {!locked && def.tier >= 3 && <div className="ach-foil" aria-hidden />}
    </div>
  );
}

/** Face down, waiting to be flipped. */
export function CardBack({ tier, w = 260, label = 'Tap to flip', className }: { tier: Tier; w?: number; label?: string | null; className?: string }) {
  // Below ~150px the words are too small to read; the seal says enough.
  const words = w >= 150;
  return (
    <div className={cx('ach ach-back ach-wait', `ach-t${tier}`, className)} style={width(w)}>
      <div className="ach-face">
        {words && <span className="ach-brand" aria-hidden>Logbook</span>}
        <span className="ach-seal" aria-hidden><span>?</span></span>
        {words && label && <span className="ach-back-label">{label}</span>}
      </div>
    </div>
  );
}

export type CardState = 'collected' | 'ready' | 'locked';

/** Art only: collected in full colour, ready face down with a glow, locked as a silhouette. */
export function MiniCard({ def, state, w = 52, secretHidden }: { def: { id: string; tier: number }; state: CardState; w?: number; secretHidden?: boolean }) {
  if (state === 'ready') return <MiniBack tier={def.tier} w={w} />;
  const locked = state === 'locked';
  return (
    <div aria-hidden className={cx('ach ach-mini', `ach-t${def.tier}`, locked && 'ach-locked')} style={width(w)}>
      <div className="ach-face">
        {locked && <i className="ach-dot" />}
        {locked && secretHidden ? (
          <div className="ach-art"><span className="main ach-q">?</span></div>
        ) : (
          <Art id={def.id} tier={def.tier} />
        )}
      </div>
      {!locked && def.tier >= 3 && <div className="ach-foil" />}
    </div>
  );
}

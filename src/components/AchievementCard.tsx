import type { CSSProperties } from 'react';
import { GROUPS, TIERS, type AchievementDef, type Tier } from '../lib/achievementCatalog';
import { needOf } from '../lib/achievements';
import { themeById } from '../lib/themes';
import { formatLocalDate } from '../lib/dates';
import { useTheme } from '../state/theme';
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

/** A round medallion: the worn card's art in its tier's metal, or the rank's emoji in plain steel. */
export function Avatar({ art, tier, size = 64, label }: { art: string; tier: number | null; size?: number; label: string }) {
  return (
    <div className={cx('ach-avatar', tier !== null && `ach-t${tier}`)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <span style={{ fontSize: size * 0.48 }}>{art}</span>
    </div>
  );
}

export function Art({ art, silhouette }: { art: readonly (string | undefined)[]; silhouette?: boolean }) {
  return (
    <div className="ach-art" aria-hidden>
      <span className="ach-glyph">
        <span className={cx('main', silhouette && 'ach-sil')}>{art[0]}</span>
        {art[1] && <span className={cx('accent', silhouette && 'ach-sil')}>{art[1]}</span>}
      </span>
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

/** Where a card lives, with its emoji: "🎓 Study", "🔥 Streaks", "🤫 Secret". */
export function placeLabel(def: AchievementDef): string {
  if (def.secret) return '🤫 Secret';
  const l = def.ladder!;
  if (l.theme) {
    const t = themeById.get(l.theme)!;
    return `${t.emoji} ${t.label}`;
  }
  const g = GROUPS.find((x) => x.id === l.group);
  return g ? `${g.emoji} ${g.title}` : l.title;
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
        {hidden ? <div className="ach-art"><span className="main ach-q">?</span></div> : <Art art={def.art} silhouette={locked} />}
        <div className="ach-name">{hidden ? '???' : def.name}</div>
        <div className="ach-need">{hidden ? def.secret!.hint : needOf(def)}</div>
        {locked ? <p className="ach-flavor opacity-60">Locked</p> : <p className="ach-flavor">“{def.flavor}”</p>}
        <div className="ach-foot">
          <span className="truncate">{placeLabel(def)}</span>
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
export function MiniCard({ def, state, w = 52, secretHidden }: { def: { tier: number; art: readonly (string | undefined)[] }; state: CardState; w?: number; secretHidden?: boolean }) {
  if (state === 'ready') {
    return (
      <div aria-hidden className={cx('ach ach-mini ach-back ach-wait', `ach-t${def.tier}`)} style={width(w)}>
        <div className="ach-face"><span className="ach-seal"><span>!</span></span></div>
      </div>
    );
  }
  const locked = state === 'locked';
  return (
    <div aria-hidden className={cx('ach ach-mini', `ach-t${def.tier}`, locked && 'ach-locked')} style={width(w)}>
      <div className="ach-face">
        {locked && <i className="ach-dot" />}
        {locked && secretHidden ? (
          <div className="ach-art"><span className="main ach-q">?</span></div>
        ) : (
          <Art art={def.art} silhouette={locked} />
        )}
      </div>
      {!locked && def.tier >= 3 && <div className="ach-foil" />}
    </div>
  );
}

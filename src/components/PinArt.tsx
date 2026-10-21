import type { LucideIcon } from 'lucide-react';
import { INK, artOf } from '../lib/achievementArt';
import { STEEL_T } from './PinDefs';
import { cx } from './ui';

/*
 * A card's art: a stained-glass enamel pin. The crest's shape climbs with the
 * tier (coin, ringed coin, shield, hexagon, rayed gem, twelve-point star) in
 * the tier's metal over its enamel; the card's icon sits on top, filled with
 * see-through enamel in its own colour and outlined in the same metal. The
 * gradients live once in <PinDefs /> (components/PinDefs.tsx, mounted by the app shell).
 */

const ENAMEL = ['#6a3518', '#3b4352', '#7a5208', '#1b5850', '#28338c', '#4a1f6e'];
const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
};
const poly = (n: number, r: number, rot = -90) => Array.from({ length: n }, (_, i) => pt(r, rot + (360 / n) * i)).join(' ');
const star = (points: number, ro: number, ri: number) => Array.from({ length: points * 2 }, (_, i) => pt(i % 2 ? ri : ro, -90 + (180 / points) * i)).join(' ');
const RAYS = Array.from({ length: 8 }, (_, i) => [pt(43, -67.5 + 45 * i), pt(49, -67.5 + 45 * i)]);
const SHIELD = 'M50 7 L85 19 V47 C85 71 70 85 50 93 C30 85 15 71 15 47 V19 Z';
const SHIELD_IN = 'M50 16 L77 25 V47 C77 66 66 77 50 84 C34 77 23 66 23 47 V25 Z';
const HEX = poly(6, 42);
const HEX_IN = poly(6, 33);
const OCT = poly(8, 39, -112.5);
const OCT_IN = poly(8, 30, -112.5);
const STAR = star(12, 48, 39);

type Paint = { fill: string; stroke: string; strokeWidth: number; opacity?: number };

function Outer({ tier, ...p }: { tier: number } & Paint) {
  const common = { ...p, strokeLinejoin: 'round' as const };
  switch (tier) {
    case 0: return <circle cx="50" cy="50" r="38" {...common} />;
    case 1: return <circle cx="50" cy="50" r="40" {...common} />;
    case 2: return <path d={SHIELD} {...common} />;
    case 3: return <polygon points={HEX} {...common} />;
    case 4: return <polygon points={OCT} {...common} />;
    default: return <polygon points={STAR} {...common} />;
  }
}

function Inner({ tier, ...p }: { tier: number } & Paint) {
  switch (tier) {
    case 0: return <circle cx="50" cy="50" r="31" {...p} />;
    case 1: return <circle cx="50" cy="50" r="32" {...p} />;
    case 2: return <path d={SHIELD_IN} {...p} />;
    case 3: return <polygon points={HEX_IN} {...p} />;
    case 4: return <polygon points={OCT_IN} {...p} />;
    default: return <circle cx="50" cy="50" r="31" {...p} />;
  }
}

/** The icon, three times over: a drop shadow, the see-through enamel, the metal line. */
function Glass({ Icon, ink, metal }: { Icon: LucideIcon; ink: string; metal: string }) {
  const at = { x: 29, width: 42, height: 42 };
  return (
    <>
      <Icon {...at} y={30.6} color="rgb(0 0 0 / 0.5)" strokeWidth={2.8} fill="none" aria-hidden />
      <Icon {...at} y={29} color="none" fill={ink} fillOpacity={0.42} aria-hidden />
      <Icon {...at} y={29} color={metal} strokeWidth={2.3} fill="none" aria-hidden />
    </>
  );
}

function Crest({ tier, children }: { tier: number; children?: React.ReactNode }) {
  const metal = `url(#ach-m${tier})`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="ach-crest">
      {tier === 4 && RAYS.map(([a, b], i) => {
        const [x1, y1] = a.split(','), [x2, y2] = b.split(',');
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={metal} strokeWidth={3} strokeLinecap="round" />;
      })}
      <Outer tier={tier} fill={ENAMEL[tier]} stroke={metal} strokeWidth={6} />
      <Inner tier={tier} fill="none" stroke={metal} strokeWidth={1.3} opacity={0.6} />
      <ellipse cx="38" cy="33" rx="20" ry="9" fill="rgb(255 255 255 / 0.13)" transform="rotate(-28 38 33)" />
      {children}
    </svg>
  );
}

/** A card's pin. Locked, CSS turns it into a grey silhouette. */
export function PinArt({ id, tier, className }: { id: string; tier: number; className?: string }) {
  const { icon, ink } = artOf(id);
  return (
    <span className={cx('ach-pin', className)}>
      <Crest tier={tier}>
        <Glass Icon={icon} ink={INK[ink]} metal={`url(#ach-mi${tier})`} />
      </Crest>
    </span>
  );
}

/** A plain steel coin with an icon, for a rank when no card is worn. */
export function SteelPin({ icon }: { icon: LucideIcon }) {
  return (
    <span className="ach-pin">
      <svg viewBox="0 0 100 100" aria-hidden className="ach-crest">
        <circle cx="50" cy="50" r="38" fill="#2a3244" stroke={`url(#ach-m${STEEL_T})`} strokeWidth={6} />
        <circle cx="50" cy="50" r="31" fill="none" stroke={`url(#ach-m${STEEL_T})`} strokeWidth={1.3} opacity={0.6} />
        <ellipse cx="38" cy="33" rx="20" ry="9" fill="rgb(255 255 255 / 0.13)" transform="rotate(-28 38 33)" />
        <Glass Icon={icon} ink={INK.ivory} metal={`url(#ach-mi${STEEL_T})`} />
      </svg>
    </span>
  );
}

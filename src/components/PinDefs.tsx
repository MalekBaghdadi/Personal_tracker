/*
 * The metal gradients every achievement pin uses (components/PinArt.tsx),
 * defined once by the app shell. Kept apart from the pins so the shell
 * doesn't load every card's icon.
 */

const METAL = [
  ['#6b3f22', '#c98a55', '#f3c896', '#a8683a', '#5e3519'],
  ['#59626f', '#c4ccd8', '#f7f9fc', '#9aa5b3', '#4f5763'],
  ['#7a5410', '#e1b53f', '#fff3b8', '#c8961f', '#6e4b0c'],
  ['#2f625c', '#8fdccd', '#f4fffc', '#6cbcae', '#2a5550'],
  ['#2e3f9e', '#8db3ff', '#f3f7ff', '#a68cff', '#33288a'],
  ['#ff5f6d', '#ffc371', '#f9f871', '#5ef2b0', '#4fc3f7', '#a78bfa', '#f472b6'],
];
/** The plain steel of a medallion with no card worn. */
const STEEL = ['#3a455e', '#8590a3', '#c4ccd8', '#6c7890', '#2c3549'];

/** The steel's index, after the six tiers: `ach-m6`, `ach-mi6`. */
export const STEEL_T = METAL.length;

/** Metal gradients, in the crest's 100-unit space (m) and an icon's 24-unit space (mi), so straight lines get them too. */
export function PinDefs() {
  const grads = [...METAL, STEEL];
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <defs>
        {grads.map((stops, t) => {
          const s = stops.map((c, i) => <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />);
          return [
            <linearGradient key={`m${t}`} id={`ach-m${t}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">{s}</linearGradient>,
            <linearGradient key={`mi${t}`} id={`ach-mi${t}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">{s}</linearGradient>,
          ];
        })}
      </defs>
    </svg>
  );
}

/*
 * Compete trash talk. Each viewer sees their own version: "{them}" is the
 * other person's name, "{gap}" the formatted margin. Picked by a seed (a card
 * and the day), so a line holds still all day and changes tomorrow.
 */

export type TauntKind =
  | 'ahead' | 'behind' | 'level' | 'idle' | 'bothIdle'
  | 'wonWeek' | 'lostWeek' | 'drewWeek'
  | 'wonChallenge' | 'lostChallenge' | 'drewChallenge'
  | 'theyReached' | 'iReached';

export const TAUNTS: Record<TauntKind, string[]> = {
  ahead: [
    '{them} should consider retirement.',
    '{them} is studying the art of losing.',
    'Someone check on {them}.',
    '{them} has been notified of their defeat.',
    '{them} is just here for the participation trophy.',
    '{them} is taking notes on how it’s done.',
    'At this point it’s just bullying. Keep going.',
    '{them} called. They want their dignity back.',
  ],
  behind: [
    'Embarrassing, honestly.',
    'Did you forget how to study?',
    'The couch is winning.',
    '{them} hasn’t even broken a sweat.',
    'Bold of you to open this tab.',
    '{them} would like to thank you for your cooperation.',
    'Somewhere, {them} is laughing.',
    'Maybe put the phone down and do something?',
  ],
  level: [
    'Tied. Neither of you is impressive.',
    'Dead even. Somebody do something.',
    'A race of equals. Sadly.',
    'Neck and neck, and both necks look tired.',
  ],
  idle: [
    'Are you even trying?',
    '{them} sends their regards.',
    'An empty week. Truly a choice.',
    'Zero. A bold strategy. Let’s see if it pays off.',
  ],
  bothIdle: [
    'Nobody’s logged anything. A thrilling race.',
    '0 to 0. Riveting stuff.',
    'Two competitors, zero effort.',
  ],
  wonWeek: [
    '{them}, take notes.',
    '{them} put up a fight. A small one.',
    '{them} is drafting their excuses.',
    'Frame this one.',
  ],
  lostWeek: [
    'Tragic.',
    '{them} won’t let you forget this.',
    'Maybe try opening a book?',
    'Character building, they call it.',
  ],
  drewWeek: [
    'Nobody wins, especially not your pride.',
    'A draw. How thrillingly mediocre.',
  ],
  wonChallenge: [
    '{them} is in shambles.',
    'Absolute domination.',
    '{them} asked for this.',
  ],
  lostChallenge: [
    'You’ll want to delete this app.',
    '{them} will be bringing this up at family dinners.',
    'Rough. Really rough.',
  ],
  drewChallenge: [
    'All that effort for a tie.',
  ],
  theyReached: [
    'Clock’s ticking. Do something.',
    '{them} is already celebrating.',
  ],
  iReached: [
    'Now hold on until midnight.',
    '{them} is sweating.',
  ],
};

/** Small stable string hash (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function taunt(kind: TauntKind, seed: string, them: string, gap = ''): string {
  const lines = TAUNTS[kind];
  return lines[hash(`${kind}:${seed}`) % lines.length].replace(/\{them\}/g, them).replace(/\{gap\}/g, gap);
}

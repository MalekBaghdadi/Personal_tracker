/*
 * Compete trash talk. Every line has a speaker: whoever is winning talks to
 * the other one (when I'm ahead it's me talking to them; when I'm behind it's
 * them talking to me), and a tie goes to the ref. Each viewer sees their own
 * version. Picked by a seed (a card and the day), so a line holds still all
 * day and changes tomorrow.
 *
 * Placeholders: {me} and {them} are the two names, {metric} the metric, {gap}
 * the margin. {winToday}/{loseToday} are today's totals and {winLogs}/{loseLogs}
 * today's log counts ("3 logs"), set only when the speaker is also ahead
 * today. A line is only picked when all its placeholders are known.
 */

export type TauntKind =
  | 'ahead' | 'behind' | 'level' | 'idle' | 'bothIdle'
  | 'wonWeek' | 'lostWeek' | 'drewWeek'
  | 'wonChallenge' | 'lostChallenge' | 'drewChallenge'
  | 'theyReached' | 'iReached';

/** Who says it: me (to them), them (to me), or the ref. */
export type Speaker = 'me' | 'them' | 'ref';

export const SPEAKER: Record<TauntKind, Speaker> = {
  ahead: 'me', iReached: 'me', wonWeek: 'me', wonChallenge: 'me',
  behind: 'them', idle: 'them', theyReached: 'them', lostWeek: 'them', lostChallenge: 'them',
  level: 'ref', bothIdle: 'ref', drewWeek: 'ref', drewChallenge: 'ref',
};

export const TAUNTS: Record<TauntKind, string[]> = {
  // Me, to them.
  ahead: [
    '{them}, I’m {gap} ahead on {metric}. Want a head start next week?',
    '{gap} ahead, {them}. Should I slow down?',
    '{them}, consider retirement.',
    '{them}, I could take a day off and still win.',
    'Still {gap} up, {them}. Wake me when it gets close.',
    '{winToday} today, {them}. You did {loseToday}. Keep up.',
    '{winLogs} today, {them}. You? {loseLogs}.',
    '{them}, at this point it’s bullying. I’m not stopping.',
    '{them}, take notes. This is what {metric} looks like.',
  ],
  // Them, to me.
  behind: [
    '{gap} behind me on {metric}, {me}. Embarrassing.',
    '{me}, did you forget how {metric} works?',
    'The couch is winning, {me}. So am I.',
    'I’m {gap} up and I haven’t even broken a sweat.',
    'Bold of you to open this tab, {me}.',
    '{winToday} today, {me}. You managed {loseToday}.',
    '{winLogs} today. You? {loseLogs}. Do something, {me}.',
    'Put the phone down and do some {metric}, {me}.',
  ],
  idle: [
    '{me}, zero? Are you even trying?',
    'I’m at {gap}. You’re at zero. Thoughts, {me}?',
    'An empty week, {me}. Bold strategy.',
    'Say hi to the couch for me, {me}.',
  ],
  // The ref.
  level: [
    'Dead even. {me}, {them}: somebody do something.',
    'Tied. Neither of you is impressing anyone.',
    'Neck and neck, and both necks look tired.',
    '{me} vs {them}: dead heat. Next log takes the lead.',
  ],
  bothIdle: [
    'Nothing logged by either of you. Thrilling.',
    '0 to 0. Riveting stuff, {me} and {them}.',
    'Two competitors, zero {metric}.',
  ],
  // Me, to them.
  wonWeek: [
    '{them}, take notes for next week.',
    'The week’s mine, {them}. By {gap}.',
    '{them}, start drafting your excuses.',
    'Frame this one, {them}. I will.',
  ],
  // Them, to me.
  lostWeek: [
    'The week’s mine, {me}. By {gap}. Tragic.',
    '{me}, I won’t let you forget this.',
    'Maybe try some {metric} next week, {me}?',
    'Character building, {me}. You’re welcome.',
  ],
  drewWeek: [
    'A draw. Nobody wins, especially not your pride.',
    '{me} and {them}: thrillingly mediocre.',
  ],
  wonChallenge: [
    '{them}, you’re in shambles.',
    'Absolute domination, {them}. By {gap}.',
    '{them}, you asked for this.',
  ],
  lostChallenge: [
    'You’ll want to delete this app, {me}.',
    'I’ll be bringing this up at family dinners, {me}.',
    'Rough, {me}. Really rough.',
  ],
  drewChallenge: [
    'All that effort for a tie.',
    'A tie. {me} and {them} both need to try harder.',
  ],
  theyReached: [
    'Got there first, {me}. Clock’s ticking.',
    'I’m already celebrating, {me}.',
  ],
  iReached: [
    'Got there, {them}. Now I just hold on till the day ends.',
    '{them}, you’re sweating. I can tell.',
  ],
};

export interface TauntFacts {
  /** Names: mine and the other person's. */
  me: string;
  them: string;
  metric?: string;
  /** The margin, already formatted ("2h 10m", "3 days"). */
  gap?: string;
  /** Today's totals, and how to show one. */
  today?: { me: number; them: number; fmt: (v: number) => string };
  /** Today's number of logs, when both are known (a challenge day). */
  logs?: { me: number; them: number };
}

const logWord = (n: number) => (n === 0 ? 'nothing' : n === 1 ? '1 log' : `${n} logs`);

/** The placeholders for one speaker: today's figures only when the speaker is ahead today too. */
function fill(speaker: Speaker, f: TauntFacts): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = { me: f.me, them: f.them, metric: f.metric, gap: f.gap };
  if (speaker === 'ref') return vars;
  const win = speaker === 'me' ? 'me' : 'them';
  const lose = speaker === 'me' ? 'them' : 'me';
  if (f.today && f.today[win] > f.today[lose]) {
    vars.winToday = f.today.fmt(f.today[win]);
    vars.loseToday = f.today[lose] === 0 ? 'nothing' : f.today.fmt(f.today[lose]);
  }
  if (f.logs && f.logs[win] > f.logs[lose]) {
    vars.winLogs = logWord(f.logs[win]);
    vars.loseLogs = logWord(f.logs[lose]);
  }
  return vars;
}

/** Small stable string hash (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function taunt(kind: TauntKind, seed: string, facts: TauntFacts): { line: string; speaker: Speaker } {
  const speaker = SPEAKER[kind];
  const vars = fill(speaker, facts);
  const usable = TAUNTS[kind].filter((l) => [...l.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1]]));
  const line = usable[hash(`${kind}:${seed}`) % usable.length];
  return { line: line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k]!), speaker };
}

import type { ThemeId } from './types';

/*
 * Every achievement: ladders that climb from easy to brutal (Bronze to
 * Mythic), plus secrets. Content only; lib/achievements.ts decides what's
 * unlocked. Ids are stored on collected cards, so never rename one: add new
 * ladders or steps instead.
 */

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export const TIERS: { name: string; xp: number }[] = [
  { name: 'Bronze', xp: 10 },
  { name: 'Silver', xp: 25 },
  { name: 'Gold', xp: 50 },
  { name: 'Platinum', xp: 100 },
  { name: 'Diamond', xp: 200 },
  { name: 'Mythic', xp: 400 },
];

/** Themed ladders count a theme's metrics together; the rest count everything. */
export type LadderKind =
  | 'session' | 'hours' | 'days'
  | 'streak' | 'sweep' | 'perfectWeek' | 'showUp'
  | 'bigDay' | 'bigWeek' | 'over'
  | 'finisher' | 'tasks'
  | 'weeksWon' | 'challengesWon'
  | 'earlyBird' | 'nightOwl' | 'notes';

export type Group = 'theme' | 'streaks' | 'grind' | 'goals' | 'compete' | 'habits';

export const GROUPS: { id: Exclude<Group, 'theme'>; title: string; emoji: string }[] = [
  { id: 'streaks', title: 'Streaks', emoji: '🔥' },
  { id: 'grind', title: 'The grind', emoji: '⚙️' },
  { id: 'goals', title: 'Goals & plans', emoji: '🏁' },
  { id: 'compete', title: 'Compete', emoji: '🏆' },
  { id: 'habits', title: 'Odd hours & notes', emoji: '🦉' },
];

export interface Card {
  name: string;
  flavor: string;
  /** A main emoji and an optional smaller one beside it. */
  art: [string, string?];
}

export interface Step extends Card {
  /** Threshold in the ladder's unit: seconds for time, a plain number otherwise (a multiple for 'over'). */
  at: number;
}

export interface Ladder {
  id: string;
  kind: LadderKind;
  theme?: ThemeId;
  group: Group;
  title: string;
  steps: Step[];
}

export interface Secret extends Card {
  id: string;
  key: SecretKey;
  tier: Tier;
  /** Shown once found. */
  need: string;
  /** Shown while it's still a secret. */
  hint: string;
}

export type SecretKey =
  | 'over9000' | 'hibernation' | 'speedrun' | 'newYear' | 'weekendWarrior' | 'phoenix' | 'photoFinish' | 'paidInFull'
  | 'earlyFinisher' | 'strategicRest' | 'timeTraveller' | 'juggler' | 'forgotTimer' | 'bullseye' | 'essayist' | 'mondayPerson';

const M = 60;
const H = 3600;

type Row = [name: string, art: string, flavor: string];

const art = (s: string): [string, string?] => {
  const [a, b] = s.split(' ');
  return b ? [a, b] : [a];
};

function ladder(id: string, kind: LadderKind, group: Group, title: string, at: number[], rows: Row[], theme?: ThemeId): Ladder {
  if (at.length !== rows.length) throw new Error(`ladder ${id}: ${at.length} thresholds, ${rows.length} cards`);
  return { id, kind, group, title, theme, steps: rows.map(([name, a, flavor], i) => ({ at: at[i], name, flavor, art: art(a) })) };
}

const DAYS = [7, 30, 75, 150, 300, 500];
const LONG = [1 * H, 2 * H, 3 * H, 5 * H, 8 * H, 10 * H];
const MID = [30 * M, 1 * H, 2 * H, 3 * H, 5 * H, 8 * H];
const BIG_HOURS = [10, 50, 100, 250, 500, 1000].map((h) => h * H);
const MID_HOURS = [10, 25, 50, 100, 250, 500].map((h) => h * H);

interface ThemeCards {
  theme: ThemeId;
  session?: { at: number[]; rows: Row[] };
  hours?: { at: number[]; rows: Row[] };
  days: Row[];
}

const THEMED: ThemeCards[] = [
  {
    theme: 'study',
    session: {
      at: LONG,
      rows: [
        ['Opened the Book', '📖 👀', 'A whole hour. The highlighters are nervous.'],
        ['Locked In', '🔒 📚', 'Two hours. Phone face down. Group chat in shambles.'],
        ['Library Goblin', '🧌 📚', 'Three hours straight. Lives between the shelves now.'],
        ['Chair-Shaped', '🪑 🫠', 'Five hours. You and the chair are one entity.'],
        ['Full-Time Nerd', '💼 🤓', 'Eight hours, no lunch break, no salary. Respect.'],
        ['Academic Menace', '🤓 📚', 'Ten hours straight. The library closed. You didn’t.'],
      ],
    },
    hours: {
      at: BIG_HOURS,
      rows: [
        ['Fresh Highlighter', '🖍️ ✨', 'Ten hours in. The highlighter still has hope.'],
        ['Flashcard Fiend', '🗂️ 😈', 'Fifty hours. You dream in question-and-answer format.'],
        ['Triple-Digit Brain', '🧠 💯', '100 hours. Your brain asked for a raise.'],
        ['Walking Encyclopedia', '📚 🚶', '250 hours. People ask you things at parties now.'],
        ['Tenured', '🎓 🏛️', '500 hours. There’s a bench with your name on it.'],
        ['Galaxy Brain', '🌌 🧠', '1,000 hours. Your thoughts have their own gravity.'],
      ],
    },
    days: [
      ['Study Buddy', '📒 🤝', 'Seven study days. The desk remembers your face.'],
      ['Teacher’s Pet', '🍎 ⭐', 'Thirty days on target. Gold stars all round.'],
      ['Dean’s List', '📜 🏅', '75 study days. Framed. On the fridge.'],
      ['Study Machine', '🤖 📚', '150 days. Beep boop. Knowledge acquired.'],
      ['Scholar Supreme', '👑 🎓', '300 study days. Exams fear you now.'],
      ['Final Boss of Finals', '🐉 📝', '500 study days. The exam studies you.'],
    ],
  },
  {
    theme: 'code',
    session: {
      at: LONG,
      rows: [
        ['Hello, World', '👋 💻', 'One focused hour. It compiled first try. (It didn’t.)'],
        ['In the Zone', '🎧 💻', 'Two hours. Headphones on, world off.'],
        ['Rubber Duck Whisperer', '🦆 💬', 'Three hours. You explained it to the duck. It understood.'],
        ['Tab Hoarder', '🗂️ 🌀', 'Five hours straight. Forty tabs open. Closing none.'],
        ['Works on My Machine', '🖥️ 🤷', 'Eight hours straight. It runs on yours. Ship it.'],
        ['Touch Grass? Never Heard of It', '🌱 🚫', 'Ten hours straight. The grass outside filed a missing-person report.'],
      ],
    },
    hours: {
      at: BIG_HOURS,
      rows: [
        ['Fixed Stuff', '🔧 📝', 'Ten hours. Every commit message just says “fix”.'],
        ['Coffee-to-Code Converter', '☕ ⚙️', 'Fifty hours. Input: coffee. Output: this.'],
        ['Senior in Spirit', '🧓 💻', '100 hours. You answer everything with “it depends”.'],
        ['10x (Self-Certified)', '📜 ⚡', '250 hours. The certificate is homemade. The skill isn’t.'],
        ['Legacy Code', '🏛️ 💾', '500 hours. Future people will find your work and wonder.'],
        ['The Algorithm', '🧠 🌐', '1,000 hours. You don’t use the algorithm. You are it.'],
      ],
    },
    days: [
      ['Clocked In', '⏰ 💼', 'Seven work days. The grind has noticed you.'],
      ['Green Squares Enjoyer', '🟩 😌', 'Thirty days of green squares. Very satisfying.'],
      ['Sprint Champion', '🏃 📋', '75 days. A whole sprint and nobody cried.'],
      ['Employee of Every Month', '🏆 📸', '150 days. Your photo is on the wall. Permanently.'],
      ['Pull Request Royalty', '👑 🔀', '300 days. Approved. Merged. Legendary.'],
      ['Founder Energy', '🚀 🦄', '500 days. Investors are circling. Probably.'],
    ],
  },
  {
    theme: 'reading',
    session: {
      at: MID,
      rows: [
        ['Just One Chapter', '📖 🤞', 'Half an hour. “Just one chapter.” Sure.'],
        ['Page Turner', '📑 💨', 'An hour straight. The pages turn themselves now.'],
        ['Lost in the Plot', '🧭 📚', 'Two hours. You forgot you were a person in a room.'],
        ['Do Not Disturb', '🚪 📕', 'Three hours. Knocking is pointless. They’re in another world.'],
        ['Spine Breaker', '📚 💥', 'Five hours straight. The book’s spine gave up. So did yours.'],
        ['One-Sitting Wonder', '🛋️ 📗', 'Eight hours straight. Started it, finished it, never moved.'],
      ],
    },
    hours: {
      at: MID_HOURS,
      rows: [
        ['Bookworm Hatchling', '🐛 📖', 'Ten hours of reading. A tiny bookworm is born.'],
        ['Bookmark Collector', '🔖 📚', '25 hours. Your bookmarks have bookmarks.'],
        ['Library Card Maxed', '💳 📚', '50 hours. The librarian knows your name. And your fines.'],
        ['Saw the Twist Coming', '🌪️ 🕵️', '100 hours. You called that twist three books ago.'],
        ['Walking Library', '🚶 📚', '250 hours. More book than person at this point.'],
        ['Owl of Wisdom', '🦉 📜', '500 hours. Owls come to you for recommendations.'],
      ],
    },
    days: [
      ['Bedtime Story', '🌙 📖', 'A week of reading days. Tucked in, chapter done.'],
      ['Book Club President', '🎙️ 📚', 'Thirty reading days. You’ve read it. Have they?'],
      ['Shelf Esteem', '😎 📚', '75 days. Your bookshelf has never felt better about itself.'],
      ['TBR Destroyer', '🧨 📚', '150 days. The to-be-read pile is finally scared.'],
      ['Novel Idea', '💡 📕', '300 reading days. A novel idea: keep going.'],
      ['Reader of Legend', '🐉 📖', '500 reading days. Libraries whisper about you.'],
    ],
  },
  {
    theme: 'fitness',
    session: {
      at: [30 * M, 1 * H, 90 * M, 2 * H, 3 * H, 5 * H],
      rows: [
        ['Warm-Up Act', '🤸 🔥', 'Thirty minutes of moving. The couch felt that.'],
        ['Sweat Equity', '💦 💪', 'A full hour. Investing in the only body you’ve got.'],
        ['Beast Mode: Loading', '🦍 ⏳', 'Ninety minutes. 87% beast, 13% loading.'],
        ['Gym Hostage', '🏋️ ⛓️', 'Two hours straight. Somebody check on them.'],
        ['Training Montage', '🎬 🏃', 'Three hours. There’s an anthem playing in your head.'],
        ['Absolute Unit', '🦬 💪', 'Five hours straight. Scientists would like a word.'],
      ],
    },
    hours: {
      at: MID_HOURS,
      rows: [
        ['Couch Escapee', '🛋️ 🏃', 'Ten hours of exercise. The couch misses you.'],
        ['Shake Sommelier', '🥤 👃', '25 hours. You can taste vanilla versus “vanilla”.'],
        ['Mirror Selfie Pro', '🤳 💪', '50 hours. Every mirror is a check-in now.'],
        ['Swole Era', '💪 📈', '100 hours. The “before” photo is ancient history.'],
        ['Cardio Cryptid', '🦶 🌲', '250 hours. Blurry sightings reported at dawn, running.'],
        ['Greek Statue', '🏛️ 🗿', '500 hours. Museums keep calling.'],
      ],
    },
    days: [
      ['Showed Up', '👟 ✅', 'Seven active days. Showing up is most of it.'],
      ['Gym Rat', '🐀 🏋️', 'Thirty days. You know which machines squeak.'],
      ['Never Skips Leg Day', '🦵 📅', '75 days. Both legs present and accounted for.'],
      ['Swole Patrol', '🚓 💪', '150 days. Policing skipped workouts since forever.'],
      ['Iron Monk', '🧘 🏋️', '300 days. Discipline is just your personality now.'],
      ['Olympian (Self-Declared)', '🥇 🔥', '500 active days. The committee hasn’t called. Their loss.'],
    ],
  },
  {
    theme: 'mind',
    session: {
      at: [10 * M, 20 * M, 30 * M, 45 * M, 1 * H, 2 * H],
      rows: [
        ['Deep Breath', '🌬️ 😌', 'Ten quiet minutes. In through the nose, out through the chaos.'],
        ['Inner Peace (Loading…)', '🧘 ⏳', 'Twenty minutes. Peace is 40% downloaded.'],
        ['Chill Wizard', '🧙 🍵', 'Thirty minutes. Tea levitates in your presence.'],
        ['Monk Mode', '🏔️ 🧘', '45 minutes still. A mountain asked you for advice.'],
        ['Zen Master', '☯️ 🌸', 'A full hour. Even your thoughts take turns politely.'],
        ['Ascended', '🕊️ ✨', 'Two hours of stillness. You may be partially cloud.'],
      ],
    },
    hours: {
      at: [2, 5, 10, 25, 50, 100].map((h) => h * H),
      rows: [
        ['Calm-ish', '🙂 🌿', 'Two hours of calm. Noticeably less yelling at printers.'],
        ['Vibe Curator', '🎐 ✨', 'Five hours. Your aura is very well organised.'],
        ['Pocket Monk', '🧘 👖', 'Ten hours. Portable calm, available anywhere.'],
        ['Stress Repellent', '🛡️ 🌊', '25 hours. Problems slide off you like water off a duck.'],
        ['Unbothered Royalty', '👑 😌', '50 hours. Moisturised. Unbothered. Thriving.'],
        ['Enlightened (Allegedly)', '💡 🪷', '100 hours. Allegedly enlightened. Definitely unbothered.'],
      ],
    },
    days: [
      ['Breathing on Purpose', '🫁 ✅', 'Seven calm days. Breathing, but on purpose now.'],
      ['Main Character Calm', '🌅 😌', 'Thirty days. Walking slowly in the rain, with intent.'],
      ['Thoughts: Organised', '🗃️ 🧠', '75 days. Your brain has labelled drawers now.'],
      ['Serenity Now', '🏝️ 🧘', '150 days. Peaceful in a way that annoys loud people.'],
      ['Lotus Legend', '🪷 👑', '300 days. The pond would like you back.'],
      ['Human Wind Chime', '🎐 🕊️', '500 days. Calm enough that birds land on you.'],
    ],
  },
  {
    theme: 'creative',
    session: {
      at: MID,
      rows: [
        ['Doodle Mode', '✏️ 🌀', 'Thirty minutes of making. The muse waved.'],
        ['Muse on Speed Dial', '📞 🎨', 'An hour straight. The muse picked up.'],
        ['Garage Band', '🎸 🚗', 'Two hours. The neighbours have opinions. Ignore them.'],
        ['Tortured Artist', '🎭 😩', 'Three hours. It’s not finished. It’s never finished.'],
        ['Creative Frenzy', '🌪️ 🎨', 'Five hours straight. Paint on your face, ideas in your hair.'],
        ['Magnum Opus', '🖼️ 👑', 'Eight hours straight. Somewhere, a museum curator shivers.'],
      ],
    },
    hours: {
      at: MID_HOURS,
      rows: [
        ['Sketchbook Owner', '📓 ✏️', 'Ten hours of making. The sketchbook isn’t blank anymore.'],
        ['Open Mic Brave', '🎤 😅', '25 hours. Ready for a small, forgiving audience.'],
        ['Starving Artist (Snacked)', '🍜 🎨', '50 hours. Starving for art. Fed on instant noodles.'],
        ['Local Legend', '🌟 🎶', '100 hours. The coffee shop wants you on Thursdays.'],
        ['Main Stage', '🎆 🎤', '250 hours. Lights. Crowd. Encore.'],
        ['Renaissance Soul', '🖌️ 🏛️', '500 hours. Da Vinci would follow you back.'],
      ],
    },
    days: [
      ['Daily Doodler', '✏️ 📅', 'Seven creative days. The habit has a pulse.'],
      ['Muse Magnet', '🧲 ✨', 'Thirty days. Inspiration shows up because you do.'],
      ['Practice Room Regular', '🎹 🚪', '75 days. You have a favourite chair in there.'],
      ['Portfolio Pro', '🗂️ 🌟', '150 days of making. That’s a portfolio, friend.'],
      ['Gallery Ready', '🖼️ 🎟️', '300 days. Tickets on sale soon.'],
      ['Living Masterpiece', '🎨 👑', '500 creative days. You are the art now.'],
    ],
  },
  {
    theme: 'health',
    days: [
      ['Hydro Homie', '💧 🤙', 'Seven healthy days. Your cells say thank you.'],
      ['Salad Days', '🥗 😇', 'Thirty days on target. Your body sent a thank-you card.'],
      ['Doctor’s Favourite', '🩺 ❤️', '75 days. Your doctor is going to be so smug.'],
      ['Premium Fuel', '⛽ 🥦', '150 days. Only the good stuff goes in.'],
      ['Immune System MVP', '🦠 🛡️', '300 days. Germs check your calendar before visiting.'],
      ['Built to Last', '🏰 💚', '500 healthy days. Engineered for the long haul.'],
    ],
  },
  {
    theme: 'sleep',
    days: [
      ['Pillow Pal', '🛏️ 😴', 'Seven good nights. Your pillow finally trusts you.'],
      ['Well Rested', '😌 ☁️', 'Thirty nights on target. You look different. Rested?'],
      ['Dream Team', '💭 🌙', '75 nights. Your dreams have plotlines now.'],
      ['Professional Napper', '💤 💼', '150 nights. Sleeping is a career and you’re senior staff.'],
      ['Sleep Royalty', '👑 🛌', '300 nights. Bow before the well rested.'],
      ['Sandman’s Apprentice', '⏳ 🌙', '500 good nights. The Sandman sends you the rota.'],
    ],
  },
  {
    theme: 'other',
    session: {
      at: LONG,
      rows: [
        ['Warmed Up', '🔥 ⏱️', 'One straight hour. Engines running.'],
        ['Tunnel Vision', '🚇 👀', 'Two hours. There is only the task.'],
        ['Deep in It', '🤿 🌊', 'Three hours. You’re deep now. Bring snacks.'],
        ['Lost Track of Time', '🕰️ 🌀', 'Five hours straight. What year is it?'],
        ['Full-Time Grind', '⚙️ 💼', 'Eight hours straight. That’s a job. You’re unpaid. Iconic.'],
        ['Absolute Menace', '😈 ⏱️', 'Ten hours straight. Nobody could stop you. Nobody tried.'],
      ],
    },
    hours: {
      at: BIG_HOURS,
      rows: [
        ['Getting Somewhere', '🧭 ✨', 'Ten hours in. It’s becoming a thing.'],
        ['Dedicated', '📌 💪', 'Fifty hours. That’s commitment.'],
        ['Hundred-Hour Club', '💯 🕰️', '100 hours. The club has jackets.'],
        ['Seasoned', '🧂 🎖️', '250 hours. Well seasoned. Lightly salted.'],
        ['Veteran', '🎖️ 🛡️', '500 hours. You’ve seen things.'],
        ['Thousand-Hour Titan', '🗿 ⏳', '1,000 hours. A tenth of the way to mastery, apparently.'],
      ],
    },
    days: [
      ['Habit Hatched', '🐣 ✅', 'Seven days on target. A habit has hatched.'],
      ['Creature of Habit', '🦎 📅', 'Thirty days. Routine is your love language.'],
      ['Reliable', '🧱 👍', '75 days. People set their clocks by you.'],
      ['Unstoppable', '🚂 💨', '150 days. The train has left. You are the train.'],
      ['Legendary Consistency', '🏆 📅', '300 days. Write a book about it. Seriously.'],
      ['Human Calendar', '🗓️ 🤖', '500 days. You don’t check the date. The date checks you.'],
    ],
  },
];

const themedLadders: Ladder[] = THEMED.flatMap((t) => [
  ...(t.session ? [ladder(`${t.theme}.session`, 'session', 'theme', 'Longest session', t.session.at, t.session.rows, t.theme)] : []),
  ...(t.hours ? [ladder(`${t.theme}.hours`, 'hours', 'theme', 'Hours in total', t.hours.at, t.hours.rows, t.theme)] : []),
  ladder(`${t.theme}.days`, 'days', 'theme', t.theme === 'sleep' ? 'Nights on target' : 'Days on target', DAYS, t.days, t.theme),
]);

const sharedLadders: Ladder[] = [
  ladder('streak', 'streak', 'streaks', 'Best streak', [3, 7, 14, 30, 100, 365], [
    ['Hat Trick', '🎩 🔥', 'Three in a row. That’s a pattern, not a fluke.'],
    ['Week Warrior', '🗡️ 🔥', 'Seven days straight. The streak has a heartbeat.'],
    ['Fortnight Fiend', '😈 🔥', 'Two weeks without missing. Suspiciously consistent.'],
    ['Monthly Menace', '📅 🔥', 'Thirty days. This isn’t a phase anymore.'],
    ['Triple Digits', '💯 🔥', '100 days straight. Start writing the memoir.'],
    ['It’s Not a Phase', '🌍 🔥', 'A full year unbroken. Seasons changed. You didn’t.'],
  ]),
  ladder('sweep', 'sweep', 'streaks', 'Clean sweeps', [1, 7, 30, 75, 150, 365], [
    ['Clean Sweep', '🧹 ✨', 'Every target, one day. Chef’s kiss.'],
    ['Spotless', '🧽 ✨', 'Seven days with everything done. Suspicious.'],
    ['Perfectionist', '🔍 💎', 'Thirty perfect days. Not a single thing left undone.'],
    ['Overachiever’s Overachiever', '📈 🏅', '75 perfect days. Other overachievers look up to you.'],
    ['Flawless Victory', '🥋 🏆', '150 days with every box ticked. Flawless.'],
    ['Living Checklist', '✅ 👑', '365 perfect days. You don’t have to-dos. You have dones.'],
  ]),
  ladder('perfectWeek', 'perfectWeek', 'streaks', 'Perfect weeks', [1, 3, 8, 20, 40, 52], [
    ['Perfect Week', '🗓️ ⭐', 'A whole week, every due day done. Beautiful.'],
    ['Weekly Wonder', '🌈 🗓️', 'Three perfect weeks. Monday no longer scares you.'],
    ['Mondays Fear You', '😱 📅', 'Eight perfect weeks. Mondays have started to dread you.'],
    ['Well-Oiled Machine', '⚙️ 🛢️', '20 perfect weeks. Smooth. Quiet. Terrifying.'],
    ['Calendar Conqueror', '⚔️ 🗓️', '40 perfect weeks. The calendar surrendered.'],
    ['Full Deck', '🃏 👑', '52 perfect weeks. A full deck. Flex accordingly.'],
  ]),
  ladder('showUp', 'showUp', 'streaks', 'Showing up', [7, 30, 100, 200, 365, 730], [
    ['Regular', '☕ 👋', 'Seven days with something logged. The usual?'],
    ['Part of the Furniture', '🛋️ 🙂', 'Thirty days of showing up. You’re basically decor.'],
    ['Lives Here Now', '🏠 📒', '100 days. Should we start charging rent?'],
    ['Logbook Loyalist', '🫡 📘', '200 days. The app would lend you money.'],
    ['Year One', '🎂 📘', '365 days logged. Happy logbook-iversary.'],
    ['Two-Year Legend', '🏛️ 📘', '730 days. We should frame you.'],
  ]),
  ladder('bigDay', 'bigDay', 'grind', 'Biggest day', [3, 5, 7, 9, 11, 13].map((h) => h * H), [
    ['Productive-ish', '🙂 ⏱️', 'Three hours in one day. Respectable.'],
    ['Overtime', '🕔 💪', 'Five hours in a day. Somebody’s motivated.'],
    ['Double Shift', '🔁 ☕', 'Seven hours in one day. Coffee was involved.'],
    ['Who Needs Sunlight', '🌑 🧛', 'Nine hours in a day. Vampire-adjacent.'],
    ['Day Eater', '🍽️ 🌞', 'Eleven hours. You ate the whole day. Delicious.'],
    ['Send Help', '🆘 🫡', 'Thirteen hours on one thing in a day. Please hydrate.'],
  ]),
  ladder('bigWeek', 'bigWeek', 'grind', 'Biggest week', [10, 20, 30, 40, 50, 60].map((h) => h * H), [
    ['Solid Week', '🧱 📅', 'Ten hours this week. Solid foundation.'],
    ['Part-Time Legend', '🕐 🌟', '20 hours in a week. A part-time job, done for fun.'],
    ['Grindset', '⚙️ 😤', '30 hours in a week. Rise and grind. Mostly grind.'],
    ['Full-Time Job (Unpaid)', '💼 🤡', '40 hours in a week. Terrible pay. Immaculate vibes.'],
    ['Overtime Overlord', '🕰️ 👑', '50 hours in a week. Even the clock needs a break.'],
    ['Week Devourer', '🦖 📅', '60 hours in one week. Nothing survived.'],
  ]),
  // Not for Health or Sleep metrics: more water or sleep than the target isn't the point.
  ladder('over', 'over', 'grind', 'Overachiever', [1.5, 2, 3, 5, 7, 10], [
    ['Extra Credit', '➕ 📝', 'Half again your target in one day. Teacher’s pet energy.'],
    ['Double Trouble', '✌️ 😈', 'Twice your target in a day. Showing off a little.'],
    ['Triple Threat', '🔱 🔥', 'Three times your target. Calm down. (Don’t.)'],
    ['High Five', '🖐️ 💯', 'Five times your target in one day. Up top.'],
    ['Seventh Gear', '🏎️ 💨', 'Seven times your target. There is no eighth gear. Probably.'],
    ['Target Was a Suggestion', '🎯 🚀', 'Ten times your target. It’s a speck in the mirror.'],
  ]),
  ladder('finisher', 'finisher', 'goals', 'Goals finished', [1, 2, 3, 5, 10, 20], [
    ['Deadline Slayer', '⚔️ 📅', 'First goal finished. Deadlines, beware.'],
    ['Promise Keeper', '🤝 ✅', 'Two goals done. Your word means something.'],
    ['Goal Getter', '🥅 💪', 'Three goals finished. Getting goals is your thing.'],
    ['The Closer', '🚪 💼', 'Five goals. You don’t start things. You finish them.'],
    ['Finish Line Regular', '🏁 👑', 'Ten goals. The finish line knows your shoes.'],
    ['Mission Control', '🚀 🛰️', 'Twenty goals. Everything launched. Everything landed.'],
  ]),
  ladder('tasks', 'tasks', 'goals', 'Plan tasks done', [10, 25, 50, 100, 250, 500], [
    ['Ticked Off', '✅ 😤', 'Ten plan tasks ticked. In the good way.'],
    ['Checklist Champion', '📋 🥇', '25 tasks. The checkboxes sing your name.'],
    ['Task Muncher', '🍪 ✅', '50 tasks eaten. Still hungry.'],
    ['Productivity Ninja', '🥷 📋', '100 tasks. Silent. Efficient. Done.'],
    ['Task Terminator', '🤖 📋', '250 tasks. It’ll be back. For more tasks.'],
    ['Done-Zilla', '🦖 ✅', '500 tasks crushed. The list fears you.'],
  ]),
  ladder('weeksWon', 'weeksWon', 'compete', 'Weeks won', [1, 3, 5, 10, 25, 52], [
    ['Bragging Rights', '🗣️ 🏆', 'Won your first week. Tell everyone.'],
    ['Rivalry Heating Up', '🔥 🥊', 'Three weeks won. It’s personal now.'],
    ['Trash Talk Licence', '🪪 😏', 'Five weeks won. You’re officially allowed to talk trash.'],
    ['Dynasty', '🏰 🏆', 'Ten weeks won. Start printing the banners.'],
    ['Undisputed', '👑 🥊', '25 weeks won. Nobody’s disputing it.'],
    ['Hall of Fame', '🏛️ 🌟', '52 weeks won. A year of victories. Statue pending.'],
  ]),
  ladder('challengesWon', 'challengesWon', 'compete', 'Challenges won', [1, 2, 3, 5, 10, 25], [
    ['Challenge Accepted', '🤝 😎', 'First challenge won. Accepted, then crushed.'],
    ['Double Dare', '🎲 🎲', 'Two challenges won. Dare you to make it three.'],
    ['Duel Master', '🤺 🏅', 'Three challenges won. Name the time and place.'],
    ['Undefeated-ish', '🛡️ 😅', 'Five challenges won. Mostly undefeated.'],
    ['Trophy Cabinet', '🗃️ 🏆', 'Ten challenges won. Running out of shelf space.'],
    ['Boss Battle Champion', '🐲 ⚔️', '25 challenges won. You are this pair’s final boss.'],
  ]),
  ladder('earlyBird', 'earlyBird', 'habits', 'Early bird', [1, 5, 15, 30, 60, 100], [
    ['Up Before the Sun', '🌅 👀', 'A session before 7am. The sun wasn’t ready.'],
    ['Early Bird', '🐦 🪱', 'Five early sessions. The worm never stood a chance.'],
    ['Dawn Patrol', '🌄 🚓', '15 early starts. Patrolling the quiet hours.'],
    ['Sunrise Subscriber', '☀️ 📬', '30 early starts. You get the sunrise delivered.'],
    ['Rooster’s Rival', '🐓 😤', '60 early starts. The rooster is jealous.'],
    ['Morning Person (Real One)', '☕ 👑', '100 sessions before 7am. Genuinely terrifying.'],
  ]),
  ladder('nightOwl', 'nightOwl', 'habits', 'Night owl', [1, 5, 15, 30, 60, 100], [
    ['Midnight Oil', '🕯️ 🌙', 'A session past midnight. Burning that oil.'],
    ['Night Owl', '🦉 🌙', 'Five late sessions. Who? You.'],
    ['Moonlighter', '🌕 💼', '15 late sessions. The moon is your coworker.'],
    ['Creature of the Night', '🦇 🌑', '30 late sessions. Bats ask for your schedule.'],
    ['Nocturnal', '🌌 👀', '60 sessions past midnight. Daylight is a rumour.'],
    ['Sleep Is a Myth', '🧛 ☕', '100 sessions after midnight. Please consider a nap.'],
  ]),
  ladder('notes', 'notes', 'habits', 'Notes written', [1, 10, 25, 50, 100, 250], [
    ['Dear Diary', '📔 ✍️', 'First note written. What did we accomplish today?'],
    ['Field Notes', '🗒️ 🔍', 'Ten notes. Documenting like a scientist.'],
    ['Captain’s Log', '🧭 📜', '25 notes. Stardate: productive.'],
    ['Memoir Pending', '📖 ⏳', '50 notes. Your biography is writing itself.'],
    ['Chronicler', '🪶 📜', '100 notes. History will remember. You wrote it down.'],
    ['Lore Master', '🧙 📚', '250 notes. The lore runs deep.'],
  ]),
];

export const LADDERS: Ladder[] = [...themedLadders, ...sharedLadders];

type SecretRow = [key: SecretKey, tier: Tier, name: string, art: string, need: string, flavor: string, hint: string];

const SECRET_ROWS: SecretRow[] = [
  ['bullseye', 0, 'Bullseye', '🎯 👌', 'Hit a daily target exactly. Not a second more.', 'Precisely enough.', 'Not more. Not less.'],
  ['strategicRest', 0, 'Strategic Rest', '😴 🧠', 'Take a rest day.', 'Rest is productive. Allegedly.', 'Even machines need maintenance.'],
  ['timeTraveller', 0, 'Time Traveller', '⏳ 🌀', 'Log something for a day that’s already gone.', 'Fixing the timeline, one entry at a time.', 'Yesterday isn’t over until you say so.'],
  ['hibernation', 1, 'Hibernation Mode', '🐻 💤', '12 hours of sleep in one day.', 'Bears respect it. Alarms do not.', 'Sleep like it’s winter.'],
  ['newYear', 1, 'New Year, Same Grind', '🎆 📒', 'Log anything on 1 January.', 'Resolutions? You were already doing it.', 'Happens once a year.'],
  ['forgotTimer', 1, 'Did You Forget Something?', '🫠 ⏲️', 'One timer run of over 12 hours.', 'The timer kept going. So did you, apparently.', 'Leave it running…'],
  ['essayist', 1, 'Essayist', '📜 🖋️', 'Write a note over 200 characters.', 'Tell us how you really feel.', 'Say more.'],
  ['over9000', 2, 'It’s Over 9000!', '🐉 💥', 'Log over 9,000 of something in one day.', 'Your scouter just exploded.', 'Some numbers are too big.'],
  ['speedrun', 2, 'Speedrunner', '⚡ 🏁', 'Tick 5 plan tasks in one day.', 'Any% plan completion. New world record.', 'Go fast. Tick faster.'],
  ['weekendWarrior', 2, 'Weekend Warrior', '🛡️ 🍕', 'Meet every target on a Saturday and the Sunday after.', 'The weekend is not a day off. Apparently.', 'Saturday and Sunday, both of them.'],
  ['juggler', 2, 'The Juggler', '🤹 ✨', 'Hit 5 different targets in one day.', 'Keeping every ball in the air.', 'Five at once.'],
  ['photoFinish', 2, 'Photo Finish', '📸 🏁', 'Win a Compete week by less than 2%.', 'Won by a nose. A very small nose.', 'Close. So close.'],
  ['paidInFull', 2, 'Paid in Full', '💰 🤝', 'Win a challenge with a prize on the line.', 'Pay up. It’s in writing.', 'Winner gets…'],
  ['earlyFinisher', 2, 'Ahead of Schedule', '🏎️ 📅', 'Finish a goal or plan a week or more before its deadline.', 'Deadlines are for other people.', 'Why wait?'],
  ['phoenix', 3, 'Phoenix', '🔥 🐦', 'Lose a streak of 7 or more, then build it back to 7.', 'Rose from the ashes. Slightly singed.', 'Fall down. Get back up. Seven times.'],
  ['mondayPerson', 3, 'Monday Person', '📅 😺', 'Meet every target on 10 Mondays.', 'Loves Mondays. Scientists are baffled.', 'The least popular day of the week.'],
];

export const SECRETS: Secret[] = SECRET_ROWS.map(([key, tier, name, a, need, flavor, hint]) => ({ id: `secret.${key}`, key, tier, name, art: art(a), need, flavor, hint }));

/** One card in the catalogue, wherever it comes from. */
export interface AchievementDef extends Card {
  id: string;
  tier: Tier;
  ladder?: Ladder;
  /** Index into the ladder's steps. */
  step?: number;
  secret?: Secret;
  /** Card number, in catalogue order. */
  no: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  ...LADDERS.flatMap((l) => l.steps.map((s, i) => ({ id: `${l.id}.${i + 1}`, tier: i as Tier, ladder: l, step: i, name: s.name, flavor: s.flavor, art: s.art }))),
  ...SECRETS.map((s) => ({ id: s.id, tier: s.tier, secret: s, name: s.name, flavor: s.flavor, art: s.art })),
].map((a, i) => ({ ...a, no: i + 1 }));

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// ── Levels ──────────────────────────────────────────────────────────────────

/** XP needed to reach a level: 25, 75, 150, 250… (each level costs 25 more than the last). */
export function xpForLevel(level: number): number {
  return (25 * level * (level - 1)) / 2;
}

export function levelFor(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export const RANKS: { from: number; name: string; art: string }[] = [
  { from: 1, name: 'Fresh Spawn', art: '🐣' },
  { from: 3, name: 'Tutorial Survivor', art: '🗺️' },
  { from: 5, name: 'Side Quest Enjoyer', art: '🧭' },
  { from: 7, name: 'Certified Grinder', art: '⚙️' },
  { from: 10, name: 'Main Character', art: '🎬' },
  { from: 13, name: 'Lowkey Legendary', art: '😎' },
  { from: 16, name: 'Built Different', art: '🧱' },
  { from: 20, name: 'Final Boss', art: '🐉' },
  { from: 25, name: 'Patch Notes Material', art: '📋' },
  { from: 30, name: 'Mythical Creature', art: '🦄' },
  { from: 40, name: 'Beyond Science', art: '🧪' },
];

export function rankFor(level: number): { from: number; name: string; art: string } {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.from) r = x;
  return r;
}

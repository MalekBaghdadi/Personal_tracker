/*
 * One spotlight tour per tab (and for the goal and plan screens), shown the first time it opens and
 * replayable from Settings. Steps point at [data-tour] markers in the screens;
 * a step whose marker isn't on screen (no timers, no goals yet…) is skipped.
 * A step without a target is a centred card.
 */

export type TourId = 'today' | 'history' | 'stats' | 'compete' | 'metrics' | 'profile' | 'settings' | 'goals' | 'plans' | 'phrases';

export interface TourStep {
  /** data-tour value to spotlight; the first match on the page. */
  target?: string;
  title: string;
  body: string;
}

export interface Tour {
  id: TourId;
  name: string;
  /** Bumped when a tour changes enough to show again to people who saw the old one. */
  rev?: number;
  steps: TourStep[];
}

/** How a tour is marked seen in settings.toursSeen: its id, plus its revision once it has one ('profile@2'). */
export const tourKey = (t: Tour): string => (t.rev ? `${t.id}@${t.rev}` : t.id);

export const TOURS: Tour[] = [
  {
    id: 'today',
    name: 'Today',
    steps: [
      { title: 'Welcome to Today', body: 'Everything due today lives here. A quick look around takes under a minute.' },
      { target: 'today-date', title: 'Today’s date', body: 'Tap it to open today in History, with your events, reminders and everything logged.' },
      { target: 'today-yesterday', title: 'Forgot yesterday?', body: 'Catch up on yesterday here. Logging what you missed restores a broken streak.' },
      { target: 'today-goals', title: 'Deadline goals', body: 'How far along each goal is, whether you’re ahead or behind, and what today needs.' },
      { target: 'today-plan', title: 'Plans', body: 'A plan shows its next task, whatever its date. Tick it and the next one comes up. Tap it for details, notes and what’s next.' },
      { target: 'today-row', title: 'Your metrics', body: 'Each one due today: today’s total, the target, a progress bar and your streak.' },
      { target: 'today-linked', title: 'Goals under a metric', body: 'A deadline goal or plan linked to a metric sits inside that metric’s row, so the day’s work and the goal it feeds are together. Time you log here counts toward the goal. Change the link under Edit on the goal or plan.' },
      { target: 'today-chip', title: 'Quick add', body: 'Tap a chip to log that amount in one go. Tap several and they add up.' },
      { target: 'today-custom', title: 'Any amount', body: 'Type an exact amount, or log it to another day.' },
      { target: 'today-toggle', title: 'Add or take away', body: 'Switch to − and the chips subtract instead, for when you logged too much.' },
      { target: 'today-check', title: 'Check off', body: 'Some things are just done or not. Tap once when it’s done; tap again if you tapped by mistake.' },
      { target: 'today-phrase-add', title: 'Phrases', body: 'A phrase metric collects a quote, saying or hadith a day. Add the day’s phrases here with their source. Each one goes into your collection.' },
      { target: 'today-phrase-review', title: 'Review one', body: 'Every day you also review a phrase from an earlier day, picked at random. Read it and tap reviewed, or test yourself from memory with blanks and hints. The day only counts once you’ve added your phrases and done the review.' },
      { target: 'today-rest', title: 'Rest day', body: 'Taking a day off? Tap Rest day and the streak stays. Forget to, and your weekly rest day is used for you.' },
      { target: 'today-timer', title: 'Timer', body: 'Start a timer and it logs the time when you stop. Forgot to start it? Press and hold to start earlier.' },
    ],
  },
  {
    id: 'history',
    name: 'History',
    steps: [
      { target: 'history-picker', title: 'All or one', body: 'See every metric at once, or pick one to look at it on its own.' },
      { target: 'history-calendar', title: 'Your calendar', body: 'Days get brighter the longer your streak runs. Tap a day to see or fix what you logged, or add events and reminders.' },
      { target: 'history-month', title: 'Months', body: 'Go back or ahead a month. Tap the month’s name to jump back to this one.' },
    ],
  },
  {
    id: 'stats',
    name: 'Stats',
    steps: [
      { target: 'stats-week', title: 'Last week', body: 'Your week at a glance: totals, target days met, best day, and how goals moved.' },
      { target: 'stats-metric', title: 'Per metric', body: 'Current and longest streak, the last 30 days, how often you hit the target, and any notes you wrote.' },
      { title: 'Stats', body: 'Log a few days and these fill in by themselves.' },
    ],
  },
  {
    id: 'compete',
    name: 'Compete',
    steps: [
      { target: 'compete-pair', title: 'Race a friend', body: 'Link up with one other person using a code. They only see totals for the metrics you choose to race on, never your notes.' },
      { target: 'compete-score', title: 'Scoreboard', body: 'Weeks and challenges each of you has won, across every race.' },
      { target: 'compete-tabs', title: 'Races, challenges, history', body: 'Weekly races, challenges (first to 20 hours, most this month, most target days), and everything already settled.' },
      { target: 'compete-race', title: 'Weekly race', body: 'Your total against theirs this week, and how many days each of you hit your own target. The higher total takes the week.' },
      { target: 'compete-team', title: 'Add metrics', body: 'Put more of your metrics on your side, like Study next to Network+. They’re added together, from the start of this week and any challenge still running.' },
    ],
  },
  {
    id: 'metrics',
    name: 'Metrics',
    steps: [
      { target: 'metrics-new', title: 'Track something new', body: 'Time or a count, a daily target (at least or at most), which days, and your quick-add amounts.' },
      { target: 'metrics-list', title: 'Your metrics', body: 'Tap one to change it, or drag to reorder. Archive what you’ve stopped tracking without losing its history.' },
      { target: 'metrics-goals', title: 'Deadline goals', body: 'Aim for a total by a date, like 120 hours by 15 December, or a plan of tasks. Paste a plan’s Markdown checklist and it becomes one, with its sections and dates. Link a goal to a metric and Today shows it under that metric.' },
    ],
  },
  {
    id: 'goals',
    name: 'Deadline goal',
    steps: [
      { title: 'A deadline goal', body: 'A total by a date, like 120 hours by 15 December, counted from its linked metric’s logged time.' },
      { target: 'goal-progress', title: 'Ahead or behind', body: 'Done so far, the thin mark where steady pace would have you by now, and what today needs to stay on pace.' },
      { target: 'goal-edit', title: 'Linked metric', body: 'The goal counts its linked metric and shows inside that metric’s row on Today. Change the metric, target or deadline here.' },
      { target: 'goal-burnup', title: 'Progress over time', body: 'What you’ve done against the steady line to the deadline, with a projection once there’s enough data.' },
    ],
  },
  {
    id: 'plans',
    name: 'Plan',
    steps: [
      { title: 'A plan', body: 'A deadline goal counted in tasks: an ordered checklist, in sections, with dates that only set the pace. Make one from Metrics → New goal, by pasting a Markdown checklist or starting empty.' },
      { target: 'plan-progress', title: 'On pace?', body: 'Tasks done, the mark where the plan expected you by today, and how many tasks ahead or behind you are. Nothing is ever overdue; slipping just shows as behind.' },
      { target: 'plan-edit', title: 'Link it to a metric', body: 'Edit plan → Linked metric, e.g. the metric you time this project with. The plan then sits inside that metric’s row on Today, and stopping its timer after 10 minutes offers to tick the current task.' },
      { target: 'plan-push', title: 'Fell behind?', body: 'Push remaining moves every task left a few work days later, and the deadline too if you like. Undo puts them back.' },
      { target: 'plan-markdown', title: 'Add from Markdown', body: 'Paste more of the checklist any time; new tasks and sections go after the ones you have.' },
      { target: 'plan-tasks', title: 'Your tasks', body: 'Tick any task, or tap one for its details, note and date. Edit tasks to drag them into order, add tasks and sections, or set a section’s checkpoint.' },
    ],
  },
  {
    id: 'profile',
    name: 'Profile',
    // 2: binders became a deck you swipe through, with targeted and general binders and linked metrics.
    rev: 2,
    steps: [
      { title: 'Your profile', body: 'Achievements live here. Keep logging as usual and they unlock by themselves: long sessions, streaks, big days, goals finished, races won, and a few secrets.' },
      { target: 'profile-header', title: 'Level and title', body: 'Every card you collect gives XP, and levels come with a rank. Wear any card you’ve collected as your title.' },
      { target: 'profile-ready', title: 'Ready to collect', body: 'New achievements wait here face down. Tap one to flip it into your binder.' },
      { target: 'profile-binder', title: 'Your binders', body: 'Cards are kept in binders, one deck each. Swipe left and right to move between them, or tap a name above. Each row climbs from easy to brutal, Bronze to Mythic; tap any card to see what it takes.' },
      { target: 'profile-links', title: 'Targeted binders', body: 'Study, Fitness, Health and the other theme binders only count the metrics linked to them. Links are made for you from each metric’s icon; tap Change to link different ones. A metric sits in one binder at a time.' },
      { target: 'profile-binder-tabs', title: 'General binders', body: 'Streaks, The grind, Goals & plans, Compete, Odd hours & notes and Secrets count everything you log, so nothing is linked to them. A binder you can’t earn from yet is greyed out at the end, with what starts it.' },
      { target: 'profile-themes', title: 'All links at once', body: 'See every metric and its binder here. You can also change a metric’s binder in its editor.' },
      { target: 'profile-share', title: 'Show it off', body: 'Paired in Compete? Let them see your title, level and showcase. Switch it off any time.' },
      { target: 'profile-settings', title: 'Settings', body: 'Settings live behind this gear: timezone, day start, export and restore, and these tutorials.' },
    ],
  },
  {
    id: 'phrases',
    name: 'Phrase collection',
    steps: [
      { target: 'phrases-actions', title: 'Add or review', body: 'Add a phrase from here too, or review a random one right now. An extra review still counts toward your cards.' },
      { target: 'phrases-search', title: 'Find one', body: 'Search the text or the source. Arabic searches ignore the diacritics.' },
      { target: 'phrases-filter', title: 'Needs a look', body: 'Filter to phrases you haven’t reviewed yet, or ones you recalled badly last time. Those come up more often in your daily review.' },
      { target: 'phrases-list', title: 'Your phrases', body: 'Newest first, with when you added each one and how your last review went. Tap one to fix a typo, change its source or delete it.' },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    steps: [
      { target: 'settings-daystart', title: 'Late nights', body: 'Anything logged before this time counts for the day before, so staying up late doesn’t break a streak.' },
      { target: 'settings-export', title: 'Your data', body: 'Download a backup any time. You can restore it below.' },
      { target: 'settings-tours', title: 'Replay these tours', body: 'Want a refresher? Replay any tour from here.' },
    ],
  },
];

export const tourFor = (id: string): Tour | undefined => TOURS.find((t) => t.id === id);

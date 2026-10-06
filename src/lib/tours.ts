/*
 * One spotlight tour per tab, shown the first time that tab opens and
 * replayable from Settings. Steps point at [data-tour] markers in the screens;
 * a step whose marker isn't on screen (no timers, no goals yet…) is skipped.
 * A step without a target is a centred card.
 */

export type TourId = 'today' | 'history' | 'stats' | 'metrics' | 'settings';

export interface TourStep {
  /** data-tour value to spotlight; the first match on the page. */
  target?: string;
  title: string;
  body: string;
}

export interface Tour {
  id: TourId;
  name: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'today',
    name: 'Today',
    steps: [
      { title: 'Welcome to Today', body: 'Everything due today lives here. A quick look around takes under a minute.' },
      { target: 'today-date', title: 'Today’s date', body: 'Tap it to open today in History, with your events, reminders and everything logged.' },
      { target: 'today-yesterday', title: 'Forgot yesterday?', body: 'Catch up on yesterday here. Logging what you missed restores a broken streak.' },
      { target: 'today-goals', title: 'Deadline goals', body: 'How far along each goal is, whether you’re ahead or behind, and what today needs.' },
      { target: 'today-row', title: 'Your metrics', body: 'Each one due today: today’s total, the target, a progress bar and your streak.' },
      { target: 'today-chip', title: 'Quick add', body: 'Tap a chip to log that amount in one go. Tap several and they add up.' },
      { target: 'today-custom', title: 'Any amount', body: 'Type an exact amount, or log it to another day.' },
      { target: 'today-toggle', title: 'Add or take away', body: 'Switch to − and the chips subtract instead, for when you logged too much.' },
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
    id: 'metrics',
    name: 'Metrics',
    steps: [
      { target: 'metrics-new', title: 'Track something new', body: 'Time or a count, a daily target (at least or at most), which days, and your quick-add amounts.' },
      { target: 'metrics-list', title: 'Your metrics', body: 'Tap one to change it, or drag to reorder. Archive what you’ve stopped tracking without losing its history.' },
      { target: 'metrics-goals', title: 'Deadline goals', body: 'Aim for a total by a date, like 120 hours by 15 December. The app works out the pace you need each day.' },
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

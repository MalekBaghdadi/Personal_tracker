# Personal_tracker

Personal project to track daily habits across Android, desktop/laptop, and iOS devices.

The app is called **Logbook**: a private, single-user, offline-first daily tracker, installed as a PWA.
It runs on the free Firebase Spark plan with no recurring cost.

> **New session? Start here.** This README is the handoff document. Read [Status](#status) and
> [How we work](#how-we-work) first, then the section for whatever you're changing. The rules in
> [Invariants](#invariants-dont-break-these) are load-bearing; don't "simplify" them away.

---

## Contents

1. [Status](#status)
2. [How we work](#how-we-work)
3. [Accounts and environment](#accounts-and-environment)
4. [Features](#features)
5. [Architecture](#architecture)
6. [Data model](#data-model)
7. [Invariants (don't break these)](#invariants-dont-break-these)
8. [Decisions and departures from the specs](#decisions-and-departures-from-the-specs)
9. [Testing](#testing)
10. [Project layout](#project-layout)
11. [Known gaps and open questions](#known-gaps-and-open-questions)
12. [Change history](#change-history)
13. [Gotchas](#gotchas)
14. [Setting up from scratch](#setting-up-from-scratch)

---

## Status

| | |
|---|---|
| **Live app** | https://personal-tracker-cec8a.web.app |
| **Repo** | https://github.com/MalekBaghdadi/Personal_tracker (branch `main`) |
| **Firebase project** | `personal-tracker-cec8a` (Spark plan) |
| **Local checkout** | `C:\Users\Malek Baghdadi\personal-tracker` (Windows 11) |
| **Last updated** | 2 October 2026 |

**Built and deployed:**
- The original MVP: Today, History, Stats, Metrics and Settings screens; timers; quick-add and manual entry; targets and streaks; PWA install and offline support; JSON/CSV export; first-run onboarding.
- History "All" view across every metric.
- Calendar events and reminders (in-app only).
- A per-row +/− toggle for subtracting time.
- Deadline goals ("Network+: 120h by 15 Dec").

**Verified:** type check, 53 unit tests, and 7 browser test suites. The browser tests run against the local Auth emulator with Firestore unreachable, so they exercise the **offline path** only. See [Testing](#testing).

**Not yet verified** (needs real devices or the real backend): see [Known gaps](#known-gaps-and-open-questions).

The two specs this was built from (the MVP spec and the "Deadline goals" addendum) are **not in the repo**. Malek pasted them into chat. Their important rules are captured below. If you need the full text, ask Malek for `TRACKER_MVP_SPEC.md` and the addendum.

---

## How we work

Malek is the only user. He tests on his phone, so the loop for every change is:

1. **Make the change.** Match the surrounding code; read the files you touch first.
2. **Check it:** `npx tsc -p .` → `npm test` → `npm run e2e` (or the relevant suites, e.g. `npm run e2e -- goals`).
   For UI changes, look at the screenshots in `e2e/shots/` at phone width (390px). Several past bugs were only visible there.
3. **Deploy** with `npm run deploy` so Malek can see it live. His installed app shows "Update available — Reload".
   After deploying, confirm the live `index.html` references the new bundle; the CDN can serve the old one for a few seconds.
4. **Push to GitHub only when he says so.** He approves each push ("push to github"). He sometimes edits files directly on GitHub, so always `git fetch` first and rebase onto `origin/main` if it has moved.
5. Commit messages end with a `Co-Authored-By:` line. **Never commit `.env.local`**, `dist/`, `node_modules/` or `.firebase/` (all git-ignored).

He's happy to answer questions when a request is ambiguous, and prefers being asked over a wrong guess on anything structural (e.g. how reminders should behave). He likes plain explanations of what changed and how to see it.

---

## Accounts and environment

- **Firebase account:** the project is owned by the Google account **malekbaghdadi07@gmail.com**. His other address, malek.baghdade@gmail.com, has no Firebase projects, which once made a deploy fail with "Failed to get Firebase project". Check with `npx firebase login:list`.
- **`firebase-tools`** is a dev dependency, so use `npx firebase …`. Login is non-interactive in this environment: `npx firebase login` prints a URL and a session ID. Malek opens it, approves, and pastes back a code. You then run `npx firebase login <code>`.
- **GitHub:** pushes go through the `gh` CLI's stored login (`gh auth setup-git` is configured). If a push fails with "Invalid username or token", start `gh auth login -h github.com --git-protocol https --web` in the background. It prints a one-time code; give Malek the code and https://github.com/login/device.
- **`.env.local`** (git-ignored) holds the Firebase web config: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. These values are public identifiers, not secrets; the security rules protect the data. On a new machine, copy `.env.example` and fill it in from Firebase console → Project settings → Your apps.
- **`.firebaserc`** points at `personal-tracker-cec8a`, so no `firebase use` step is needed.
- **Machine:** Windows 11, Node 22, Java 21 (for emulators), Chrome at the default path. Both PowerShell and Git Bash are available. Mind the quoting differences: several heredoc and `sed` edits with backticks or backslashes were mangled during development, so prefer the file-edit tools or small script files.

---

## Features

### Today (`src/screens/Today.tsx`)
- **Date header:** tap it to open that day in History. A small summary line lists today's events and the count of open reminders, e.g. "Dentist · Network+ exam 14:00 · 1 reminder".
- **Install card:** shown once, until dismissed. It explains why to install to the home screen (iOS evicts a plain site's storage after 7 days).
- **Deadline goal cards**, nearest deadline first. Each shows:
  - total of target, and days left
  - a progress bar with a thin **expected-position marker** (bar past the marker means ahead)
  - status in time ("2h 10m behind", "On track", "45m ahead")
  - today's need ("Today: 50m of 1h 20m", or "Next: Monday, 1h 35m" on a non-work day)
  - an overload warning when the pace needed has more than doubled
- **One row per scheduled metric**, in `order`. Metrics not scheduled today sit in a collapsed "Not scheduled today" section, still loggable. Each row has:
  - name with its icon, today's total, the target, a progress bar and the current streak
  - "Goal pace: 1h 20m today" when the metric has an active goal
  - controls: **+/− toggle**, quick-add chips, a custom-amount (keyboard) button, and Start/Stop if the metric has a timer. On phones Start/Stop is icon-only so the row fits on one line.
- **The +/− toggle:** in − mode the chips read −15m etc., and they and the custom button subtract. It resets to + when you leave Today.
- **Undo toast** after every log, subtract and delete.
- **Pinned timer bar** (`components/Chrome.tsx`): visible on every tab while a timer runs. It's the only animated element in the UI.

### History (`src/screens/History.tsx`)
- **Metric picker:** **All** (the default) or one metric.
- **All view:**
  - calendar with a dot per metric logged that day (filled when the target was met or none is set, a ring when it wasn't)
  - cells shaded by the share of that day's targets met
  - a marker on days with events or reminders
  - a month summary table of total and days the target was met, per metric
- **Single-metric view:** a heatmap by progress toward the target, plus month total and days the target was met.
- **Day sheet:**
  - "Events and reminders": reminders can be ticked off; add event or reminder
  - "Logged": entries grouped by metric; tap an entry to edit or delete it, and add an entry for that day
  - Future days show only events and reminders.
- Month navigation goes forward too, for planning. Tapping the month title jumps back to the current month.
- Deep link `#/history/YYYY-MM-DD` opens that day's sheet; closing it strips the date from the URL.

### Stats (`src/screens/Stats.tsx`, lazy-loaded)
- Per metric:
  - current and longest streak
  - 30-day total
  - target-hit rate, counted from the metric's creation date so earlier days aren't counted as misses
  - a 30-day bar chart with a 7-day rolling average and a target line
- Archived metrics are marked.

### Metrics (`src/screens/Metrics.tsx`)
- Create, edit, drag to reorder (pointer-based so it works on iOS; arrow keys too), archive, and hard delete with a count of what goes.
- A metric's type is locked once it has entries, because switching would misread stored values.
- **Deadline goals list:** active goals first, then archived ones with how they ended. "New goal" lives here. A metric's editor also offers "Add deadline goal", or "View deadline goal" when it has one.

### Goal detail (`src/screens/GoalDetail.tsx`, route `#/goals/<id>`, lazy-loaded)
- Large progress, status and today's need.
- Figures: required pace, planned pace, 14-day recent rate, projection, work days left, remaining.
- **Burn-up chart:** done (solid, with a "now" dot), steady pace (thin), and projection (dashed, after 3 or more work days of data).
- Terminal states: **Achieved** (date, days early; Archive or Raise the target) and **Missed** (final total and shortfall; Extend deadline or Archive). No confetti, no scolding.

### Settings (`src/screens/Settings.tsx`)
- Timezone (IANA, fixed; defaults to the device's on first run), week start and theme.
- Export: **JSON** (everything, raw) and **CSV**, which downloads four files: entries, metrics, calendar, goals.
- Sign out, with a confirmation.

### First run
- On a new account the server confirms it's empty, then the five starting metrics are seeded: Studying, Reading, Network+, Gym and Calories. **Onboarding** (`src/screens/Onboarding.tsx`) then asks for real targets, with empty inputs on purpose, and Gym's days.

---

## Architecture

**Stack:**
- Vite 8, React 18 and TypeScript 7
- Tailwind CSS 4 (`@tailwindcss/vite`)
- Firebase JS SDK 12 (Auth email/password, and Firestore with persistent local cache)
- `vite-plugin-pwa`, `date-fns` and `date-fns-tz`, Recharts 3, `lucide-react`
- IBM Plex Sans (self-hosted via `@fontsource`, Latin subset only)
- No router library: hash routes in `App.tsx`. No state library: React context plus `useMemo`.

**Data flow:**
- `src/lib/firebase.ts` initialises Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. Every read and write hits IndexedDB first; the network only reconciles.
- `src/state/DataContext.tsx` holds **six listeners for the whole app**: metrics, entries (non-deleted), goals, items (non-deleted), and the timer and settings docs. Each uses `includeMetadataChanges` so the sync dot can show synced, pending or offline. **Everything else is derived in memory** with `useMemo`: per-metric per-day totals (`dayStats`), streaks, stats, goal results, items by date.
- `src/lib/repo.ts` holds **all writes**, and none are awaited (the `fire()` helper). They commit to the local cache at once and flush when online.
- "Today" is recomputed every 30 seconds and when the tab becomes visible, so midnight rollover and goal deadlines update while the app stays open.

**PWA:** `vite.config.ts` uses `registerType: 'prompt'`, so it never auto-reloads. The update prompt is hidden while a timer runs, and only the app shell is precached; Firestore has its own offline cache. iOS meta tags, safe-area insets and `navigator.storage.persist()` are in place.

**Theme:** CSS variables in `src/index.css`, switched by `data-theme` on `<html>`. The theme is cached in localStorage and applied before first paint (inline script in `index.html`). Each metric's colour comes from a palette checked for contrast and colour-blind separation in both themes (`src/lib/palette.ts`); the light theme maps each stored dark hex to its pair.

**Routes:** `#/today`, `#/history[/YYYY-MM-DD]`, `#/stats`, `#/metrics`, `#/settings`, `#/goals/<id>`. The goals route highlights the Metrics tab.

---

## Data model

Everything lives under one user document, so a single security rule covers it (`firestore.rules`):

```
users/{uid}/metrics/{metricId}     Metric
users/{uid}/entries/{entryId}      Entry          (soft-deleted via deletedAt)
users/{uid}/goals/{goalId}         Goal
users/{uid}/items/{itemId}         CalendarItem   (soft-deleted via deletedAt)
users/{uid}/state/timer            ActiveTimer    (absent when no timer runs)
users/{uid}/state/settings         Settings
users/{uid}/state/timerClosed      { startedAt, closedAt }  (timer race marker, see below)
```

Types are in `src/lib/types.ts`. **Base units everywhere:** durations in **seconds**, counts as integers. Conversion happens only when displaying.

- **Metric:** `name`, `type` ('duration' or 'count'), `unit`, `target` (null means none), `targetDirection` ('at_least' or 'at_most'), `schedule` (daily, or days of the week with 0 = Sunday), `timerEnabled`, `quickAdd[]`, `color`, `icon`, `order`, `archivedAt`.
- **Entry:** `metricId`, `localDate` ('YYYY-MM-DD' in the configured timezone), `value` (always > 0), `source` ('timer', 'manual' or 'quick_add'), `note`, `occurredAt`, `deletedAt`.
- **Goal:** `metricId` (an at_least metric), `name`, `nameEdited`, `targetTotal`, `priorProgress`, `startDate`, `deadline` (both inclusive), `paceSchedule`, `archivedAt`. **Inputs only.** Progress, status, pace, projection and achieved date are never stored.
- **CalendarItem:** `kind` ('event' or 'reminder'), `title`, `localDate`, `time` ('HH:mm' or null for all day), `note`, `doneAt` (reminders), `deletedAt`.
- **Settings:** `timezone`, `weekStartsOn`, `theme`, `onboardedAt` (null only on a freshly seeded account).

---

## Invariants (don't break these)

1. **Entries are append-only documents; a day's total is the sum of its non-deleted entries.** There is no stored daily total. This is why two devices logging offline both survive on reconnect. Never "optimise" it into a totals collection.
2. **Entry `value` is always > 0.** Subtracting (`subtractFromDay` in `repo.ts`) trims the day's newest entries and soft-deletes any trimmed to nothing. It never stores a negative entry, and it clamps at the day's total, so a day never goes below 0.
3. **Corrections are field-level updates or soft deletes** on existing docs, so concurrent edits merge per field.
4. **Never hardcode a metric** (no `if (metric.name === 'Gym')`). Behaviour belongs in a `Metric` field. The same goes for goals: Network+ is just the motivating example.
5. **Writes are never awaited, and no spinner ever blocks logging.**
6. **Timers store `startedAt` only;** elapsed time is computed from it each frame. Stopping writes the entry and clears the timer in one batch, and the entry takes the start date's `localDate`. Timers over 12h ask before recording, and a negative elapsed time (clock skew) is clamped. Starting a second timer prompts.
7. **Streak rules** (`src/lib/streaks.ts`, unit-tested):
   - Only scheduled days count; unscheduled days are skipped.
   - **Today never breaks a streak.**
   - An `at_most` (ceiling) day counts only if something was logged that day, so a forgotten day isn't a perfect calorie day.
8. **Dates are always `localDate` in the configured timezone,** never the device clock's date. Timezone logic goes through `date-fns-tz`; it isn't hand-rolled.
9. **Seeding only happens when the server confirms the account is empty** (`fromCache === false`), so a new device with an empty cache can't create duplicate metrics. Onboarding shows only when `settings.onboardedAt === null`, never merely when the field is missing.
10. **Goals:**
    - All figures are computed in `src/lib/goals.ts`, which is pure (no React, no Firestore) and unit-tested.
    - "Behind" is judged against yesterday's end, so nothing reads as behind at 8am.
    - Required pace is computed from progress through yesterday, so it holds still all day.
    - Pace is rounded **up** for display. One active goal per metric. Goals never change daily targets or streaks.
11. **Reminders never send notifications.** There's no server; Malek chose in-app only.
12. **Zero recurring cost:** nothing that needs the Blaze plan, no Cloud Storage, no native iOS app.

---

## Decisions and departures from the specs

Agreed with Malek or flagged to him at the time:

- **Subtraction** is a per-row +/− toggle on Today. An earlier design, an Add/Subtract switch inside the sheet, was scrapped at his request. Subtracting more than is logged takes the day to 0, at his request.
- **Calendar:** events and reminders, each with a title, an optional time and a note. **One-off only, no repeats.** In-app only. Today shows a one-line summary. (His answers to explicit questions.)
- **Goal projection formula:** the addendum's `done + recentRate × (pace days after today)` leaves out today, so someone exactly on pace sees a projected shortfall. The code also counts `max(0, recentRate − doneToday)` for today, and there's a test for that case.
- **`Goal.nameEdited`:** an extra stored *input*, so the auto-generated name keeps updating until he types his own.
- **Goals list** lives on the Metrics screen. Achieved goals stay on Today until archived.
- **First run with no network:** the shell loads offline, but signing in needs a connection once per device. Seeding waits for the server.
- **`timerClosed` marker:** this resolves two devices starting timers offline (the earlier `startedAt` wins) without resurrecting a timer that was stopped elsewhere.
- Spec §18 open questions were left at their defaults: Gym is a duration on Mon/Wed/Fri, calories are a ceiling, and days roll over at midnight.

---

## Testing

```
npx tsc -p .          # type check (tsc runs as part of `npm run build` too)
npm test              # unit tests: src/lib/streaks.test.ts (23), src/lib/goals.test.ts (30)
npm run e2e           # browser tests; or: npm run e2e -- goals core
```

**Browser tests (`e2e/`):**
- `run-all.mjs` starts the **Auth emulator** and a dev server in emulator mode, runs each suite with `puppeteer-core` driving your installed Chrome, then builds the production bundle and serves it for `offline.mjs`. It shuts everything down afterwards and rebuilds `dist/` normally.
- Set `CHROME_PATH` if Chrome isn't at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Screenshots go to `e2e/shots/` (git-ignored).
- Each suite resets the emulator's accounts and signs up a test account (`e2e@logbook.test`, which exists only in the emulator; see `.env.emulators`).

| Suite | Covers |
|---|---|
| `core` | sign-up, metric create, quick-add, double-tap guard, timer across tabs, validation, reload persistence |
| `offline` | production build: service worker active, offline reload keeps data, logging works offline |
| `history-all` | All view, day sheet across metrics, adding from History |
| `subtract-toggle` | +/− toggle, chips, Undo, row fits one line, disabled at 0 |
| `subtract-clamp` | over-subtracting takes the day to 0, sheet layout |
| `calendar` | row alignment, date-header link, events and reminders, future days, persistence |
| `goals` | goal form preview and validation, card, pace line, detail and chart, edit recompute, one-per-metric, delete count, achieved |

**Only the Auth emulator is used,** because the Firestore emulator jar wouldn't download on this network (it hangs at 0 bytes). With Firestore unreachable, the app behaves exactly as it does offline, which is the path that matters most. As a result:
- **Seeding and onboarding never run** in e2e; the tests create metrics by hand.
- **Real sync is untested** here.

`npm run emulators` also tries to start the Firestore emulator. The UI is disabled in `firebase.json` for the same download reason.

Each `e2e/*.mjs` prints `• label: value` lines. The runner fails a suite on a crash, a `FAILED:` line, logged page or console errors, or any line reading `: false`. When adding UI, add or extend a suite and look at its screenshots.

---

## Project layout

```
src/
  App.tsx                 auth gate, hash router, shell (nav, timer bar, update prompt)
  main.tsx, index.css     entry; design tokens, theme, iOS date-field fix, motion
  lib/
    types.ts              all data types
    firebase.ts           app/auth/firestore init (+ emulator mode)
    repo.ts               every Firestore write (entries, subtract, timer, metrics, goals, items, settings)
    dates.ts              localDate helpers (date-fns / date-fns-tz)
    streaks.ts (+test)    scheduled days, hits, streaks, hit rate
    goals.ts (+test)      deadline goal calculations, validation
    format.ts             durations, values, chips
    seed.ts               first-run metrics + settings
    export.ts             JSON and CSV export
    palette.ts, icons.ts  metric colours (validated) and curated icon set
    device.ts             device id, uuid, localStorage wrapper, iOS/standalone checks
  state/
    DataContext.tsx       the six listeners, derived maps, sync status, timer race resolution
    TimerContext.tsx      start/stop, switch prompt, abandoned-timer recovery, useElapsed
    theme.tsx             resolved theme, per-metric hue
  screens/                Today, History, Stats, Metrics, Settings, GoalDetail, Auth, Onboarding
  components/
    ui.tsx                Button, Sheet (native <dialog>), Segmented, Switch, DayPicker, Toast
    Chrome.tsx            SyncDot, TimerBar, TabBar, SideNav, UpdatePrompt, InstallCard
    EntrySheet.tsx        add / subtract / edit an entry
    MetricEditor.tsx      metric form, archive, delete
    MetricPicker.tsx      metric chips (+ "All")
    Items.tsx             event/reminder form and list
    Goals.tsx             goal form, Today card, progress bar, pace line, display helpers
    inputs.tsx            duration/count inputs and parsers
e2e/                      browser tests + run-all.mjs runner
scripts/make-icons.mjs    regenerates public/ icons (no dependencies)
firestore.rules, firebase.json, .firebaserc, .env.example, .env.emulators
```

---

## Known gaps and open questions

**Not yet verified:**
- **Real cross-device sync.** Log offline on the phone and on the laptop for the same metric and day, reconnect, and the totals should be the sum of both. Goals should converge too.
- **A timer started on the phone and stopped on the laptop.** Also the offline timer-race resolution (`DataContext`, `state/timerClosed`).
- **On an actual iPhone:**
  - installing to the home screen and launching with no connection
  - the timer surviving a 30-minute lock
  - date and time fields: the vertical-centring fix in `index.css` was done blind, since Safari can't be reproduced here
- **First-run seeding and onboarding** against the real backend (never runs in e2e).
- **Firebase usage** staying in the low single-digit percentages of the Spark quotas.
- **The export downloads themselves,** especially on iOS standalone.

**Ideas not built** (only if Malek asks):
- a 3am day rollover
- Gym as a check-off
- calorie ranges
- repeating events
- multi-metric goals

---

## Change history

Newest last. `git log` has the details.

1. **MVP:**
   - all five screens, timers, sync, PWA, export, onboarding
   - 23 streak tests
   - first deploy, after logging in with the right Firebase account
2. **History "All" view:** dots per metric, month summary, day sheet across metrics.
3. **Subtraction, first try:** an Add/Subtract switch in the sheet. Malek disliked it ("formatting issue on the + and -").
4. **Subtraction, redone** as a per-row +/− toggle. Start/Stop became icon-only on phones so rows fit on one line.
5. **Alignment fix and calendar:**
   - the metric icon moved onto the name line, so the name, bar and controls share both edges
   - events and reminders added
   - the date header became a link into History, with a summary line
6. **Deadline goals** from the addendum: calculation module first (30 tests), then data, form, card, detail with burn-up, and list.
7. **Subtract fixes:**
   - subtracting more than is logged now takes the day to 0
   - the entry sheet became one column, because iOS Safari misaligned the side-by-side layout
   - date and time fields got a fixed height so iOS centres their text
8. **This README, `CLAUDE.md`, and the browser tests** moved into `e2e/`.

---

## Gotchas

- **The CDN caches `index.html` briefly after a deploy.** Verify the live page references the new `assets/index-*.js` before telling Malek it's live.
- **`npm run e2e` rebuilds `dist/` normally at the end.** If you build in emulator mode by hand (`vite build --mode emulators`), don't deploy that `dist/`. `npm run deploy` always rebuilds first anyway.
- **Puppeteer and the fixed tab bar:** clicking a button near the bottom can land on the tab bar, because the button is scrolled just into view. Click by text through `page.evaluate` instead (see the `press()` helper in `e2e/goals.mjs`).
- **iOS Safari date and time inputs** need `appearance: none` plus an explicit height and line-height. The rule is in `index.css`; keep it when restyling inputs.
- **Recharts single-point lines are invisible,** which is why the burn-up chart draws a dot on the latest "done" point.
- **The Firestore `where('deletedAt', '==', null)` queries** rely on every doc having `deletedAt` set (null, not missing). Always write it explicitly.
- **Deleting a metric** deletes its goals in the same batch. A goal whose metric is missing (e.g. edited offline elsewhere after the delete) is ignored by `DataContext`.

---

## Setting up from scratch

Only needed for a brand-new Firebase project or machine.

1. Create a Firebase project on the **Spark** plan. Enable **Authentication → Email/Password**. Create a **Firestore** database in production mode, in a region near Beirut (e.g. `eur3`).
2. Register a web app, then copy its config into `.env.local` (template: `.env.example`).
3. Run `npm install`, then `npx firebase login`, then `npm run deploy`. That deploys hosting and `firestore.rules`. For a different project, run `npx firebase use --add` first.
4. On each device, open the site, create the account once (later devices sign in), and install it: on iPhone, Safari → Share → Add to Home Screen; on Android, the in-app Install button.

```
npm run dev        # against the real project (.env.local)
npm run dev:emu    # against local emulators (start them with `npm run emulators`)
npm run icons      # regenerate public/ icons
```

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
| **Last updated** | 6 October 2026 |

**Built and deployed:**
- The original MVP: Today, History, Stats, Metrics and Settings screens; timers; quick-add and manual entry; targets and streaks; PWA install and offline support; JSON/CSV export; first-run onboarding.
- History "All" view across every metric.
- Calendar events and reminders (in-app only).
- A per-row +/− toggle for subtracting time.
- Deadline goals ("Network+: 120h by 15 Dec").
- Goal status always shows the amount ahead or behind.
- A "What did you accomplish?" note prompt after timer sessions over 10 minutes.
- Session notes listed on each goal and in Stats.
- A "Last week" review at the top of Stats.
- History calendars shaded by streak length, GitHub-style.
- A "Yesterday" button on Today for catching up on a missed day.
- The day rolls over at 5am (a setting), not midnight.
- Hold ▶ to start a timer earlier ("forgot to press start").
- Restore from a JSON backup (add-only).
- Optional app-icon badge for today's open reminders.
- First run lets each new user pick their own metrics (suggestions, their own, or none) before setting targets.
- A read-only admin view of every user for Malek's account (Settings → Admin → Users).

**Verified:** type check, 80 unit tests, and 13 browser test suites. The browser tests run against the local Auth emulator with Firestore unreachable, so they exercise the **offline path** only. See [Testing](#testing).

**Verified on real devices (6 October 2026):** Malek ran the full [device checklist](#device-checklist) on his iPhone and laptop and everything passed: install and offline launch, offline sync, timer across devices, locked phone, iOS date fields, hold ▶, badge, export and import.

**Still not verified:** see [Known gaps](#known-gaps-and-open-questions).

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
- **Yesterday button** (top right, `components/YesterdaySheet.tsx`): a sheet with every metric scheduled yesterday (others are hidden, like Today), yesterday's total against the target, and the same +/−, quick-add chips and custom amount as Today, all dated yesterday. Streaks are derived, so logging here restores a broken one by itself; each row says so ("1h 30m more restores your 2-day streak", "Target met · streak kept (3 days)"). Undo shows inside the sheet, because the app toast sits behind a modal. Long header dates use the short month so the button fits.
- **Install card:** shown once, until dismissed. It explains why to install to the home screen (iOS evicts a plain site's storage after 7 days).
- **Deadline goal cards**, nearest deadline first. Each shows:
  - total of target, and days left
  - a progress bar with a thin **expected-position marker** (bar past the marker means ahead)
  - status in time, always with the amount ("2h 10m behind", "12m ahead"; "Exactly on schedule" only when it rounds to 0). The `on_track` status still exists in `goals.ts`, but the card no longer hides the number behind it.
  - today's need ("Today: 50m of 1h 20m", or "Next: Monday, 1h 35m" on a non-work day)
  - an overload warning when the pace needed has more than doubled
- **One row per metric scheduled today**, in `order`. Metrics not scheduled today **don't appear at all** (Malek's call: Today is only what's due); log their off days from History. With nothing scheduled it says "Nothing is scheduled today". Each row has:
  - name with its icon, today's total, the target, a progress bar and the current streak
  - "Goal pace: 1h 20m today" when the metric has an active goal
  - controls: **+/− toggle**, quick-add chips, a custom-amount (keyboard) button, and Start/Stop if the metric has a timer. On phones Start/Stop is icon-only so the row fits on one line.
- **The +/− toggle:** in − mode the chips read −15m etc., and they and the custom button subtract. It resets to + when you leave Today.
- **Undo toast** after every log, subtract and delete.
- **Session note prompt:** stopping a timer after more than 10 minutes (`NOTE_PROMPT_AFTER_S` in `TimerContext.tsx`) turns the Undo toast into "What did you accomplish?" with a pen and ✕. It stays until dismissed; the pen opens an inline field and Save writes the entry's `note`. Shorter sessions get the normal toast.
- **Start earlier:** press and hold ▶ (or right-click it) to open "Start <metric> earlier": 5m–1h ago chips, or a start time (a time later than now means last night; over 12h is refused). The timer just gets an earlier `startedAt`. Holding only works while that row's timer isn't running, so a held Stop still stops.
- **Pinned timer bar** (`components/Chrome.tsx`): visible on every tab while a timer runs. It's the only animated element in the UI.

### History (`src/screens/History.tsx`)
- **Metric picker:** **All** (the default) or one metric.
- **All view:**
  - calendar with a dot per metric logged that day (filled when the target was met or none is set, a ring when it wasn't)
  - cells shaded in a neutral tone by the **average streak** that day: each metric due that day contributes its streak position (0 if missed), so one miss dims the day instead of resetting it
  - a marker on days with events or reminders
  - a month summary table of total and days the target was met, per metric
- **Single-metric view:** GitHub-style streak shading in the metric's colour: day 1 of a streak is dim and each further day is one step brighter, full from day 7 (`streakDays` and `streakLevel` in `lib/streaks.ts`). A logged day that isn't a streak day gets a faint tint. Metrics with no target have no streaks and are shaded by amount instead. Plus month total and days the target was met.
- Streaks carry across months (counted from the first entry), skip unscheduled days, and today never breaks one; same rules as Stats.
- **Day sheet:**
  - "Events and reminders": reminders can be ticked off; add event or reminder
  - "Logged": entries grouped by metric; tap an entry to edit or delete it, and add an entry for that day
  - Future days show only events and reminders.
- Month navigation goes forward too, for planning. Tapping the month title jumps back to the current month.
- Deep link `#/history/YYYY-MM-DD` opens that day's sheet; closing it strips the date from the URL.

### Stats (`src/screens/Stats.tsx`, lazy-loaded)
- **Last week** (`components/WeekReview.tsx`, maths in `lib/review.ts`), always at the top: each metric's total, target days met, best day and the week before; ceilings (`at_most`) show their average logged day instead of a total. Active goals show how far they moved. Weeks follow `weekStartsOn`.
- Per metric:
  - current and longest streak
  - 30-day total
  - target-hit rate, counted from the metric's creation date so earlier days aren't counted as misses
  - a 30-day bar chart with a 7-day rolling average and a target line
- Archived metrics are marked.
- **Notes:** every entry with a note for that metric, newest first (5, then "Show all"). Tap one to edit the entry. Hidden when there are none.

### Metrics (`src/screens/Metrics.tsx`)
- Create, edit, drag to reorder (pointer-based so it works on iOS; arrow keys too), archive, and hard delete with a count of what goes.
- A metric's type is locked once it has entries, because switching would misread stored values.
- **Deadline goals list:** active goals first, then archived ones with how they ended. "New goal" lives here. A metric's editor also offers "Add deadline goal", or "View deadline goal" when it has one.

### Goal detail (`src/screens/GoalDetail.tsx`, route `#/goals/<id>`, lazy-loaded)
- Large progress, status and today's need.
- Figures: required pace, planned pace, 14-day recent rate, projection, work days left, remaining.
- **Burn-up chart:** done (solid, with a "now" dot), steady pace (thin), and projection (dashed, after 3 or more work days of data).
- **Session notes** for entries between the goal's start and deadline (`components/SessionNotes.tsx`), with a hint when there are none yet.
- Terminal states: **Achieved** (date, days early; Archive or Raise the target) and **Missed** (final total and shortfall; Extend deadline or Archive). No confetti, no scolding.

### Settings (`src/screens/Settings.tsx`)
- Timezone (IANA, fixed; defaults to the device's on first run), **day starts at** (midnight to 6am, default 5am), week start and theme.
- Export: **JSON** (everything, raw) and **CSV**, which downloads four files: entries, metrics, calendar, goals.
- **App icon** (per device, `state/badge.ts`): puts today's open reminders on the installed app's icon via `navigator.setAppBadge`. iOS draws badges only with notification permission, so turning it on there asks for it; no notification is ever sent. Updates only while the app is open. Unsupported browsers (e.g. Android Chrome) get an explanation instead of the switch.
- **Restore from a backup** (`lib/importer.ts`, unit-tested): pick a JSON export. **Add-only**: any id already on the server, deleted ones included, is skipped, so nothing deleted comes back and nothing existing changes. Backup metrics with the same name and type as an existing one are merged into it (so restoring onto a freshly seeded account doesn't duplicate "Studying"). An incoming active goal on a metric that already has one is imported archived. Settings aren't imported. It needs a connection (it reads every collection from the server first, 15s timeout) and shows a summary to confirm.
- **Admin** (only for the admin account, `isAdmin` in `lib/admin.ts`): a link to the Users screen.
- Sign out, with a confirmation.

### Admin (`src/screens/Admin.tsx`, routes `#/admin` and `#/admin/<uid>`, lazy-loaded)
- **Who:** Malek's account, malekbaghdadi07@gmail.com, uid `mRRUx09pGmNZcOlLoBH5KWF9lxh1`. The uid is in **both** `ADMIN_UID` (`lib/admin.ts`, shows the screens) and `firestore.rules` (`isAdmin()`, which actually grants access). Change both together.
- **Read-only, enforced by the rules:** the admin can read any `users/{uid}/…` but writes stay owner-only. The screens have no buttons or inputs.
- **Users list:** every account in `profiles`, most recently seen first: email, joined date, last seen. Spark has no server to list Auth accounts, so each account writes its own `profiles/{uid}` doc (`saveProfile`, in `DataContext`) every time the app opens. An account appears only once it has opened a version with this.
- **One user:**
  - header: email, joined, last seen, timezone, "still on first run" if not onboarded, last logged
  - each active metric: target and schedule, today, last 7 days, current and best streak, and a 7-day strip (full = target met, faint = logged, outline = due and missed)
  - active deadline goals with progress bar and status
  - figures come from the same pure functions as the user's own screens (`buildDayStats`, `computeStreaks`, `computeGoal`), using **their** timezone and day start
- Data is fetched once per visit (`getDocs`, not listeners). Offline it falls back to whatever this device has cached and says so.
### First run
- On a new account the server confirms it's empty, then **only the settings doc** is seeded (`onboardedAt: null`). No metrics are made for them.
- **Onboarding** (`src/screens/Onboarding.tsx`) has two steps:
  1. **"What do you want to track?"**: tick any of the suggestions (`SUGGESTIONS` in `lib/seed.ts`: Studying, Reading, Gym, Calories, Water, Sleep, Walking, Meditation, Coding, Language practice, Music practice), or "Add your own" with a name and Time or Count (plus a unit). Typing a suggestion's name ticks it instead of duplicating it. "Start with nothing" finishes with no metrics.
  2. **"Set your targets"** for just those picks, with empty inputs on purpose, and days for day-of-week ones. Back keeps the picks.
- Finishing writes the metrics and `onboardedAt` in **one batch** (`finishSetup`). Nothing is written before that, so a half-finished setup can't exist.
- An account that is not onboarded but already has metrics (seeded by the old version) skips straight to targets.
- Malek's own account predates this and is unaffected. Network+ isn't a suggestion; it was his own.

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
profiles/{uid}                     Profile        (uid, email, joinedAt, lastSeenAt; owner writes, admin reads)
```

The owner can read and write everything under their `users/{uid}`; the admin account can read it too, never write. `profiles/{uid}` is written only by its owner, with only those four fields.

Types are in `src/lib/types.ts`. **Base units everywhere:** durations in **seconds**, counts as integers. Conversion happens only when displaying.

- **Metric:** `name`, `type` ('duration' or 'count'), `unit`, `target` (null means none), `targetDirection` ('at_least' or 'at_most'), `schedule` (daily, or days of the week with 0 = Sunday), `timerEnabled`, `quickAdd[]`, `color`, `icon`, `order`, `archivedAt`.
- **Entry:** `metricId`, `localDate` ('YYYY-MM-DD' in the configured timezone), `value` (always > 0), `source` ('timer', 'manual' or 'quick_add'), `note`, `occurredAt`, `deletedAt`.
- **Goal:** `metricId` (an at_least metric), `name`, `nameEdited`, `targetTotal`, `priorProgress`, `startDate`, `deadline` (both inclusive), `paceSchedule`, `archivedAt`. **Inputs only.** Progress, status, pace, projection and achieved date are never stored.
- **CalendarItem:** `kind` ('event' or 'reminder'), `title`, `localDate`, `time` ('HH:mm' or null for all day), `note`, `doneAt` (reminders), `deletedAt`.
- **Settings:** `timezone`, `weekStartsOn`, `theme`, `dayStartHour` (optional, 0–6; absent means 5), `onboardedAt` (null only on a freshly seeded account).

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
   - **The tracking day starts at `settings.dayStartHour`** (default `DEFAULT_DAY_START_HOUR` = 5 when the field is absent). Turning an instant into a day always goes through `dayOf` (in `dates.ts`, exposed as `useData().dayOf`), never `localDateOf` directly: "today", a timer entry's date and a metric's creation day all follow it. At 01:30 it is still yesterday.
   - The exception is a **clock time the user types** (Start earlier's "Started at"): that is a calendar time, resolved against the calendar date (`todayIn(tz)` with no offset).
9. **Seeding only happens when the server confirms the account is empty** (`fromCache === false`), so a new device with an empty cache can't overwrite a real account. Seeding writes settings only; metrics come from first run. Onboarding shows only when `settings.onboardedAt === null`, never merely when the field is missing.
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
- Spec §18 open questions were left at their defaults: Gym is a duration on Mon/Wed/Fri, and calories are a ceiling. Days rolled over at midnight until Malek asked for **5am** (he's often up past midnight); it's now a setting.

---

## Testing

```
npx tsc -p .          # type check (tsc runs as part of `npm run build` too)
npm test              # unit tests: streaks (30), goals (30), review (7), importer (8), dates (5)
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
| `goals` | goal form preview and validation, card (incl. amount ahead), pace line, detail and chart, edit recompute, one-per-metric, delete count, achieved |
| `extras` | (clock pinned to Monday) weekly review on Stats and not on Today, streak shading brightens day by day (metric and All views), notes on goal and Stats, hold/right-click start earlier, plain tap still starts, import rejects non-exports and needs a connection, badge setting shown |
| `yesterday` | off-day metric hidden on Today and in the sheet, restore-a-streak hint, quick add and Undo inside the sheet, − mode, custom amount dated yesterday, streak whole again on Today and in History |
| `day-start` | clock pinned to 01:30: Today shows the previous day, quick add and timer land on it, setting defaults to 5am, Midnight switches to the calendar date |
| `first-run` | (emulator-only `window.__e2eFirstRun` hook, since seeding needs the server) picker, toggling, own time and count metrics, typed suggestion name ticks it, Back keeps picks, only picks get targets, metrics created with target, existing metrics skip to targets, stays done after reload |
| `admin` | (emulator-only `logbook:e2e-admin` localStorage flag makes the test account admin) hidden and refused for non-admins; Users link; list shows own profile with joined and last seen; offline note; user detail with metric, target, today and 7-day totals; no inputs or buttons on it. The **security rules aren't tested** (no Firestore emulator). |
| `session-note` | short timer: plain toast; 11-minute timer (fake clock): note prompt stays, pen, save, note in History, dismiss |

**Only the Auth emulator is used,** because the Firestore emulator jar wouldn't download on this network (it hangs at 0 bytes). With Firestore unreachable, the app behaves exactly as it does offline, which is the path that matters most. As a result:
- **Seeding never runs on its own** in e2e. Emulator builds expose `window.__e2eFirstRun()` (in `DataContext`) to put the account into the first-run state; the other suites create metrics by hand.
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
    dates.ts (+test)      localDate helpers (date-fns / date-fns-tz), dayOf (5am rollover)
    streaks.ts (+test)    scheduled days, hits, streaks, hit rate, streak position per day
    goals.ts (+test)      deadline goal calculations, validation
    review.ts (+test)     weekly review figures
    importer.ts (+test)   JSON backup import plan (add-only)
    admin.ts              admin uid, profiles, loading another user's data, buildDayStats
    format.ts             durations, values, chips
    seed.ts               first-run metrics + settings
    export.ts             JSON and CSV export
    palette.ts, icons.ts  metric colours (validated) and curated icon set
    device.ts             device id, uuid, localStorage wrapper, iOS/standalone checks
  state/
    DataContext.tsx       the six listeners, derived maps, sync status, timer race resolution
    TimerContext.tsx      start/stop, switch prompt, abandoned-timer recovery, useElapsed, note prompt
    badge.ts              app-icon badge setting and hook
    theme.tsx             resolved theme, per-metric hue
  screens/                Today, History, Stats, Metrics, Settings, GoalDetail, Admin, Auth, Onboarding
  components/
    ui.tsx                Button, Sheet (native <dialog>), Segmented, Switch, DayPicker, Toast
    Chrome.tsx            SyncDot, TimerBar, TabBar, SideNav, UpdatePrompt, InstallCard
    EntrySheet.tsx        add / subtract / edit an entry
    MetricEditor.tsx      metric form, archive, delete
    MetricPicker.tsx      metric chips (+ "All")
    Items.tsx             event/reminder form and list
    Goals.tsx             goal form, Today card, progress bar, pace line, display helpers
    SessionNotes.tsx      notes list (goal detail, Stats)
    WeekReview.tsx        "Last week" card (top of Stats)
    StartEarlier.tsx      hold-to-start-earlier sheet, useLongPress
    YesterdaySheet.tsx    Today's "Yesterday" catch-up sheet
    inputs.tsx            duration/count inputs and parsers
e2e/                      browser tests + run-all.mjs runner
scripts/make-icons.mjs    regenerates public/ icons (no dependencies)
firestore.rules, firebase.json, .firebaserc, .env.example, .env.emulators
```

---

## Known gaps and open questions

**Not yet verified:**
- **Two devices starting timers while both offline** (the race resolution in `DataContext`, `state/timerClosed`). The checklist covered a timer moving between online devices, not this.
- **First-run seeding and onboarding** against the real backend (never runs in e2e).
- **Admin access against the real rules:** Malek's account should list users and open their data; a second account must get nothing from `#/admin` (the page says it isn't available, and the rules refuse the reads).
- **Firebase usage** staying in the low single-digit percentages of the Spark quotas.

### Device checklist

About 15 minutes with the phone and the laptop, both signed in. **All nine passed on 6 October 2026.** Re-run it after changes that touch sync, timers, iOS input styling or the PWA setup.

1. **Install (iPhone):** Safari → Share → Add to Home Screen. Open it from the icon, turn on airplane mode, close and reopen it: the app and today's data still show.
2. **Offline sync:** with both devices offline, log 15m of Studying on the phone and 30m on the laptop for today. Reconnect both. Within a minute both show 45m, and any goal card agrees.
3. **Timer across devices:** start a timer on the phone. The laptop shows the timer bar within a few seconds. Stop it on the laptop: the phone's bar disappears and the entry appears once.
4. **Locked phone:** start a timer, lock the phone for 30 minutes, unlock. The elapsed time is about 30 minutes and stopping logs it (and asks for a note).
5. **Date and time fields (iPhone):** open an entry's sheet and an event's sheet. The date and time text sits vertically centred in its box.
6. **Hold ▶ (iPhone):** press and hold the play button. The "Start … earlier" sheet opens, with no text-selection or callout popup.
7. **Badge (iPhone, installed):** Settings → App icon → turn on, allow notifications. Add a reminder for today, go to the home screen: the icon shows 1. Tick it off, reopen and leave: the badge clears.
8. **Export (iPhone, installed):** Settings → JSON. The file saves or opens a share sheet.
9. **Import:** on the laptop, export JSON, then import that same file. It says everything is already there.

**Ideas not built** (only if Malek asks):
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
9. **Goal amount and session notes:** goal status always shows the amount (no bare "On track"); timer sessions over 10 minutes ask "What did you accomplish?" in the toast and save the answer as the entry's note.
10. **Review, notes, start earlier, import, badge:** session notes listed on goals and in Stats; weekly review card; hold ▶ to start earlier; add-only JSON import; opt-in icon badge; device checklist in Known gaps.
11. **Review moved, streak calendar:** "Last week" moved from Today to the top of Stats (always shown). History shades days by streak length, one step brighter per day up to 7; the All view uses the average of each metric's streak (Malek's choice).
12. **Yesterday button:** catch up on yesterday from Today in a sheet with quick add; rows show when logging restores a streak.
13. **5am rollover:** the tracking day starts at `dayStartHour` (default 5) via `dayOf`; a "Day starts at" setting; e2e date math follows it.
14. **Off days hidden:** metrics not scheduled today no longer appear on Today (the collapsed section is gone), nor in the Yesterday sheet on their off days.
15. **Choose your own metrics on first run:** new accounts no longer get Malek's five metrics; they pick from suggestions or add their own, then set targets. Device checklist passed in full the same day.
16. **Admin view:** Malek's account can see every user (Settings → Admin → Users) read-only, via `profiles` and admin read access in the rules.

---

## Gotchas

- **The CDN caches `index.html` briefly after a deploy.** Verify the live page references the new `assets/index-*.js` before telling Malek it's live.
- **`npm run e2e` rebuilds `dist/` normally at the end.** If you build in emulator mode by hand (`vite build --mode emulators`), don't deploy that `dist/`. `npm run deploy` always rebuilds first anyway.
- **E2E date math must follow the 5am rollover.** Between midnight and 5am the app's "today" is the previous calendar date, so suites compute dates from `Date.now() - 5h`.
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

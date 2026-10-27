# Personal_tracker

Personal project to track daily habits across Android, desktop/laptop, and iOS devices.

The app is called **Logbook**: a private, offline-first daily tracker, installed as a PWA. Malek built it and runs it
(his account is the admin); friends and family use it too, each with their own account and their own private data.
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
| **Local checkouts** | `C:\Users\Malek Baghdadi\personal-tracker` (Windows 11 PC) and `~/Documents/Personal_tracker` (Mac) |
| **Last updated** | 21 October 2026 |

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
- History merges a day's quick adds and manual amounts into one summed line, editable as a total.
- A spotlight tour on each tab, deadline goal and plan screen the first time it opens, replayable from Settings → Tutorials.
- Rest days: a metric can allow N missed due days a week without breaking its streak (e.g. Gym Mon–Fri, 1 rest day).
- **Compete** tab: pair with one other account by invite code, race weekly on linked metrics (total, plus target days), and challenge each other (first to X, most in a period, most target days).
- Challenge logs: during a challenge both sides see each other's individual logs on that metric (time, amount, how, note), day by day.
- Challenges can have exact start and end times (e.g. Saturday 18:00 to Sunday 22:00) and an optional prize ("Winner gets …").
- Trash talk as a speech bubble from whoever is winning, using real names, margins and today's numbers.
- Several metrics on one side of a race (e.g. Network+ and Study against their Study), summed, added or removed freely from "Add metric".
- Compete is laid out as a scoreboard (weeks and challenges won) over three tabs: Races, Challenges, History.
- "End it now" on a running challenge (with an "Are you sure?" step): whoever's ahead at that moment wins.
- **Check-off metrics** (e.g. Gym): done or not done, one tap on Today. An existing time or count metric can switch to check off and keeps its history.
- **Range targets** (e.g. Calories 1,800–2,200 kcal): a day counts when its total ends up between the two.
- **Plans:** deadline goals counted in tasks, imported from a pasted Markdown checklist (with a copyable prompt that gets any AI chat to write one in the right format) or built in the app. Today shows the next undone task (a queue); dates only shape the pace line.
- **Achievements and a Profile tab:** 238 trading cards, 222 in ladders from Bronze to Mythic (longest session, hours, days on target, streaks, clean sweeps, big days, goals, Compete wins, odd hours, notes) plus 16 secrets, each drawn as a stained-glass enamel pin. They're kept in binders, a deck you swipe through: targeted binders (Study, Code & work, Reading, Fitness, Mind, Creative, Health, Sleep, Other) count the metrics linked to them, linked automatically from each metric's icon and changeable by hand, and give their cards their names (10h straight on Study is Academic Menace); general binders (Streaks, The grind, Goals & plans, Compete, Odd hours & notes, Secrets) count everything. Binders that can't earn anything yet are greyed out at the end. Unlocks drop a banner; cards are flipped to collect them; XP gives levels and ranks; a collected card can be worn as a title or pinned. The profile can be shown to the Compete partner (a switch). Profile replaced Settings in the phone tab bar; Settings is behind its gear.

**Verified:** type check, 222 unit tests, 20 browser test suites, and 78 security-rules checks against the Firestore emulator (`npm run test:rules`). The browser tests run against the local Auth emulator with Firestore unreachable, so they exercise the **offline path** only. See [Testing](#testing).

**Verified on real devices (6 October 2026):** Malek ran the full [device checklist](#device-checklist) on his iPhone and laptop and everything passed: install and offline launch, offline sync, timer across devices, locked phone, iOS date fields, hold ▶, badge, export and import.

**Still not verified:** see [Known gaps](#known-gaps-and-open-questions).

The two specs this was built from (the MVP spec and the "Deadline goals" addendum) are **not in the repo**. Malek pasted them into chat. Their important rules are captured below. If you need the full text, ask Malek for `TRACKER_MVP_SPEC.md` and the addendum.

---

## How we work

Malek owns the app and tests every change on his phone. **Friends and family use the live app too**, so every deploy
reaches them: never break existing data, keep nothing account-specific hardcoded, and remember their installed apps
update on their own schedule. The loop for every change is:

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
- **Machines:** a Mac (Node 24, Java 22, Chrome in /Applications) since 18 October 2026, and the Windows 11 PC (Node 22, Java 21). On the Mac the e2e runner finds Chrome by itself, and the Firestore emulator jar had to be fetched by hand (see [Gotchas](#gotchas)). On Windows: Both PowerShell and Git Bash are available. Mind the quoting differences: several heredoc and `sed` edits with backticks or backslashes were mangled during development, so prefer the file-edit tools or small script files.

---

## Features

### Today (`src/screens/Today.tsx`)
- **Date header:** tap it to open that day in History. A small summary line lists today's events and the count of open reminders, e.g. "Dentist · Network+ exam 14:00 · 1 reminder".
- **Yesterday button** (top right, `components/YesterdaySheet.tsx`): a sheet with every metric scheduled yesterday (others are hidden, like Today), yesterday's total against the target, and the same +/−, quick-add chips and custom amount as Today, all dated yesterday. Streaks are derived, so logging here restores a broken one by itself; each row says so ("1h 30m more restores your 2-day streak", "Target met · streak kept (3 days)"). Undo shows inside the sheet, because the app toast sits behind a modal. Long header dates use the short month so the button fits.
- **Install card:** shown once, until dismissed. It explains why to install to the home screen (iOS evicts a plain site's storage after 7 days).
- **Linked goals sit inside their metric's row** (Malek's call, 19 Oct 2026): an amount goal always counts one metric (its "Linked metric"), and a plan can link one. Today draws them in that metric's row, between its bar and its buttons, each as its own tinted panel (`bg-s1`) with a rule in the metric's colour down its left edge, so it reads as a separate element grouped with its metric (Malek asked for more room after the first, tighter version); 16px above, 12px between panels (`GoalInline` in `Goals.tsx`, `PlanCard` with `inline`), not as cards up top. The inline goal shows name · days left, done of target with the goal bar and pace marker, status and today's need; the inline plan is the plan card without its frame (status · today's need on the collapsed line; the metric's own total is right above, so no "logged today"). If the linked metric is archived, the goal falls back to a card up top.
- **Deadline goal cards** (goals and plans with no linked metric, or an archived one), nearest deadline first. Each shows:
  - total of target, and days left
  - a progress bar with a thin **expected-position marker** (bar past the marker means ahead)
  - status in time, always with the amount ("2h 10m behind", "12m ahead"; "Exactly on schedule" only when it rounds to 0). The `on_track` status still exists in `goals.ts`, but the card no longer hides the number behind it.
  - today's need ("Today: 50m of 1h 20m", or "Next: Monday, 1h 35m" on a non-work day)
  - an overload warning when the pace needed has more than doubled
- **One row per metric scheduled today**, in `order`. Metrics not scheduled today **don't appear at all** (Malek's call: Today is only what's due); log their off days from History. **Exception:** a metric also shows on a day a goal linked to it is scheduled (the goal's pace days / the plan's schedule), reading "Off day · streak not affected" with no target, bar or Rest day. This only changes what Today shows: neither side's saved days change, so it still isn't a streak day for the metric (Malek picked this over syncing the two schedules). A day when neither is scheduled hides both. With nothing scheduled it says "Nothing is scheduled today". Each row has:
  - name with its icon, today's total, the target, a progress bar and the current streak
  - its linked goals (above), under the bar
  - **Rest day** (metrics with rest days a week and a target): shown while this week's allowance isn't used and today isn't met. Tapping it marks today (`setRestDay`, Undo in the toast); the row then reads "Rest day today · streak kept" with an Undo link.
  - controls: **+/− toggle**, quick-add chips, a custom-amount (keyboard) button, and Start/Stop if the metric has a timer. On phones Start/Stop is icon-only so the row fits on one line.
  - **Check-off metrics** (`type: 'check'`) replace all of that with one button (`components/CheckButton.tsx`): "Mark done" / "✓ Done". The row reads "Check off", "Done" or "Not yet", and the streak. Tapping again unticks (soft-deletes everything logged that day for it), with Undo either way.
  - **Range targets** (`targetDirection: 'between'`): "Range 1,800–2,200 kcal", then "300 kcal to go" below the range, "in range" inside it, "300 kcal over" (red bar) above it. The bar runs to the upper end, with a tick at the lower end.
- **The +/− toggle:** in − mode the chips read −15m etc., and they and the custom button subtract. It resets to + when you leave Today.
- **Undo toast** after every log, subtract and delete.
- **Session note prompt:** stopping a timer after more than 10 minutes (`NOTE_PROMPT_AFTER_S` in `TimerContext.tsx`) turns the Undo toast into "What did you accomplish?" with a pen and ✕. It stays until dismissed; the pen opens an inline field and Save writes the entry's `note`. Shorter sessions get the normal toast.
- **Start earlier:** press and hold ▶ (or right-click it) to open "Start <metric> earlier": 5m–1h ago chips, or a start time (a time later than now means last night; over 12h is refused). The timer just gets an earlier `startedAt`. Holding only works while that row's timer isn't running, so a held Stop still stops.
- **Pinned timer bar** (`components/Chrome.tsx`): visible on every tab while a timer runs. It's the only thing that moves on its own (apart from Compete).

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
  - "Logged": entries grouped by metric, and add an entry for that day
  - **Merged line:** a day's quick adds and manual amounts for a metric show as **one line with their sum** ("850 kcal · 3 quick adds · last at 19:05"; `lib/entryRows.ts`, unit-tested). Timer sessions and anything with a note keep their own line. Display only: storage is still one entry per logging action (invariant 1).
  - Tapping the merged line opens **Edit total** (`TotalForm` in `EntrySheet.tsx`): lowering it trims the newest of those entries with `subtractFromDay`, raising it adds one manual entry for the difference, and "Remove all" clears them. Timer and noted entries are never touched. All with Undo.
  - Tapping any other line edits or deletes that entry.
  - A check-off metric's entries each read "Done" and are never merged; once a day is done there's no add button for it (it says "Mark done on this day" until then). A range day says "in range" / "out of range" instead of "target met" / "missed".
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
- Check-off metrics show "Days done" and "Due days done" and no chart (History's calendar already shows the days). Ranges draw both ends as dashed lines, labelled "Range".
- In "Last week", ranges show their average logged day like ceilings, and check-offs say "Done 3 of 5 days" with no best day.
- **Notes:** every entry with a note for that metric, newest first (5, then "Show all"). Tap one to edit the entry. Hidden when there are none.

### Metrics (`src/screens/Metrics.tsx`)
- Create, edit, drag to reorder (pointer-based so it works on iOS; arrow keys too), archive, and hard delete with a count of what goes.
- A metric's type is locked once it has entries, because switching would misread stored values. **The one exception is switching to check off** ("Switch to check off", 19 October 2026, for Malek's Gym): every day with anything logged becomes a done day, so streaks and history stay. It can't be switched back. It's refused while the metric is in a Compete race or has an active deadline goal (both need amounts).
- **Measured as:** Time, A number, or **Check off** (done or not done: target fixed at 1, unit `days`, no timer, no one-tap buttons).
- **Achievement binder**: nine buttons (Study, Code & work, Reading, Fitness, Mind, Creative, Health, Sleep, Other), each with its binder's icon: the targeted binder the metric is linked to. Until one is picked the metric follows its icon (`themeOf` in `lib/themes.ts`; a mortarboard is Study, a dumbbell Fitness, a moon Sleep, the default target Other); picking stores `theme` (the field kept its old name). Never decided from the name.
- **Daily target:** At least, At most, or **Range** (From and To, both inclusive; the upper end must be more than the lower). Like a ceiling, a range day only counts if something was logged.
- **Target history** (27 October 2026; Malek moved Network+ 2h to 30m, then to CCNA 1h30, and every change rewrote the old days): changing a target in the editor asks "New target applies from" (today by default, never later; pick an earlier day to repair the past) and **earlier days keep the target they had**. Stored as `Metric.targetHistory` (earlier versions, oldest first, each `{ from, target, targetDirection, targetMin }`, the first `from: null`) and `Metric.targetFrom` (the day the current target started); the metric's own `target` fields are always the latest, so Today, Metrics and Compete's link rules read them unchanged. A change replaces any version that started on or after its date; a date on or before the metric's first entry (or creation) replaces the target outright, and so does switching to check off. Only the target is versioned, not the schedule. `lib/targets.ts` (`targetOn`, `changeTarget`, `targetPeriods`, tested) is the one place that knows; everything that judges a past day (`isHitOn` in streaks, History, Yesterday sheet, Stats' stepped target line, the weekly review, achievements' streaks and overachiever, the Compete summary, Admin) asks it. Existing metrics have no history, so their past days still use today's target until Malek back-dates the changes (target 2h from the first day, then 30m from the day he changed it, and so on). Not versioned: the Bullseye secret still compares with the current target.
- **Deadline goals list:** active goals first, then archived ones with how they ended. "New goal" lives here. A metric's editor also offers "Add deadline goal", or "View deadline goal" when it has one.

### Goal detail (`src/screens/GoalDetail.tsx`, route `#/goals/<id>`, lazy-loaded)
- Large progress, status and today's need.
- Figures: required pace, planned pace, 14-day recent rate, projection, work days left, remaining.
- **Burn-up chart:** done (solid, with a "now" dot), steady pace (thin), and projection (dashed, after 3 or more work days of data).
- **Session notes** for entries between the goal's start and deadline (`components/SessionNotes.tsx`), with a hint when there are none yet.
- Terminal states: **Achieved** (date, days early; Archive or Raise the target) and **Missed** (final total and shortfall; Extend deadline or Archive). No confetti, no scolding.

### Plans (`lib/plans.ts`, `lib/planMarkdown.ts`, `lib/plansRepo.ts`, `state/PlansContext.tsx`, `components/Plans.tsx`, `components/PlanImport.tsx`, `screens/PlanDetail.tsx`, route `#/plans/<id>`)
From Malek's "Plans" spec (19 October 2026; it isn't in the repo, he pasted it). A Plan is a deadline goal measured in **tasks done**: an ordered checklist, optionally in sections (weeks), each section with an optional **checkpoint** (a milestone that doesn't count toward tasks or pace). General: nothing about any plan, weeks or Mon–Fri is special-cased.
- **Where:** in the Metrics tab's goals list beside amount goals. "New goal" now asks: **Amount goal** (unchanged), **Plan: import from Markdown**, or **Plan: start empty**. Amount goals are untouched (separate collections and code).
- **The queue:** the current task is always the first undone one in order (loose tasks first, then sections in order). Dates never decide what's shown. Several tasks a day is fine; tasks can be ticked in any order from the detail screen.
- **Pace** (`computePlan`, unit-tested): each task gets a pace-line date (`plannedDates`): its own target date, or, for a run of undated tasks, spread evenly over the scheduled days between the dated tasks around it (start date and deadline at the ends; the last of a run lands on the last day). **Expected** = tasks planned before today; **due through today** = planned up to today. Status: done < expected → "N tasks behind"; done > due through today → "N tasks ahead"; else "On pace". So doing today's own task is on pace, the next one is ahead, and today never counts against you. **Today's need** = due through today − done ("2 today to get back on pace", "1 today", "Today's done"). **Projection** from the last 14 days' rate per scheduled day (needs 3 scheduled days), walking scheduled days to a finish date ("At this rate: done 20 Nov" / "after the deadline"). **Overload**: behind and what's left needs more than double the planned rate (or no days left). Unscheduled days: the card still shows, nothing is due. **No overdue state**, ever; slipping only shows as behind.
- **End states** (derived, like amount goals): achieved when every task is done (the day of the last tick), missed once the deadline passes with tasks left (Extend deadline or Archive), archived (stored).
- **Push remaining** (`pushRemaining`): every undone dated task moves N scheduled days later, optionally the deadline too; the sheet previews the status after. Undo puts the old dates back.
- **Today card** (`PlanCard`), in the goals area, or inside its linked metric's row (see Today): collapsed shows plan name · section, the current task on one line with a tick, done/total and status (plus the linked metric's total today). Tap to expand (remembered per plan per device, `pt.plan.open.<id>`): full title and details, note, need and projection, the section's checkpoint, the next two tasks, "Open the plan". Ticking moves to the next task, with Undo. Finishing the last task shows confetti and a finished card that day; archived, missed, empty and older achieved plans stay off Today.
- **Detail screen:** progress with the pace marker, status, need, projection, figures, burn-up (tasks; planned line from the pace-line dates, step lines), the task list by section (the current task's section open, others folded with done/total), checkpoints at the end of their section, notes from tasks. Tasks: tick, title, target date, done date; tap for the task sheet (title, details, note, target date, section, delete). **Edit tasks** mode: drag handles to reorder within a section (`components/DragOrder.tsx`, the Metrics list's pointer approach, arrow keys too), add tasks per section, add/rename/move up-down/delete sections (deleting asks whether to keep the tasks outside any section), section checkpoint text. Also Edit plan (name, dates, schedule, linked metric, colour, icon), **From Markdown** (append, same preview), Archive, Delete (soft, with Undo). Everything has Undo.
- **Markdown import** (`parsePlanMarkdown`, unit-tested on `e2e/fixtures/uptime-plan.md`): paste is the main path (file picking in an installed iPhone app is awkward), a .md/.txt file is the fallback. Understands `# Title` (first: the default name), `## Heading` (a section; headings with no tasks under them are dropped), `- [ ]`/`* [ ]`/`- [x]` tasks, a bold date at the start of a task (`**Mon Oct 19:**`, `Oct 19`, `19 Oct`, `2026-10-19`; a weekday alone isn't a date; no year → the first date's year, rolling into the next year after December), indented lines under a task (details; sub-bullets become "•"), `**Checkpoint:** text` inside a section. Long text with no details: the first sentence is the title, the rest details. Code fences, tables, paragraphs and `###` headings are ignored, except that when no task is found outside code fences the fence lines are dropped and it's read again (a plan pasted along with the code block an AI chat wrapped it in). Inline bold/italic/`code` are kept and rendered (`Inline`), never shown as asterisks. **Preview** before anything is written: counts line ("6 sections · 30 tasks · 5 checkpoints · 19 Oct – 27 Nov · Mon–Fri"), sections expandable to their tasks, warnings (tasks without dates among dated ones, dates out of order, duplicate dates, dates outside the schedule, unreadable checkbox lines), and the editable fields: name, start (earliest date or today), deadline (latest date, or four weeks), schedule (the weekdays the dates fall on; all Mon–Fri → Mon–Fri), linked metric, colour, icon. Create writes it all (offline too); Cancel writes nothing; the Markdown itself isn't stored.
- **AI prompt** (Malek's ask, 21 October 2026): the import sheet starts with a folded "No plan yet? Have an AI write it" panel (`AiPrompt` in `PlanImport.tsx`): a read-only box with the prompt and **Copy the prompt** (clipboard; if that fails, the text is selected to copy by hand). The prompt (`planPrompt(today)` in `planMarkdown.ts`) has today's date, asks the AI to ask for the start, deadline and work days if missing, spells out the format the parser reads (dates as `**YYYY-MM-DD:**`, so no year guessing or wrong weekdays), asks for the whole plan in one code block (copying a code block keeps the Markdown; copying rendered chat text loses `- [ ]` and `##`), shows a short example (`promptExample`, unit-tested to parse with no warnings) and ends with "My goal: " for the user to fill in. It shows when adding to a plan too.
- **Linked metric:** optional. The plan then shows inside that metric's row on Today (and keeps the row visible on the plan's scheduled days). When that metric's timer stops after more than 10 minutes, the "What did you accomplish?" toast also shows "Mark done: <current task>". Tapping it ticks the task (again unticks); a note saved then goes on both the entry and the task. Skipping changes nothing.
- **Elsewhere:** History's day sheet lists "Plan tasks" done that day and (today or later) the ones planned for it, each tickable and tappable; the All calendar puts a small tick on days with tasks done. Stats' "Last week" adds a line per plan: tasks done, the week before, and ahead/behind going in → coming out (`planWeek`). JSON export includes `plans`, `planSections`, `planTasks`; CSV adds a plan-tasks file; restore adds them add-only like everything else; the admin view lists each user's active plans with progress and status. Tours: Today ("Plans", on `today-plan`) and the Metrics goals step mention them.
- **The fixture is a stand-in** written to the spec's description (same shape and dates); swap in the real Uptime Monitor plan when Malek provides it and re-run `npm test`.

### Profile and achievements (`src/screens/Profile.tsx`, route `#/profile`, lazy-loaded; logic in `lib/achievements.ts`, cards in `lib/achievementCatalog.ts`, themes in `lib/themes.ts`, state in `state/AchievementsContext.tsx`)
Malek asked for achievements "not half polished": many categories, an easy-to-brutal progression (1h of study up to 10h straight), funny names (Academic Menace), cards you collect onto a profile. His picks (21 October 2026): themes per metric so it suits every user (his cousin studies for the MCAT and reads), trading cards, Profile in place of the Settings tab with Settings kept intact behind a gear, and sharing with the Compete partner as a switch.
- **Ladders** (`LADDERS`): six steps each, Bronze, Silver, Gold, Platinum, Diamond, Mythic (10, 25, 50, 100, 200, 400 XP).
  - **Per theme**, counting that theme's metrics together: *Longest session* (one timer run; thresholds per theme, e.g. Study 1h, 2h, 3h, 5h, 8h, 10h, Mind 10m to 2h), *Hours in total* (time metrics), *Days on target* (any metric: a day one of them hit its target, or anything logged with no target; Sleep says nights). Health and Sleep only have days.
  - **Shared**: best streak (3 to 365), clean sweeps (every due target met that day), perfect weeks (every due day of a finished week), showing up (days with anything logged), biggest day and biggest week (time, Sleep left out), overachiever (1.5× to 10× an at-least target; Health and Sleep left out, so more water or sleep is never rewarded), goals and plans finished, plan tasks done, Compete weeks and challenges won, early bird (timer started 4 to 7am), night owl (timer running between midnight and 4am), notes written.
  - **Secrets** (`SECRETS`, 16): hidden as "???" with a hint until earned (Bullseye, Strategic Rest, Time Traveller, Hibernation Mode, New Year Same Grind, Did You Forget Something?, Essayist, It's Over 9000!, Speedrunner, Weekend Warrior, The Juggler, Photo Finish, Paid in Full, Ahead of Schedule, Phoenix, Monday Person).
  - In an active binder only ladders that apply show (time metrics for sessions, a target for streaks…), plus any ladder you hold cards from; a greyed binder shows all of its ladders, so you see what you could earn.
- **Unlocking is derived** (`evaluate`, pure, unit-tested) from entries, day totals, goals, plans, tasks and Compete results, each with the tracking day it was first earned and a line about what earned it ("2h 5m of MCAT prep"). Ceiling and range days only count once the day is over. Wall-clock times (early bird, night owl) use the user's timezone, not the tracking day.
- **Collecting is the one stored fact**: `users/{uid}/achievements/{id}` (`on`, `detail`, `collectedAt`), one doc per card, written when the card is flipped. A collected card stays even if the data behind it is deleted; an uncollected one comes and goes with the data.
- **The banner** (`components/AchievementBanner.tsx`): drops in at the top of any tab when something unlocks ("Achievement unlocked · Locked In · Silver", or a count), Collect goes to `#/profile/collect`. Each device remembers what it has announced (`pt.ach.seen.<uid>`); the first time on a device, everything already waiting is announced once as a backlog. Browser tests only get it with the `logbook:e2e-ach` flag. The Profile tab shows a count while cards wait (drawn from `data-count` by CSS, so the tab's text stays "Profile").
- **The reveal** (`components/Reveal.tsx`): a full-screen dialog, one face-down card at a time, rarest first; tap to flip (that collects it), +XP and what earned it, "Level up!" on the card that did it; Gold and up get a turning sunburst and confetti; "Collect all" takes the rest and shows a summary. Confetti and big effects are allowed here, as in Compete.
- **Cards** (`components/AchievementCard.tsx`, styles in `index.css` under "Achievements"): a metal frame per tier (Mythic's is a turning rainbow), a dark face in both themes, the art, the name, what it takes, a flavor line, the binder (with its icon), date and number. Platinum and up get a holographic foil. Locked cards are grey silhouettes; minis (art only) fill the ladder rows. Everything moving is off under reduced motion.
- **The art is a stained-glass enamel pin** (`components/PinArt.tsx`; Malek's pick on 21 October 2026, after he found the emoji "AI slop" and compared ten styles and six bundled emoji sets): a crest whose shape climbs with the tier (coin, ringed coin, shield, hexagon, rayed octagon, twelve-point star), filled with the tier's enamel and rimmed in its metal, and the card's lucide icon on top, filled with see-through enamel (42%) in a colour that suits it (water blue, fire orange, plants green) and outlined in the same metal. One icon per card in `lib/achievementArt.ts` (keyed by card id; the unit test checks every card has one and no ladder repeats one), colours from ten enamel inks. The metal gradients live once in `<PinDefs />`, mounted by the shell. The medallion shows the worn card's pin, or a steel coin with the rank's icon. Emoji are gone from the whole profile, but the catalog keeps them (`art`) and still sends them in the shared profile, so a partner on an older app still sees art; the new app draws a partner's cards from their ids.
- **The screen**: the name (editable, `displayName`), a medallion with the worn card's pin, title (a collected card's name, `settings.title`, or the rank), level and rank, XP to the next level, collected / ready / secrets found, cards per tier; the sharing switch; "Ready to collect" (face-down cards, Collect all); the showcase (up to three pinned, `settings.pinned`); a nudge for metrics still in Other; the binders; "Link metrics to binders" (every metric with a binder picker). Tapping a card: collected shows it in full with Pin and Wear as title; ready shows Flip it; locked shows what it takes and the best so far.
- **Binders** (`lib/binders.ts`, pure, unit-tested; Malek's picks on 21 October 2026): a deck swiped sideways, one binder per swipe (`Binders` in `Profile.tsx`; Malek found free scrolling "messed up and loose"): a pager, not native scrolling. The deck has `touch-action: pan-y`, so the browser keeps vertical scrolling and the app takes sideways drags; a drag past 18% of the page or a quick flick moves exactly one binder, less springs back, and the ends only give a little. The deck is a fixed window (the screen's height less the bars, 380 to 760px) and each binder scrolls up and down inside it (`overscroll-behavior: contain`). The one in front is full size, its neighbours peek in smaller and dimmer (a tap on one brings it forward); a strip of binder names above jumps to any, previous/next below. A swipe that ends over a card doesn't open it. The binder last looked at is remembered per device by its id (`pt.profile.binder`).
  - **Targeted** (the nine themes): count only the metrics linked to them. The link is the metric's `theme`, made automatically from its icon until changed, so every active metric sits in exactly one targeted binder (several per binder, summed; Other catches the rest). Each shows "Linked: …" and Change, which opens a sheet of every metric with a tick: ticking moves a metric here (its whole history counts at once; collected cards stay); unticking hands it back to automatic (`theme` deleted), or to Other when its icon points at this binder. A metric can't be unticked from Other, where unlinked metrics go.
  - **General** (Streaks, The grind, Goals & plans, Compete, Odd hours & notes, Secrets): count everything, never linked; each says what it counts.
  - **Greyed out and moved to the end** (in catalogue order) while a binder can't earn anything: a targeted one with no metric linked ("Link a metric"), Compete until paired, Goals & plans until there's a goal or plan, any other general one when none of its ladders apply (Secrets never). Its cards are desaturated, with what starts it and a button.
- **Levels**: level n needs 25·n(n−1)/2 XP (25, 75, 150, 250…). Ranks: Fresh Spawn (1), Tutorial Survivor (3), Side Quest Enjoyer (5), Certified Grinder (7), Main Character (10), Lowkey Legendary (13), Built Different (16), Final Boss (20), Patch Notes Material (25), Mythical Creature (30), Beyond Science (40).
- **Sharing** (`lib/profile.ts`): with the switch on (`settings.shareProfile`, off by default) and a pair, the app publishes `pairs/{id}/profiles/{uid}`: name, level, XP, rank, title, pinned and six latest cards, counts per tier. No entries, metrics or notes. Off, it deletes it. The partner's shows from the profile ("See Cousin's profile") and from their name on the Compete scoreboard, which also shows both titles. **The partner needs this version** to share or see theirs.
- **Never rename an achievement id** (`<theme>.<ladder>.<step>`, `<ladder>.<step>`, `secret.<key>`): collected cards are stored by it. Add steps or ladders instead.

### Settings (`src/screens/Settings.tsx`)
- On phones it opens from the gear on Profile (the Profile tab stays lit; a back arrow returns). The laptop sidebar lists both Profile and Settings.
- Timezone (IANA, fixed; defaults to the device's on first run), **day starts at** (midnight to 6am, default 5am), week start and theme.
- Export: **JSON** (everything, raw) and **CSV**, which downloads four files: entries, metrics, calendar, goals.
- **App icon** (per device, `state/badge.ts`): puts today's open reminders on the installed app's icon via `navigator.setAppBadge`. iOS draws badges only with notification permission, so turning it on there asks for it; no notification is ever sent. Updates only while the app is open. Unsupported browsers (e.g. Android Chrome) get an explanation instead of the switch.
- **Restore from a backup** (`lib/importer.ts`, unit-tested): pick a JSON export. **Add-only**: any id already on the server, deleted ones included, is skipped, so nothing deleted comes back and nothing existing changes. Backup metrics with the same name and type as an existing one are merged into it (so restoring onto a freshly seeded account doesn't duplicate "Studying"). An incoming active goal on a metric that already has one is imported archived. Settings aren't imported. It needs a connection (it reads every collection from the server first, 15s timeout) and shows a summary to confirm.
- **Admin** (only for the admin account, `isAdmin` in `lib/admin.ts`): a link to the Users screen.
- **Tutorials:** one button per tab to replay its tour (removes it from `toursSeen` and opens the tab).
- **Export** includes collected cards (`achievements`); restore adds the ones this account lacks, for cards that still exist.
- Sign out, with a confirmation.

### Compete (`src/screens/Compete.tsx`, route `#/compete`, lazy-loaded; logic in `lib/compete.ts`, writes in `lib/competeRepo.ts`, state in `state/CompeteContext.tsx`)
First built for Malek and his cousin, but nothing names either account: any two accounts can pair.
- **Layout:** a **scoreboard** at the top (each side's initial, each side's worn achievement title when known (yours always, theirs if they share their profile; tapping their name opens it, yours goes to Profile), the leader's crown, weeks won and challenges won across every race, draws under the label), the freshness line, any result banner, then anything waiting for an answer ("Waiting for you": link and challenge requests), then a sticky **Races / Challenges / History** switch (`Segmented`; the tab is remembered per device in `pt.compete.tab`). Races: one card per link, my pending proposals, "Link a metric". Challenges: live ones and "New challenge". History: past weeks of every race (6, then "Show all"), finished challenges (5, then "Show all"), and the pair itself (the name the other sees, Unlink).
- **Several metrics on a side** (18 October 2026; Malek wanted his Study hours to count alongside Network+): "Add metric" on a race card, or on a running challenge's card, opens "Metrics in this race" (`TeamForm`): my side (the first metric, then any added, each removable) and theirs (read-only; they change theirs on their phone). **Each member adds and removes their own freely, no acceptance** (his call; the rules enforce own-side only). Choices he made: it's per link, so it counts toward that race's weekly race and every challenge on it; a day is a **target day if any** metric on the side met its target (`combine`, with h > d > r > o > n). Only metrics that can be summed can join: time with time, counts with the same unit (`canJoin`), each on one link at a time. **Which weeks and challenges an added metric counts toward** (`counts`): anything that hadn't finished when it was added (so it counts from the start of this week and of every running challenge), and nothing that had; removing it takes it out of whatever is still running, while finished ones keep it. A timed challenge compares instants (`addedAt`/`removedAt`). Results go through `teamOf` → `sideAt`/`sideForChallenge` → the same `race`/`challengeResult`; challenge logs merge both metrics' logs, each labelled with its metric. **The partner needs this version too:** an older app ignores `extra` and shows only the first metric's numbers.
- **Pairing:** one person creates a 6-character invite code (no 0/O/1/I/L; expires after 7 days) and sends it with the share sheet; the other enters it under "Got a code?". Joining **needs a connection** (it reads the invite from the server, 15s timeout); creating the pair and deleting the invite are one batch. The pair's id is the code. One active pair per account in the UI. Each side picks the name the other sees (defaults to the email's local part) and can change it any time at the bottom of the tab ("Cousin sees you as … Change"; `renameInPair`; the rules let each member change only their own name, 1–30 characters). "Unlink" sets `endedAt`; nothing more is shared after that.
- **Linking metrics:** either side proposes one of their own **"at least"** metrics (`canLink`; not check-offs, whose days are 0 or 1 and which an older partner app wouldn't understand); the other accepts by picking one of theirs of the same type (time or count), or declines. **Time ranges** (study 1 to 4 hours, for Mariam) can be raced too (27 October 2026): the total still counts, and a target day is a day inside the range (`isHit`); the partner's app only sees the daily total and the day's status, so it needs nothing new. Ceilings and ranges of counts (calories) can't be raced. Accepting sets `startDate` to the first day of that week, so this week already counts.
- **Weekly race** (one card per link): this week's total for each side with a bar, target days met ("target 4/5 days", only for metrics with a target), who's ahead and by how much, the tally of weeks won since the link started, and last week's result. **A week goes to the higher total; equal totals go to more target days; then a draw.** Weeks follow the pair's `weekStartsOn` (the inviter's setting when the code was made).
- **Challenges** on a linked pair, which the other side accepts or declines; either side can call one off:
  - **First to X:** the earlier day to reach X wins; reaching it the same day goes to the higher total that day; if nobody gets there by the end date, the higher total wins.
  - **Most:** the higher total between the two dates.
  - **Most days:** more days with your own target met. Needs a target on both sides.
  - The start can't be before the link started; the end must be today or later. Finished challenges are listed with the winner (5, then "Show all").
  - **Times (optional, 15 October 2026; Malek asked for start and end "with hours"):** the form's "Set start and end times" switch adds a time to each date. The challenge then stores `startAt`/`endAt` (instants) alongside `startDate`/`endDate` (the creator's tracking days they fall on, so an app without this change still reads it as whole days). Only what happened inside the window counts: a timer for its part inside (`logInWindow`), anything else if logged inside it. Totals come from both sides' **shared logs**, not the day totals (`timedResult` in `lib/compete.ts`); first to X is decided by the instant each side reached it, partway through a timer if that's where it crossed. It settles once the other side has published after the deciding moment (their `updatedAt`), or once their day is past the last day; each app republishes once a timed challenge has ended (`endedSincePublish` in `CompeteContext`). Until the other side shares logs at all, it can't settle. **Most days ignores times** (target days are whole days), so the switch is hidden for it. Log days for a timed challenge are the days its start and end fall on by each side's own day boundary (`challengeSpan`), and its logs list shows only what's inside the window, with "+1h of 2h" for a part-counted timer.
  - **End it now (18 October 2026; Malek had set a challenge to the wrong end date):** on a running challenge, "End it now" (next to "Call it off") opens an "Are you sure?" panel that says who'd win right now, how fresh the other side's numbers are, and the stake; "Keep going" backs out. Ending stores `endedEarlyAt` (the instant), `endedEarlyOn` (the ender's tracking day) and `endedEarlyBy` on the challenge (`endChallengeNow`); results stay derived. `asRun` turns it into the challenge as it actually runs: **first to and most stop at that instant**: a timed one's `endAt` is pulled in; a whole-day one counts both sides' **shared logs on its days before that moment** (`challengeWindow` with no start; timers cut at the end), so it goes through `timedResult` too. Whoever is ahead then wins (first to: whoever got to X first, else the higher total). It settles once the other side has published after that moment, and each app republishes on seeing it (`endedSincePublish`), so with both apps open it's immediate. **Most days** counts whole days, so it can only be ended "today": it runs to the end of the ender's day and the button is hidden when it already ends today. The partner needs this version: an older app ignores the early end and keeps showing it running.
  - **Stake (optional, `stake`, up to 60 characters):** "Winner gets …", written by whoever creates the challenge, shown on the card (and to the other side before they accept) and on the result banner ("You get …" / "Cousin gets …" / "Nobody gets …" on a draw).
- **What's shared:** each app publishes `pairs/{id}/scores/{uid}` with, for each accepted link's metric only, its name/type/unit/target/colour/icon and per-day `{ t: total, s: status }` from the link's start (`s`: h = target met, d = due and missed, r = rest day, o = not due, n = no target). **On challenge days only** (every day of an accepted, not called-off challenge on that link, through today; `challengeDays`), it also carries `logs[date]`: each entry as `{ v, at, src, note? }` (value, `occurredAt`, t/m/q for timer/manual/quick add, the note). No other entries or notes, no other metrics, no settings. Malek asked for this ("make challenges more transparent"); the setup screen, link form and challenge form all say notes are shared during a challenge, and the entry sheet and the timer's note prompt say "Cousin sees this" on a challenge day (`sharedWith` in `CompeteContext`). Days before the metric existed aren't due (same as Stats). It's republished 2 seconds after any change (`PUBLISH_DELAY_MS`) and on a new day, so the other person's numbers are as fresh as **their last app open**; the screen says when they were updated.
- **Logs on a challenge** (`ChallengeLogs` in `Compete.tsx`): each active or awaiting challenge card lists both sides' logs for a day: time (a timer's start–end), how it was logged, amount and note, with the day's total and count. A day picker steps through the challenge so far (default today). Mine come from live data; theirs from their last publish. Before the partner has a version that publishes logs, it says their logs show once they update.
- **Results only settle when both sides' data is in:** a finished week or challenge waits ("waiting for Cousin's numbers") until the other side has published a day after the deciding day (`asOf`). Your own side always uses your live data, not your published doc.
- Results are derived each time, like streaks: backfilling an old day can change who won.
- **The fun part** (Malek asked for "full trash talk", no swearing, then for it to be "more prominent and more directed"): every race and challenge has a **speech bubble** between the bars and the verdict (`Bubble` in `Compete.tsx`, lines in `lib/taunts.ts`). The winner talks to the loser: when I'm ahead it's my bubble (right, my colour) aimed at them; when I'm behind it's theirs (left, their colour) aimed at me; a tie goes to "the ref" (centre, neutral). Lines use `{me}`, `{them}`, `{metric}`, `{gap}`, and today's totals and log counts, which are only filled in when the speaker is also ahead today; a line is only picked when all its placeholders are known. Picked by card and day so it holds still all day; each side sees their own version. Result banners use the same bubble. The leader gets a crown and a shine on their bar; bars grow in. Last week's result and challenges settled in the past two weeks show once as a banner at the top (`Results`): a win gets a trophy and confetti (`components/Confetti.tsx`, a canvas on `body`), a loss wobbles with a frown, a draw is plain. Dismissed banners are remembered per device (`pt.compete.seen` in localStorage). Confetti and big effects stay in Compete; the rest of the app only gets the subtle motion above.

### Tours (`components/Tour.tsx`, content in `lib/tours.ts`)
- One spotlight tour per tab (Today, History, Stats, Compete, Metrics, Profile, Settings), plus **Deadline goal** (route `goals`: what it is, ahead/behind, Linked metric on Edit, the chart) and **Plan** (route `plans`: what a plan is and how to make one, on pace, Link it to a metric on Edit plan, Push remaining, From Markdown, tasks). Today's tour has "Goals under a metric" on `today-linked`. Profile's has the binders: swiping the deck, targeted binders and their links (`profile-links`, on the binder in front), general binders (`profile-binder-tabs`), all links at once. A tour that changed a lot gets a `rev`; it's marked seen as `id@rev` (`tourKey`), so it shows once more to people who saw the old one. Started by `TourHost` in the shell the first time that screen opens, after 600ms and only if no sheet is open and settings have loaded (so never during first run).
- Each step points at a `data-tour="…"` marker in a screen. Steps whose marker isn't on screen are dropped when the tour starts (no metrics, no timer, no goals…); steps with no target are a centred card.
- The screen is dimmed except a ring around the target; taps underneath are blocked. Skip, Back, Next/Done, "2 of 8"; Escape skips, arrow keys move.
- Finishing or skipping adds the id to `settings.toursSeen` with `arrayUnion` (per account, so it holds on every device). Leaving the tab mid-tour doesn't mark it.
- **When adding UI, add a step** with a marker if it's something a new user should know about.

### Admin (`src/screens/Admin.tsx`, routes `#/admin` and `#/admin/<uid>`, lazy-loaded)
- **Achievements** on each user's page: their title, level, XP, collected and waiting counts (waiting worked out from their data), cards per tier and pinned cards.
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
  1. **"What do you want to track?"**: tick any of the suggestions (Gym is a check-off, Mon/Wed/Fri) (`SUGGESTIONS` in `lib/seed.ts`: Studying, Reading, Gym, Calories, Water, Sleep, Walking, Meditation, Coding, Language practice, Music practice), or "Add your own" with a name and Time, Count (plus a unit) or Check off. Typing a suggestion's name ticks it instead of duplicating it. "Start with nothing" finishes with no metrics.
  2. **"Set your targets"** for just those picks, with empty inputs on purpose, and days for day-of-week ones. Check-offs only get days. Back keeps the picks.
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
- `src/state/CompeteContext.tsx` adds two more listeners (this account's invites and pairs) and, once paired, three on the pair (links, challenges, scores). It wraps the whole shell, not just the tab, so logging anywhere republishes the summary.
- `src/state/AchievementsContext.tsx` (inside Compete) adds one listener for collected cards and, once paired, one for the pair's shared profiles. It works out every unlock with `evaluate` on each change (Compete results are keyed as text so the 30-second clock doesn't re-run it), runs the banner, and publishes or removes the shared profile 2 seconds after a change.
- `src/lib/repo.ts` holds **all writes** (Compete's are in `competeRepo.ts`, the profile's in `admin.ts`), and none are awaited (the `fire()` helper). They commit to the local cache at once and flush when online.
- "Today" is recomputed every 30 seconds and when the tab becomes visible, so midnight rollover and goal deadlines update while the app stays open.

**PWA:** `vite.config.ts` uses `registerType: 'prompt'`, so it never auto-reloads. The update prompt is hidden while a timer runs, and only the app shell is precached; Firestore has its own offline cache. iOS meta tags, safe-area insets and `navigator.storage.persist()` are in place.

**Motion** (`src/index.css`, the "Motion" block): quick and quiet. Buttons squeeze and spring back (`.press`), sheets slide up and back down on phones and scale in on wider screens (`Sheet` keeps its last content on screen while it closes, `CLOSE_MS` = 200). Malek asked for "a bit more and a bit bigger, nothing too crazy" on 11 October, so the press squeeze, pops, hops, toasts, tab fade and sheet entrance are a notch stronger than the first pass, and sheets settle with a small overshoot (`--ease-settle`), toasts rise in, each tab fades in when opened, the tab you pick hops, segmented controls slide their highlight, progress bars fill (`.bar-fill`), and a Today total pops when it changes (`useBump` in `ui.tsx`: only on a change, never on first render). **Everything is off under `prefers-reduced-motion`**, and `Sheet` then closes at once. Note that headless Chrome reports reduced motion, so the browser tests run without animation except `compete`, which turns motion on.

**Theme:** CSS variables in `src/index.css`, switched by `data-theme` on `<html>`. The theme is cached in localStorage and applied before first paint (inline script in `index.html`). Each metric's colour comes from a palette checked for contrast and colour-blind separation in both themes (`src/lib/palette.ts`); the light theme maps each stored dark hex to its pair.

**Routes:** `#/today`, `#/history[/YYYY-MM-DD]`, `#/stats`, `#/compete`, `#/metrics`, `#/profile[/collect]`, `#/settings`, `#/goals/<id>`, `#/plans/<id>`, `#/admin[/<uid>]`. The goals and plans routes highlight the Metrics tab; on phones Settings and admin highlight Profile.

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
users/{uid}/plans/{planId}         Plan           (soft-deleted via deletedAt)
users/{uid}/planSections/{id}      PlanSection    (soft-deleted; planId, order, checkpoint, checkpointDoneAt)
users/{uid}/planTasks/{id}         PlanTask       (soft-deleted; planId, sectionId, order, targetDate, doneAt, note)
users/{uid}/achievements/{id}      CollectedAchievement (id = the card's id; on, detail, collectedAt; never deleted)
profiles/{uid}                     Profile        (uid, email, joinedAt, lastSeenAt; owner writes, admin reads)
invites/{code}                     Invite         (Compete: anyone signed in can get one code, never list; inviter creates/deletes)
pairs/{code}                       Pair           (members [2 uids], names, weekStartsOn, endedAt; members read; joiner creates from a live invite)
pairs/{code}/links/{id}            Link           (uid → metricId, type, proposedBy, acceptedAt, startDate, endedAt, extra: uid → [{ metricId, addedOn, addedAt, removedOn, removedAt }])
pairs/{code}/challenges/{id}       Challenge      (linkId, kind, amount, startDate, endDate, createdBy, acceptedAt/declinedAt/cancelledAt, optional startAt/endAt, stake, endedEarlyAt/On/By)
pairs/{code}/scores/{uid}          Score          (asOf, updatedAt, per-metric per-day totals; each member writes only their own)
pairs/{code}/profiles/{uid}        SharedProfile  (name, level, xp, rank, title, pinned, tiers, collected, total, recent; only while sharing is on; each member writes or deletes only their own)
```

**Compete rules** (`firestore.rules`): pairing never opens anyone's `users/{uid}`. Only the two members can read a pair and its subcollections; after unlinking they can still read, but nobody can publish, link or challenge. On a link, each member can change only their own entry in `extra`. Types are in `lib/compete.ts`.

The owner can read and write everything under their `users/{uid}`; the admin account can read it too, never write. `profiles/{uid}` is written only by its owner, with only those four fields.

Types are in `src/lib/types.ts`. **Base units everywhere:** durations in **seconds**, counts as integers. Conversion happens only when displaying.

- **Metric:** `name`, `type` ('duration', 'count' or 'check'), `unit` ('days' for check), `target` (null means none; always 1 for check), `targetDirection` ('at_least', 'at_most' or 'between'), `targetMin` (only for 'between': the lower end, `target` is the upper; null otherwise), `schedule` (daily, or days of the week with 0 = Sunday), `timerEnabled`, `quickAdd[]`, `color`, `icon`, `order`, `archivedAt`, `restDaysPerWeek` (optional, 0–3), `targetHistory` / `targetFrom` (optional, the targets this metric had before the current one and the day the current one started; see Metrics), `restDates` (optional, days marked as rest; written with `arrayUnion`/`arrayRemove`, and the editor keeps the live list when saving), `theme` (optional; absent means it follows the icon).
- **Entry:** `metricId`, `localDate` ('YYYY-MM-DD' in the configured timezone), `value` (always > 0; 1 for a check-off tick), `source` ('timer', 'manual' or 'quick_add'), `note`, `occurredAt`, `deletedAt`.
- **Goal:** `metricId` (an at_least metric), `name`, `nameEdited`, `targetTotal`, `priorProgress`, `startDate`, `deadline` (both inclusive), `paceSchedule`, `archivedAt`. **Inputs only.** Progress, status, pace, projection and achieved date are never stored.
- **CalendarItem:** `kind` ('event' or 'reminder'), `title`, `localDate`, `time` ('HH:mm' or null for all day), `note`, `doneAt` (reminders), `deletedAt`.
- **Plan:** `name`, `startDate`, `deadline` (inclusive; may be after the last task, a buffer), `schedule` (pace days, default Mon–Fri), `metricId` (optional link), `color`, `icon`, `archivedAt`, `deletedAt`. **Inputs only**: progress, current task, pace, projection and achieved/missed are derived.
- **PlanSection:** `planId`, `title`, `order`, `checkpoint` (text or null), `checkpointDoneAt`, `deletedAt`.
- **PlanTask:** `planId`, `sectionId` (null: not in a section), `order` (within its section), `title`, `details`, `targetDate` (pace only), `doneAt` (the tick), `note`, `deletedAt`. Each task is its own doc, so ticking two different tasks on two offline devices merges, and ticking one twice is the same result.
- **Settings:** `timezone`, `weekStartsOn`, `theme`, `dayStartHour` (optional, 0–6; absent means 5), `onboardedAt` (null only on a freshly seeded account), `toursSeen` (optional list of tours seen: the tour id, plus `@<rev>` once a tour has a revision, e.g. `profile@2`), and the profile's `displayName`, `title` (a collected card's id), `pinned` (up to three ids), `shareProfile` (all optional).
- **CollectedAchievement:** `id` (the card's), `on` (tracking day it was earned), `detail` (what earned it), `collectedAt`. Everything else about achievements is derived.

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
   - **A day is judged against the target in force on it** (`targetOn`, `isHitOn`), never today's: changing a target must not rewrite what was met before the change.
   - **Today never breaks a streak.**
   - An `at_most` (ceiling) day counts only if something was logged that day, so a forgotten day isn't a perfect calorie day. The same goes for a `between` (range) day, which also has to reach `targetMin`.
   - **A check-off's day total is 1 if anything is logged** (`buildDayStats` in `admin.ts`, given the metrics' types). Two ticks from two offline devices are one done day, and a metric switched to check keeps its old minutes as done days. Screens that sum raw entries for a check metric show "Done" instead.
   - **Rest days** (`restDays` in `streaks.ts`, unit-tested): with `restDaysPerWeek` = N, each week (per `weekStartsOn`) up to N due days that weren't hit are treated like unscheduled days. Days marked in `restDates` go first, then the earliest unlogged days. Today is a rest day only if marked (unmarked, it's still open). A hit is never a rest day. Days before tracking started don't use the allowance. Rest days are derived; only the marks are stored. Streaks, hit rate, History shading and "target met x / y", and the weekly review all leave them out.
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
12. **Compete scores are the one stored derived figure,** and only because the other account can't read your data. Their `logs` (challenge days only) are a copy of entries for the partner, never read back by your own screens. They're a published copy for the partner: your own screens never read your score doc, and results (weeks won, challenge winners) are still derived each time, never stored.
13. **A plan task's tick is state on the task (`doneAt`), never an entry.** Entries stay what they are for metrics. Everything about a plan except its inputs is derived (`lib/plans.ts`), and dates only shape the pace line: the current task is the first undone one, and nothing is ever overdue.
14. **Zero recurring cost:** nothing that needs the Blaze plan, no Cloud Storage, no native iOS app.
15. **Achievements are derived; collecting is the only stored fact** (`users/{uid}/achievements/{id}`). Card ids are stored, so they never change. Themes never come from a metric's name: from its `theme`, else its icon. Nothing rewards more water, food or sleep than the target.

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
npm test              # unit tests: streaks (43), compete (41), targets (12), plans (34), achievements (32), goals (30), importer (11), binders (8), taunts (7), review (7), checkoff (6), entryRows (6), dates (5)
npm run e2e           # browser tests; or: npm run e2e -- goals core
npm run test:rules    # security rules against the Firestore emulator (69 checks)
```

**Browser tests (`e2e/`):**
- `run-all.mjs` starts the **Auth emulator** and a dev server in emulator mode, runs each suite with `puppeteer-core` driving your installed Chrome, then builds the production bundle and serves it for `offline.mjs`. It shuts everything down afterwards and rebuilds `dist/` normally.
- Set `CHROME_PATH` if Chrome isn't at `C:\Program Files\Google\Chrome\Application\chrome.exe` (Windows) or `/Applications/Google Chrome.app` (macOS; `run-all.mjs` sets that default).
- Every suite but `compete` asks for reduced motion (`emulateMediaFeatures`). Headless Chrome reports reduced motion on Windows but not on macOS, and with animations on, clicks time out mid-animation.
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
| `goals` | goal form preview and validation, goal inside its metric's row (no card up top) with amount ahead and today's pace, detail and chart, edit recompute, one-per-metric, delete count, achieved |
| `extras` | (clock pinned to Monday) weekly review on Stats and not on Today, streak shading brightens day by day (metric and All views), notes on goal and Stats, hold/right-click start earlier, plain tap still starts, import rejects non-exports and needs a connection, badge setting shown |
| `yesterday` | off-day metric hidden on Today and in the sheet, restore-a-streak hint, quick add and Undo inside the sheet, − mode, custom amount dated yesterday, streak whole again on Today and in History |
| `day-start` | clock pinned to 01:30: Today shows the previous day, quick add and timer land on it, setting defaults to 5am, Midnight switches to the calendar date |
| `first-run` | (emulator-only `window.__e2eFirstRun` hook, since seeding needs the server) picker, toggling, own time and count metrics, typed suggestion name ticks it, Back keeps picks, only picks get targets, metrics created with target, existing metrics skip to targets, stays done after reload |
| `admin` | (emulator-only `logbook:e2e-admin` localStorage flag makes the test account admin) hidden and refused for non-admins; Users link; list shows own profile with joined and last seen; offline note; user detail with metric, target, today and 7-day totals; no inputs or buttons on it. The **security rules aren't tested** (no Firestore emulator). |
| `merge-entries` | three quick adds show as one 850 kcal line; total editor lists the pieces; lowering trims, raising adds, still one line; noted entry keeps its own line; Remove all leaves the noted entry; single-metric view merges too |
| `tours` | (emulator-only `logbook:e2e-tours` flag; tours are off in every other suite) none during first run; Today tour skips missing steps; spotlight lines up with its target; taps underneath blocked; Skip, Next, Back, Done, Escape; seen tours stay seen after reload; Settings replays Today with all 8 steps; nothing logged by the tour; no Plan/Deadline goal replay buttons until one exists; Plan tour (6 steps, Link it to a metric on Edit plan) on the first plan opened; Deadline goal tour with Linked metric on Edit; Today replay spotlights the linked goals in the metric row; Settings → Plan replays it on the plan |
| `check-range` | Check off offered for new metrics; a timed Gym with yesterday logged switches to check off (explains history is kept, hides target/one-tap/timer); Today row: Not yet → tap → Done, streak 2, toast, untick, Undo, survives reload; Yesterday sheet shows it done; History day sheet reads Done with no add button; Calories range: upper below lower refused, list shows 1,800–2,200 kcal, 300 to go / in range / 300 over; Stats legend says Range, Gym shows Days done and no chart; fresh check-off metric has no goal button |
| `target-history` | (Study 30m, 30m logged yesterday) the date field appears only once the target is edited and defaults to today; raising the target to 1h 30m leaves yesterday meeting its old target in History; Today and the editor's target history show both targets; a back-dated change to yesterday re-judges it; a start in the future is refused |
| `plans` | (clock pinned to the plan's dates through `localStorage['e2e.day']`) New goal asks for a type; the AI prompt panel is folded, opens to a prompt with today's date and the task format, and Copy puts it on the clipboard; pasting the Uptime Monitor fixture previews "6 sections · 30 tasks · 5 checkpoints · 19 Oct – 27 Nov · Mon–Fri" with the name and no warnings; Cancel saves nothing; Create; Today on 19 Oct: collapsed card, Monday's task, On pace; tick → Tuesday, on pace; tick → Wednesday, 1 ahead; Undo; expanded card (details, need, checkpoint, next, link) and the tick survive a reload; Wed 21 Oct: Tuesday's task still current, 1 task behind, 2 today to get back on pace, nothing red; detail: current section open, others folded, burn-up draws both lines; Push remaining 1 day → On pace, Undo, push again; task sheet, note, Undo; linked timer stopped after 25m offers Mark done, which ticks it and puts the note on entry and task; linked, the plan sits inside the metric's row between bar and buttons with no card up top; History day sheet lists the task; metric made Mon/Wed/Fri: Thursday shows its row as an off day with the plan, Saturday (both off) shows neither; Start empty with two undated tasks: on pace Wednesday, 1 behind Thursday |
| `rest-days` | (clock pinned to Thursday) editor offers None–3 for a 5-day schedule; an unlogged Wednesday is the rest day and the streak holds; no button once used; History labels it "rest"; Rest day button marks today, Undo, survives reload and a metric edit |
| `compete` | (emulator-only `window.__e2eCompete` hooks play the partner by writing into the cache) Compete tab after Stats; setup explains what's shared (notes during challenges); taunt is a 16px+ bubble from the leader; challenge logs: mine listed, theirs wait for their update, then show with times, timer span and note, day picker can't go before the start, mine published with notes only on challenge days, entry sheet says Cousin sees the note; invite code, expiry, cancel; bad code refused; joining offline needs a connection; pairing; link proposal and acceptance; race card, target days, tally, last week; what's published (only the summary, no notes); link request on a missing type, decline; challenge form validation; stake on the card; timed challenge: no time fields until switched on, end before start refused, only logs inside the window count, a part-inside timer shows "+1h of 2h"; first to, most days (their request, accepted), finished list; end it now (asks first and says who'd win, Keep going backs out, waits for their next publish, then the leader at that moment wins); call off; change my name (empty refused); unlink. Runs **with motion on**: taunts, crown on the leader, loss banner wobbles, win banner with confetti that cleans itself up |
| `session-note` | short timer: plain toast; 11-minute timer (fake clock): note prompt stays, pen, save, note in History, dismiss |
| `achievements` | (`logbook:e2e-ach` flag for the banner; fake clock; motion on) tab bar ends with Profile; a new metric's theme follows its icon, Study picked in the editor; nothing waiting at first, nudge for a metric under Other; the binder deck: active binders first (Study, Other…), greyed ones after Secrets, Study in front (targeted, linked to MCAT prep), no emoji on the profile and the cards are pins, a tab tap and a finger swipe move the deck, a hard fling moves exactly one binder, a nudge springs back, a vertical drag scrolls inside the binder without changing it, the deck keeps one height, Streaks is general, Fitness, Compete and Goals greyed, Link a metric on Fitness ticks Water in (Fitness lights up) and out again (greyed); a 2h 5m timer drops the banner with what unlocked and a count on the tab; Collect opens the reveal face down, flip shows XP and what earned it, next, Collect all summary; binder states (1h and 2h collected, 3h locked), XP to next level, best so far; locked card progress; collected card detail, pin, wear as title; a locked secret only gives a hint; Link metrics moves Water to Health (nudge gone, Health lights up, Other greys out); a 10h session: Academic Menace first (Mythic, sunburst); reload opens the deck on the last binder and keeps title, pin and cards, no re-announce; gear opens Settings, Profile tab stays lit, back arrow; sharing: hint when unpaired, switch off by default, on publishes a summary without entries, partner's profile from the profile and the scoreboard (their title shown), off takes it down; light theme; laptop sidebar has Profile and Settings |

**Only the Auth emulator is used by the browser tests.** The Firestore emulator jar used to hang at 0 bytes on this network; it finally downloaded on 10 October 2026 and is used by `npm run test:rules` (`e2e/rules.mjs`, started by `e2e/run-rules.mjs`, which stops the emulator afterwards because `emulators:exec` leaves Java running on Windows). The browser tests still run with Firestore unreachable on purpose. With Firestore unreachable, the app behaves exactly as it does offline, which is the path that matters most. As a result:
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
    tours.ts              tour steps per tab
    themes.ts             achievement themes, a metric's theme (stored, else from its icon)
    binders.ts (+test)    the binders: targeted (linked metrics) and general, greyed, order
    binderIcons.ts        each binder's icon (small: the metric editor uses it)
    achievementArt.ts     each card's icon and enamel colour, rank icons
    achievementCatalog.ts every card: ladders, secrets, tiers, XP, levels, ranks (ids are stored: never rename)
    achievements.ts (+test) what's unlocked and when (pure), what each card takes
    profile.ts            level/title summary, the profile shared with the Compete partner
    compete.ts (+test)    Compete types, published summary, weekly race, challenge results, invite codes
    competeRepo.ts        Compete writes: invites, joining, links, challenges, publishing
    entryRows.ts (+test)  merging a day's quick adds into one History row
    format.ts             durations, values, chips
    seed.ts               first-run metrics + settings
    export.ts             JSON and CSV export
    palette.ts, icons.ts  metric colours (validated) and curated icon set
    device.ts             device id, uuid, localStorage wrapper, iOS/standalone checks
  state/
    DataContext.tsx       the six listeners, derived maps, sync status, timer race resolution
    TimerContext.tsx      start/stop, switch prompt, abandoned-timer recovery, useElapsed, note prompt
    badge.ts              app-icon badge setting and hook
    CompeteContext.tsx    invites, pair, links, challenges and scores listeners; publishes this account's summary
    theme.tsx             resolved theme, per-metric hue
  screens/                Today, History, Stats, Compete, Metrics, Profile, Settings, GoalDetail, PlanDetail, Admin, Auth, Onboarding
  components/
    ui.tsx                Button, Sheet (native <dialog>), Segmented, Switch, DayPicker, Toast
    Chrome.tsx            SyncDot, TimerBar, TabBar, SideNav, UpdatePrompt, InstallCard
    EntrySheet.tsx        add / subtract / edit an entry
    MetricEditor.tsx      metric form, archive, delete
    MetricPicker.tsx      metric chips (+ "All")
    Items.tsx             event/reminder form and list
    Goals.tsx             goal form, Today card, inline goal for its metric's row, progress bar, display helpers
    SessionNotes.tsx      notes list (goal detail, Stats)
    WeekReview.tsx        "Last week" card (top of Stats)
    StartEarlier.tsx      hold-to-start-earlier sheet, useLongPress
    Tour.tsx              spotlight tours (TourHost)
    PinArt.tsx            a card's stained-glass enamel pin, the shared metal gradients
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
- **Compete with two real accounts:** Malek and his cousin paired for real on 11 October 2026 and it worked. Challenge logs and notes between two real phones haven't been seen yet.
- **Firebase usage** staying in the low single-digit percentages of the Spark quotas.
- **Achievements on real accounts:** the backlog banner and collecting on Malek's history; the cousin's themes (her metrics may sit under Other until she picks); profile sharing between two real phones (both need this version).

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
- repeating events
- multi-metric goals
- Plans: sharing with the paired account or in Compete, repeating tasks, sub-tasks, exporting a plan back to Markdown (all out of scope in the spec)

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
17. **Merged quick adds:** History shows a day's quick adds and manual amounts as one summed line; tapping it edits the total.
18. **Tutorials:** a spotlight tour per tab on first open, remembered per account, replayable from Settings. (Goal and plan screens got their own in 29.)
19. **Rest days:** "Rest days a week" on any metric; one missed due day a week (marked ahead with Rest day, or just not logged) keeps the streak. For Malek's Gym: Mon–Fri, 1 rest day.
20. **Compete** (asked for with his cousin): a Compete tab; pair by invite code; weekly race on linked metrics (higher total wins, target days break ties) with a tally; challenges (first to X, most in a period, most target days) that the other side accepts; each app publishes only a per-day summary of linked metrics. First security-rules tests, now that the Firestore emulator downloads.
21. **Polish and trash talk:** springier taps, sliding sheets, rising toasts, tab fades, filling bars and pops on change across the app (all off with reduced motion). Compete got taunts, a crown for the leader, and result banners with confetti for wins and a wobble for losses. Names can be changed in Compete.
22. **Challenge logs, louder trash talk, a bit more motion:** during a challenge both sides see each other's logs (amount, time, how, note) day by day on the challenge card; taunts became speech bubbles from whoever's winning, using real names, gaps and today's numbers; animations a notch bigger.
23. **Challenge times and stakes:** challenges can start and end at a set time, counting only what's logged in between (a timer for its part inside); and an optional "Winner gets …" prize shown on the card and the result banner.
24. **Mac setup, several metrics per side, Compete layout:** the repo now runs on a Mac too (Chrome path, reduced motion in the e2e suites). A side of a race can hold several metrics, summed (Network+ and Study against Study), added and removed freely. Compete became a scoreboard over Races / Challenges / History tabs.
25. **End a challenge now:** "End it now" on a running challenge, behind an "Are you sure?" panel: only what's logged up to that moment counts and whoever's ahead wins (most days: ends after today).
26. **Check-off metrics and ranges:** a third metric kind, Check off (done or not, one tap), which a time or count metric with history can switch to (Malek's Gym); and Range targets (Calories 1,800–2,200 kcal). Check-offs can't be raced in Compete or have deadline goals.
27. **Plans** (from Malek's spec): task-based deadline goals with sections and checkpoints, imported from pasted Markdown with a preview or built in the app; a queue on Today with pace, push remaining, a linked timer's Mark done, History, Stats, export/restore and admin.
28. **Linked goals inside their metric's row:** an amount goal (field renamed "Linked metric") or a plan linked to a metric shows on Today between that metric's bar and buttons instead of as a card up top; the metric row also shows on days only its goal is scheduled ("Off day · streak not affected"). Replaces the old "Goal pace" line. Each linked goal is its own tinted panel with the metric-coloured rule.
29. **Plan and Deadline goal tutorials:** tours on the plan and goal screens the first time each opens (making a plan, pace, linking to a metric, Push remaining, Markdown, tasks), a Today step for linked goals; Settings → Tutorials replays them on the nearest active plan or goal.
30. **Achievements and a Profile tab:** 238 trading cards (222 in themed and shared ladders, plus 16 secrets) from Bronze to Mythic, unlocked from the data with the day each was earned, a banner on unlock, a flip-to-collect reveal, XP, levels and ranks, titles and a showcase, a theme picker in the metric editor, sharing with the Compete partner (a switch; titles on the scoreboard), admin and export support. Profile replaced Settings in the phone tab bar; Settings is unchanged behind its gear.
31. **Pins and binders:** card art is a stained-glass enamel pin (crest by tier, a coloured icon per card) instead of emoji, everywhere on the profile; the binder became a deck of binders you swipe through, targeted ones linked to metrics (automatically from the icon, changeable from the binder or the metric editor) and general ones not, greyed binders at the end; the Profile tour got binder steps and shows once more to anyone who saw the old one (`rev: 2`).
32. **AI prompt for plans:** the plan import sheet has a prompt to copy into any AI chat so the Markdown it writes back imports cleanly; a plan pasted with its code fence still reads.
33. **Target history:** a metric remembers its earlier targets, so changing it (with an "applies from" date, back-datable) no longer rewrites old days, streaks, hit rates or Compete target days.

---

## Gotchas

- **The CDN caches `index.html` briefly after a deploy.** Verify the live page references the new `assets/index-*.js` before telling Malek it's live.
- **The Firestore emulator download can stall** (`downloading cloud-firestore-emulator-v1.22.0.jar...` forever; it did on the PC and on the Mac). Fetch it yourself into the cache: `curl -o ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar` (adjust the version to what the log names).
- **Don't edit `src/` while `npm run e2e` runs:** the suites drive a Vite dev server, which reloads the page on a change, and the suite running at that moment can fail.
- **`npm run e2e` rebuilds `dist/` normally at the end.** If you build in emulator mode by hand (`vite build --mode emulators`), don't deploy that `dist/`. `npm run deploy` always rebuilds first anyway.
- **E2E date math must follow the 5am rollover.** Between midnight and 5am the app's "today" is the previous calendar date, so suites compute dates from `Date.now() - 5h`.
- **Puppeteer and the fixed tab bar:** clicking a button near the bottom can land on the tab bar, because the button is scrolled just into view. Click by text through `page.evaluate` instead (see the `press()` helper in `e2e/goals.mjs`).
- **iOS Safari date and time inputs** need `appearance: none` plus an explicit height and line-height. The rule is in `index.css`; keep it when restyling inputs.
- **Recharts single-point lines are invisible,** which is why the burn-up chart draws a dot on the latest "done" point.
- **The Firestore `where('deletedAt', '==', null)` queries** rely on every doc having `deletedAt` set (null, not missing). Always write it explicitly.
- **Deleting a metric** deletes its goals in the same batch. A goal whose metric is missing (e.g. edited offline elsewhere after the delete) is ignored by `DataContext`.
- **`innerText` follows CSS `text-transform`:** the reveal's labels are uppercase on screen, so tests match them case-insensitively.
- **Settings has no phone tab:** tests reach it with the Profile tab, then `main a[href="#/settings"]` (the sidebar's link is hidden at phone width).
- **An old app saving a metric drops `theme`** (it writes the whole doc), so the metric falls back to its icon until it's picked again on an updated app.

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

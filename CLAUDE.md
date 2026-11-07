# CLAUDE.md

**Read `README.md` first.** It's the full handoff: status, how we work, architecture, data model,
invariants, decisions, testing and known gaps. This file is just the short version of the rules.

- Offline-first PWA ("Logbook") built and run by Malek, used by him and by friends and family (each with their own
  account; every deploy reaches them). Live at https://personal-tracker-cec8a.web.app,
  repo https://github.com/MalekBaghdadi/Personal_tracker (main). Worked on from a Windows 11 PC and a Mac.
- Loop for every change: edit → `npx tsc -p .` → `npm test` → `npm run e2e` (look at `e2e/shots/` for UI)
  → `npm run deploy` → confirm the live `index.html` references the new bundle. After touching
  `firestore.rules`, also run `npm run test:rules` (Firestore emulator).
- **Push to GitHub only when Malek asks.** `git fetch` first; he sometimes edits on GitHub, so rebase onto
  `origin/main` if it moved. Never commit `.env.local`.
- Firebase is owned by malekbaghdadi07@gmail.com (not malek.baghdade@gmail.com). `firebase login` is
- Updates install themselves (`UpdatePrompt` in `components/Chrome.tsx`): the new service worker waits and the page reloads only at a quiet moment: no timer running, first-run setup finished, no `dialog[open]` or `aria-modal` overlay, nothing focused for typing, no tap for 10 s. A new overlay must therefore be a `<dialog>` (or `aria-modal`), or an update can reload under it. `e2e/auto-update.mjs` covers it.
  code-based here: send him the URL, he pastes back the code.
- Don't break the invariants in README §7, especially: entries are append-only and a day's total is the
  sum of its entries (never a stored total); entry values are always > 0 (subtracting trims entries,
  clamps at 0); writes are never awaited; no hardcoded metric names; goals and streaks are derived,
  never stored; today never breaks a streak.
- The day rolls over at `settings.dayStartHour` (default 5am), not midnight. Turn instants into days with
  `dayOf` / `useData().dayOf`, never `localDateOf` directly.
- Multi-user: each account has its own `users/{uid}`. The admin (Malek's uid) is hardcoded in both
  `src/lib/admin.ts` and `firestore.rules`; admin access is read-only and the rules enforce it. The Users list and a user's page also show a running timer live (`watchTimer` in `lib/admin.ts`, `components/TimerStrip.tsx`).
- Compete (pairs of accounts): neither side can read the other's `users/{uid}`; each app publishes only a
  per-day summary of linked metrics to `pairs/{id}/scores/{uid}`, plus individual logs (with notes) on challenge days
  only. Results are derived from those, never stored. A side can hold several metrics (`Link.extra`, summed; each member
  edits only their own side), check-offs included: each checked day counts as the `worth` its owner gave it (in force
  that day, `worthOn`) and is a target day; the owner's app publishes it already converted (`checkAsRace`).
- Challenge times are shown in plain 12-hour words (`clock12`/`whenText` in `lib/dates.ts`: noon and midnight are named, midnight names both days);
  never print a bare "12:00" for a challenge. "Change end" (`changeChallengeEnd`) lets either side move a running challenge's end; it must write
  `endAt` and `endDate` together and records `endChangedBy`/`endChangedFrom` so the other side sees it.
- Plans (task-based deadline goals, `lib/plans.ts`): a tick is `doneAt` on its own task doc, never an entry; progress,
  the current task (first undone) and pace are derived; dates only shape the pace line, nothing is ever overdue.
  The parser (`lib/planMarkdown.ts`) is tested against `e2e/fixtures/uptime-plan.md`.
- Phrases (`type: 'phrase'`, `lib/phrases.ts`): a phrase is an entry of 1 with `text` and `reference`; reviews are their own docs
  (`users/{uid}/reviews/{id}`). A day owes a review once an older phrase exists, and is only a hit with it (`DayStat.open`, `isHitDay`):
  never judge a phrase day with `isHitOn` and a bare total. Not raceable in Compete; linked to the `wisdom` (Phrases) binder. The optional carousel (`Metric.carousel`, `components/PhraseCarousel.tsx`, Today row only)
  must stay a pure view over `usePhraseDay(...).all`: no Firestore reads or writes while it cycles, and nothing stored per phrase shown.
  It advances on the pace timer (`dwellMs`) whatever `prefers-reduced-motion` says (that only drops animation and the ticker's scrolling), and a resting mouse pointer never pauses it; gating the timer on reduced motion once left it stuck on Malek's PC.
- A deadline goal or plan linked to a metric is drawn inside that metric's Today row (between bar and buttons), not as a
  card; the row also shows on days only the goal is scheduled, without changing either side's saved days or the streak.
- Achievements (`lib/achievements.ts`, cards in `lib/achievementCatalog.ts`): unlocks are derived from the data; collecting a
  card (`users/{uid}/achievements/{id}`) is the only stored fact, so card ids are never renamed. A metric's theme (its
  targeted binder) is its `theme`, else its icon (`lib/themes.ts`), never its name, and must suit every user. Nothing rewards
  more water, food or sleep than the target. The profile is shared with the Compete partner only while its switch is on.
- Card art is a stained-glass enamel pin (`components/PinArt.tsx`), one icon per card in `lib/achievementArt.ts` (a new ladder
  needs six there). No emoji on the profile; the catalog's emoji are only sent to partners on older apps. Binders
  (`lib/binders.ts`): targeted ones count linked metrics, general ones everything; greyed binders go to the end.
- On phones the Profile tab replaced Settings; Settings is unchanged behind Profile's gear (tests: Profile tab, then
  `main a[href="#/settings"]`).
- New UI a new user should know about gets a `data-tour` marker and a step in `src/lib/tours.ts`.
- Android app (README "Android app"): the same web app in an APK (Capacitor, `android/`), whose one extra is Stop on the
  lock screen. Its native code (`LogbookRest.java`) writes exactly what `stopTimer` writes, over Firestore REST; change
  how timers are stored and you change it too (`npm run test:native`). Web changes reach the APK with a normal deploy
  (`app-bundle.json`); only `android/` changes need a new APK, published from the Actions tab (Android APK workflow).
  Bump `NATIVE_API` in `src/lib/native.ts` and `LockTimerPlugin.java` together when the web app needs new native code.
  In a plugin method, read a number as `call.getData().opt(key)` + `instanceof Number`, never `getDouble`/`getInt`/`getLong`:
  each refuses the other boxed types, and that silently stopped the notification in android-1.1 (README change 44).
- Ask Malek when a request is structurally ambiguous; he prefers a question to a wrong guess.

# CLAUDE.md

**Read `README.md` first.** It's the full handoff: status, how we work, architecture, data model,
invariants, decisions, testing and known gaps. This file is just the short version of the rules.

- Single-user offline-first PWA ("Logbook") for Malek. Live at https://personal-tracker-cec8a.web.app,
  repo https://github.com/MalekBaghdadi/Personal_tracker (main). Windows 11 machine.
- Loop for every change: edit → `npx tsc -p .` → `npm test` → `npm run e2e` (look at `e2e/shots/` for UI)
  → `npm run deploy` → confirm the live `index.html` references the new bundle.
- **Push to GitHub only when Malek asks.** `git fetch` first; he sometimes edits on GitHub, so rebase onto
  `origin/main` if it moved. Never commit `.env.local`.
- Firebase is owned by malekbaghdadi07@gmail.com (not malek.baghdade@gmail.com). `firebase login` is
  code-based here: send him the URL, he pastes back the code.
- Don't break the invariants in README §7, especially: entries are append-only and a day's total is the
  sum of its entries (never a stored total); entry values are always > 0 (subtracting trims entries,
  clamps at 0); writes are never awaited; no hardcoded metric names; goals and streaks are derived,
  never stored; today never breaks a streak.
- The day rolls over at `settings.dayStartHour` (default 5am), not midnight. Turn instants into days with
  `dayOf` / `useData().dayOf`, never `localDateOf` directly.
- Multi-user: each account has its own `users/{uid}`. The admin (Malek's uid) is hardcoded in both
  `src/lib/admin.ts` and `firestore.rules`; admin access is read-only and the rules enforce it.
- New UI a new user should know about gets a `data-tour` marker and a step in `src/lib/tours.ts`.
- Ask Malek when a request is structurally ambiguous; he prefers a question to a wrong guess.

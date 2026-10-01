# Personal_tracker

Personal project to track daily habits across Android, desktop/laptop, and iOS devices.

The app is called **Logbook**: a private, offline-first daily tracker. Vite + React 18 + TypeScript, Firestore with
persistent local cache, installed as a PWA. Zero recurring cost on the Firebase Spark plan.

## One-time setup (≈10 minutes)

1. **Create the Firebase project.** Go to https://console.firebase.google.com and click **Add project**.
   Leave the plan on **Spark**. Analytics isn't needed.
2. **Turn on Auth.** Go to Build → Authentication → Get started → **Email/Password** → Enable.
3. **Create Firestore.** Go to Build → Firestore Database → Create database, choose **Production mode**, and pick the
   region closest to you (e.g. `eur3` or `europe-west1` for Beirut).
4. **Register a web app.** Go to Project settings → Your apps → `</>`. Copy the config values into
   `.env.local`, using `.env.example` as the template:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_APP_ID=...
   ```
5. **Deploy the rules and the app:**
   ```
   npx firebase login
   npm run deploy                  # builds, then deploys hosting + firestore rules
   ```
   `.firebaserc` already points at `personal-tracker-cec8a`. For a different project, run
   `npx firebase use --add`. `.env.local` is git-ignored, so recreate it on a new machine:
   ```
   cp .env.example .env.local      # then fill in the values
   ```
   The app is then live at `https://your-project.web.app`.
6. **On each device**, open that URL, create the account once (or sign in), and install it to the
   home screen. On iPhone: Safari → Share → Add to Home Screen. Installing matters: Safari can
   evict a plain website's offline data after 7 days, but installed web apps are exempt.

## Development

```
npm install
npm run dev            # against your real project (.env.local)
npm test               # streak/target unit tests
```

### Against local emulators (no Firebase account needed)

```
npm run emulators      # terminal 1: Auth + Firestore emulators (needs Java; first run downloads the Firestore jar)
npm run dev:emu        # terminal 2
```

With only the Auth emulator running (`npx firebase emulators:start --project demo-logbook --only auth`),
Firestore is unreachable, so the app behaves exactly as it does fully offline. That's a quick way to
exercise the offline path. First-run seeding waits for the server to confirm the account is empty, so
it won't happen in that mode. Create metrics from the Metrics tab instead.

## How it's built

- **Entries are append-only documents** with client-generated UUIDs. A day's total is always the
  sum of that day's non-deleted entries; there is no stored total. Two devices logging offline
  produce two documents, and both survive. Corrections edit or soft-delete single entries.
- **One listener** loads all non-deleted entries; every aggregate (totals, streaks, stats) is
  computed in memory. Four listeners in total: metrics, entries, timer, settings.
- **Writes are never awaited.** They land in IndexedDB at once and flush when online.
- **Timers** store `startedAt` only; elapsed time is computed every frame. Stopping writes the entry
  and clears the timer in one batch. If two devices start timers while offline, the earlier start
  wins once both are back online (see `state/timerClosed` and `DataContext`).
- **Service worker** uses `registerType: 'prompt'`. It never reloads silently, and the update prompt
  is hidden while a timer runs.

`src/lib/streaks.ts` implements §9 of the spec and is covered by `streaks.test.ts`.

## Layout

```
src/lib/        types, dates (tz), streaks, repo (all writes), seed, export, firebase
src/state/      DataContext (listeners + aggregates), TimerContext, theme
src/screens/    Today, History, Stats, Metrics, Settings, Auth, Onboarding
src/components/ ui primitives, EntrySheet, MetricEditor, Chrome (timer bar, nav, PWA prompts)
scripts/        make-icons.mjs (regenerates public/ icons)
```

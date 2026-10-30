import { Suspense, lazy, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { DataProvider, useData } from './state/DataContext';
import { TimerProvider } from './state/TimerContext';
import { CompeteProvider } from './state/CompeteContext';
import { PlansProvider } from './state/PlansContext';
import { AchievementsProvider } from './state/AchievementsContext';
import { ThemeProvider } from './state/theme';
import { useAppBadge } from './state/badge';
import { SideNav, TabBar, TimerBar, UpdatePrompt } from './components/Chrome';
import { AchievementBanner } from './components/AchievementBanner';
import { PinDefs } from './components/PinDefs';
import { ToastProvider, cx } from './components/ui';
import { AuthScreen } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { History } from './screens/History';
// Charts are the heaviest dependency; Today shouldn't wait on them. The chunk
// is still precached, so Stats opens offline.
const Stats = lazy(() => import('./screens/Stats').then((m) => ({ default: m.Stats })));
const GoalDetail = lazy(() => import('./screens/GoalDetail').then((m) => ({ default: m.GoalDetail })));
const PlanDetail = lazy(() => import('./screens/PlanDetail').then((m) => ({ default: m.PlanDetail })));
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Compete = lazy(() => import('./screens/Compete').then((m) => ({ default: m.Compete })));
const Profile = lazy(() => import('./screens/Profile').then((m) => ({ default: m.Profile })));
import { Metrics } from './screens/Metrics';
import { Phrases } from './screens/Phrases';
import { TourHost } from './components/Tour';
import { Settings } from './screens/Settings';

export type Route = 'today' | 'history' | 'stats' | 'compete' | 'metrics' | 'profile' | 'settings' | 'goals' | 'plans' | 'admin' | 'phrases';
const ROUTES: Route[] = ['today', 'history', 'stats', 'compete', 'metrics', 'profile', 'settings', 'goals', 'plans', 'admin', 'phrases'];

/**
 * `#/history/2026-10-02` → day '2026-10-02'; `#/goals/<id>` → goal id; `#/plans/<id>` → plan id; `#/admin/<uid>` → user id;
 * `#/profile/collect` → the profile, straight into collecting; `#/phrases/<id>` → a phrase metric's collection.
 */
function readRoute(): { route: Route; day: string | null; id: string | null } {
  const [r, param] = window.location.hash.replace(/^#\/?/, '').split('/') as [Route, string | undefined];
  const route = ROUTES.includes(r) ? r : 'today';
  const day = route === 'history' && param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null;
  const id = (route === 'goals' || route === 'plans' || route === 'admin' || route === 'profile' || route === 'phrases') && param ? param : null;
  return { route, day, id };
}

function useRoute(): { route: Route; day: string | null; id: string | null } {
  const [state, setState] = useState(readRoute);
  useEffect(() => {
    const on = () => {
      setState(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return state;
}

export function App() {
  // undefined = still reading the persisted session (local, no network).
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (!firebaseConfigured) return <SetupNeeded />;

  if (user === undefined) return <ThemeProvider pref={undefined}><div className="min-h-dvh bg-bg" /></ThemeProvider>;
  if (user === null) {
    return (
      <ThemeProvider pref={undefined}>
        <AuthScreen />
      </ThemeProvider>
    );
  }
  return (
    <DataProvider key={user.uid} user={user}>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const { ready, settings, timer } = useData();
  const { route, day, id } = useRoute();
  useAppBadge();
  // The goal screen hangs off Metrics, where the Goals list lives; admin off Settings; a collection off Today.
  const tab: Route = route === 'goals' || route === 'plans' ? 'metrics' : route === 'admin' ? 'settings' : route === 'phrases' ? 'today' : route;
  // On phones Settings has no tab of its own: it opens from the profile.
  const phoneTab: Route = tab === 'settings' ? 'profile' : tab;

  // Only a freshly seeded account has onboardedAt === null. A settings doc
  // created later by a partial write (field absent) must never re-trigger it.
  // New accounts start with no metrics: first run is where they're picked.
  const needsOnboarding = ready && settings !== null && settings.onboardedAt === null;

  return (
    <ThemeProvider pref={settings?.theme}>
      <ToastProvider>
        <PlansProvider>
        <CompeteProvider>
        <AchievementsProvider>
          <TimerProvider>
            {!ready ? (
              // The local cache answers in milliseconds; this is never a network wait.
              <div className="min-h-dvh bg-bg" />
            ) : needsOnboarding ? (
              <Onboarding />
            ) : (
              <div className="flex min-h-dvh">
                <SideNav route={tab} />
                <div className="min-w-0 flex-1">
                  <TimerBar />
                  {/* The timer bar carries the status-bar inset when it's showing. */}
                  {/* Keyed by tab so each one fades in when opened. */}
                  <main key={tab} className={cx('screen-in', !timer && 'safe-top')}>
                    {route === 'today' && <Today />}
                    {route === 'history' && <History openDate={day} />}
                    {route === 'stats' && <Suspense fallback={null}><Stats /></Suspense>}
                    {route === 'compete' && <Suspense fallback={null}><Compete /></Suspense>}
                    {route === 'metrics' && <Metrics />}
                    {route === 'profile' && <Suspense fallback={null}><Profile collectNow={id === 'collect'} /></Suspense>}
                    {route === 'settings' && <Settings />}
                    {route === 'goals' && <Suspense fallback={null}><GoalDetail id={id} /></Suspense>}
                    {route === 'plans' && <Suspense fallback={null}><PlanDetail id={id} /></Suspense>}
                    {route === 'admin' && <Suspense fallback={null}><Admin id={id} /></Suspense>}
                    {route === 'phrases' && <Phrases id={id} />}
                  </main>
                </div>
                <TabBar route={phoneTab} />
                <TourHost route={route} />
                <AchievementBanner />
                <PinDefs />
              </div>
            )}
            <UpdatePrompt />
          </TimerProvider>
        </AchievementsProvider>
        </CompeteProvider>
        </PlansProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function SetupNeeded() {
  return (
    <main className="mx-auto max-w-lg px-5 py-12 text-[15px] leading-relaxed">
      <h1 className="text-[22px] font-semibold">Firebase isn’t configured</h1>
      <p className="mt-3 text-ink-2">
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase web app config, and restart the dev
        server. The README has the full steps.
      </p>
    </main>
  );
}

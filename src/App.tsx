import { Suspense, lazy, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { DataProvider, useData } from './state/DataContext';
import { TimerProvider } from './state/TimerContext';
import { ThemeProvider } from './state/theme';
import { useAppBadge } from './state/badge';
import { SideNav, TabBar, TimerBar, UpdatePrompt } from './components/Chrome';
import { ToastProvider } from './components/ui';
import { AuthScreen } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { History } from './screens/History';
// Charts are the heaviest dependency; Today shouldn't wait on them. The chunk
// is still precached, so Stats opens offline.
const Stats = lazy(() => import('./screens/Stats').then((m) => ({ default: m.Stats })));
const GoalDetail = lazy(() => import('./screens/GoalDetail').then((m) => ({ default: m.GoalDetail })));
import { Metrics } from './screens/Metrics';
import { Settings } from './screens/Settings';

export type Route = 'today' | 'history' | 'stats' | 'metrics' | 'settings' | 'goals';
const ROUTES: Route[] = ['today', 'history', 'stats', 'metrics', 'settings', 'goals'];

/** `#/history/2026-10-02` → day '2026-10-02'; `#/goals/<id>` → goal id. */
function readRoute(): { route: Route; day: string | null; id: string | null } {
  const [r, param] = window.location.hash.replace(/^#\/?/, '').split('/') as [Route, string | undefined];
  const route = ROUTES.includes(r) ? r : 'today';
  const day = route === 'history' && param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null;
  const id = route === 'goals' && param ? param : null;
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
  const { ready, settings, metrics, timer } = useData();
  const { route, day, id } = useRoute();
  useAppBadge();
  // The goal screen hangs off Metrics, where the Goals list lives.
  const tab: Route = route === 'goals' ? 'metrics' : route;

  // Only a freshly seeded account has onboardedAt === null. A settings doc
  // created later by a partial write (field absent) must never re-trigger it.
  const needsOnboarding = ready && settings !== null && settings.onboardedAt === null && metrics.length > 0;

  return (
    <ThemeProvider pref={settings?.theme}>
      <ToastProvider>
        <TimerProvider>
          {!ready ? (
            // The local cache answers in milliseconds; this is never a network wait.
            <div className="min-h-dvh bg-bg" />
          ) : needsOnboarding ? (
            <Onboarding key={metrics.map((m) => m.id).join(',')} />
          ) : (
            <div className="flex min-h-dvh">
              <SideNav route={tab} />
              <div className="min-w-0 flex-1">
                <TimerBar />
                {/* The timer bar carries the status-bar inset when it's showing. */}
                <main className={timer ? undefined : 'safe-top'}>
                  {route === 'today' && <Today />}
                  {route === 'history' && <History openDate={day} />}
                  {route === 'stats' && <Suspense fallback={null}><Stats /></Suspense>}
                  {route === 'metrics' && <Metrics />}
                  {route === 'settings' && <Settings />}
                  {route === 'goals' && <Suspense fallback={null}><GoalDetail id={id} /></Suspense>}
                </main>
              </div>
              <TabBar route={tab} />
            </div>
          )}
          <UpdatePrompt />
        </TimerProvider>
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

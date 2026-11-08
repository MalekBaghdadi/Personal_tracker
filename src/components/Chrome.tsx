import { useEffect, useRef, useState } from 'react';
import { BarChart3, CalendarDays, CircleUserRound, ListChecks, Settings as SettingsIcon, Square, SunMedium, Trophy } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useData, type SyncState } from '../state/DataContext';
import { useAchievements } from '../state/AchievementsContext';
import { useElapsed, useTimerActions } from '../state/TimerContext';
import { formatTimeIn } from '../lib/dates';
import { isIos, isStandalone, local } from '../lib/device';
import { APK_PAGE, LIVE_SITE, LockTimer, isNative, onNativeResume, quietly } from '../lib/native';
import { Button, IconButton, cx } from './ui';
import { TimerStrip } from './TimerStrip';
import { ApkUpdateButton, apkPhaseText } from './ApkUpdate';
import { lookForApk, useApkUpdate } from '../state/apkUpdate';
import type { Route } from '../App';

// ── Sync indicator: a dot, never a banner. Offline is a normal state. ─────

const SYNC_COPY: Record<SyncState, { label: string; detail: string }> = {
  synced: { label: 'Synced', detail: 'Everything is saved and synced.' },
  pending: { label: 'Syncing', detail: 'Saved on this device. Sending to your other devices.' },
  offline: { label: 'Offline', detail: 'Saved on this device. It will sync when you’re back online.' },
};

export function SyncDot() {
  const { sync } = useData();
  const c = SYNC_COPY[sync];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3" title={c.detail} role="status" aria-label={c.detail}>
      <span
        className={cx(
          'size-1.5 rounded-full',
          sync === 'synced' && 'bg-ok',
          sync === 'pending' && 'bg-ink-2',
          sync === 'offline' && 'border border-ink-3',
        )}
      />
      <span className="hidden sm:inline">{c.label}</span>
    </span>
  );
}

// ── Running timer: pinned, visible from every tab. ─────────────────────────

export function TimerBar() {
  const { timer, metricById, tz } = useData();
  const { stop } = useTimerActions();
  const elapsed = useElapsed(timer?.startedAt);
  const metric = timer ? metricById.get(timer.metricId) : undefined;
  if (!timer) return null;

  return (
    <div className="sticky top-0 z-30 safe-top bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <TimerStrip
        className="mx-auto max-w-2xl border-b border-line px-4 py-2"
        name={metric?.name ?? 'Timer'}
        color={metric?.color ?? '#8590a3'}
        since={formatTimeIn(timer.startedAt, tz)}
        elapsed={elapsed}
        action={
          <Button variant="primary" className="px-3" onClick={() => stop()} aria-label={`Stop ${metric?.name ?? 'timer'} and log it`}>
            <Square size={14} fill="currentColor" />
            Stop
          </Button>
        }
      />
      {elapsed < 0 && (
        <p className="mx-auto max-w-2xl px-4 py-1 text-[12px] text-ink-3">
          This device’s clock is behind the one that started the timer.
        </p>
      )}
    </div>
  );
}

// ── Navigation ─────────────────────────────────────────────────────────────

type Tab = { route: Route; label: string; icon: typeof SunMedium };

// Phones have room for six: Settings opens from the profile's gear instead.
const TABS: Tab[] = [
  { route: 'today', label: 'Today', icon: SunMedium },
  { route: 'history', label: 'History', icon: CalendarDays },
  { route: 'stats', label: 'Stats', icon: BarChart3 },
  { route: 'compete', label: 'Compete', icon: Trophy },
  { route: 'metrics', label: 'Metrics', icon: ListChecks },
  { route: 'profile', label: 'Profile', icon: CircleUserRound },
];
const SIDE_TABS: Tab[] = [...TABS, { route: 'settings', label: 'Settings', icon: SettingsIcon }];

/** Cards waiting to be collected, as a count on the Profile tab. */
function useWaitingCount(r: Route): number {
  const { waiting } = useAchievements();
  return r === 'profile' ? waiting.length : 0;
}

/** The number is drawn by CSS (data-count), so the tab's text stays just its label. */
function Badge({ n, max = 9, className }: { n: number; max?: number; className: string }) {
  if (!n) return null;
  return <span aria-hidden data-testid="profile-badge" data-count={n > max ? `${max}+` : String(n)} className={cx('count-badge', className)} />;
}

const tabLabel = (label: string, n: number) => (n ? `${label}, ${n} ${n === 1 ? 'achievement' : 'achievements'} to collect` : undefined);

function TabLink({ tab: { route: r, label, icon: Icon }, route }: { tab: Tab; route: Route }) {
  const n = useWaitingCount(r);
  return (
    <a
      href={`#/${r}`}
      aria-current={route === r ? 'page' : undefined}
      aria-label={tabLabel(label, n)}
      className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', route === r ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
    >
      <span className="relative">
        <Icon key={route === r ? 'on' : 'off'} size={21} strokeWidth={route === r ? 2.2 : 1.8} className={route === r ? 'hop' : undefined} />
        <Badge n={n} className="absolute -top-1.5 left-1/2 ml-1.5" />
      </span>
      {label}
    </a>
  );
}

export function TabBar({ route }: { route: Route }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-s1 md:hidden">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => (
          <li key={t.route} className="flex-1">
            <TabLink tab={t} route={route} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SideLink({ tab: { route: r, label, icon: Icon }, route }: { tab: Tab; route: Route }) {
  const n = useWaitingCount(r);
  return (
    <a
      href={`#/${r}`}
      aria-current={route === r ? 'page' : undefined}
      aria-label={tabLabel(label, n)}
      className={cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium', route === r ? 'bg-s2 text-ink' : 'text-ink-2 hover:bg-s2 hover:text-ink')}
    >
      <Icon size={18} />
      {label}
      <Badge n={n} max={99} className="ml-auto" />
    </a>
  );
}

export function SideNav({ route }: { route: Route }) {
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-line bg-s1 px-3 py-5 md:flex">
      <div className="mb-6 flex items-center justify-between px-3">
        <span className="text-[15px] font-semibold">Logbook</span>
        <SyncDot />
      </div>
      <ul className="flex flex-col gap-0.5">
        {SIDE_TABS.map((t) => (
          <li key={t.route}>
            <SideLink tab={t} route={route} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Update prompt: never auto-reload, and never while a timer runs. ───────

const QUIET_MS = 10_000;
// Last tap or key press; 0 until there is one, so a fresh launch counts as quiet.
let lastTouch = 0;
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { lastTouch = Date.now(); }, { capture: true, passive: true });
}

/** A reload would cost nothing: no sheet, review or tour open, nothing being typed, no tap for a few seconds. */
function quietForUpdate(): boolean {
  const el = document.activeElement;
  const typing = !!el && el.matches('input, textarea, select, [contenteditable]');
  return !typing && !document.querySelector('dialog[open], [aria-modal="true"]') && Date.now() - lastTouch > QUIET_MS;
}

/**
 * A new version installs itself: it is looked for hourly and every time the app comes back to the
 * front, and applied (the page reloads) at the first quiet moment, never with a timer running or
 * first-run setup half done. The "Update available" banner only shows if that hasn't happened for
 * a minute, so it is a fallback, not the way updates arrive.
 */
export function UpdatePrompt() {
  // The Android app has no service worker: its updates come through NativeUpdatePrompt.
  return isNative ? <NativeUpdatePrompt /> : <WebUpdatePrompt />;
}

function WebUpdatePrompt() {
  const { timer, settings } = useData();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const look = () => reg.update().catch(() => {});
      setInterval(look, 60 * 60 * 1000);
      // An installed phone app stays alive in the background: look again whenever it comes back.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
    },
  });
  const [stuck, setStuck] = useState(false);
  const applied = useRef(false);
  const busy = !!timer || settings?.onboardedAt === null;

  useEffect(() => {
    if (!needRefresh) {
      setStuck(false);
      return;
    }
    const apply = () => {
      if (applied.current || busy || !quietForUpdate()) return;
      applied.current = true;
      updateServiceWorker(true);
    };
    apply();
    const tick = window.setInterval(apply, 3000);
    const late = window.setTimeout(() => setStuck(true), 60_000);
    document.addEventListener('visibilitychange', apply);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(late);
      document.removeEventListener('visibilitychange', apply);
    };
  }, [needRefresh, busy, updateServiceWorker]);

  if (!needRefresh || !stuck || timer) return null;
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+8px)] z-40 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-s3 py-1.5 pr-1.5 pl-4 text-[14px] shadow-lg">
        <span>Update available</span>
        <Button className="min-h-9 px-3" variant="primary" onClick={() => updateServiceWorker(true)}>Reload</Button>
        <IconButton label="Later" className="size-9" onClick={() => setNeedRefresh(false)}>×</IconButton>
      </div>
    </div>
  );
}

/**
 * The Android app's web code ships inside the APK; newer versions come from the live site the same
 * way and at the same quiet moments as the PWA's (BundleUpdater.java downloads and checks them, then
 * the app reloads into the new one). A newer APK is offered here (state/apkUpdate.ts): Update on
 * android-1.2 and later, a download link before that. Later hides it until the next version; it's
 * still in Settings. A web version that needs a newer APK (NATIVE_API) offers it the same way.
 */
function NativeUpdatePrompt() {
  const { timer, settings } = useData();
  const apk = useApkUpdate();
  const [ready, setReady] = useState<string | null>(null);
  const [needsApk, setNeedsApk] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedApk, setDismissedApk] = useState(() => local.get('pt.apkDismissed') ?? '');
  const applied = useRef(false);
  const busy = !!timer || settings?.onboardedAt === null;

  useEffect(() => {
    let looking = false;
    const look = async () => {
      void lookForApk();
      if (looking) return;
      looking = true;
      try {
        const current = await fetch('/app-bundle.json', { cache: 'no-store' })
          .then((r) => (r.ok ? (r.json() as Promise<{ version?: string }>) : null))
          .catch(() => null);
        const res = await quietly(LockTimer.prepareUpdate({ base: LIVE_SITE, current: current?.version ?? '' }));
        if (res?.status === 'ready' && res.version) setReady(res.version);
        if (res?.status === 'needs-apk') setNeedsApk(true);
      } finally {
        looking = false;
      }
    };
    void look();
    const id = window.setInterval(look, 60 * 60 * 1000);
    const off = onNativeResume(look);
    return () => {
      window.clearInterval(id);
      off();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      if (applied.current || busy || !quietForUpdate()) return;
      applied.current = true;
      void quietly(LockTimer.applyUpdate({ version: ready }));
    };
    apply();
    const tick = window.setInterval(apply, 3000);
    document.addEventListener('visibilitychange', apply);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', apply);
    };
  }, [ready, busy]);

  const offer = apk.latest !== null && apk.latest.version !== dismissedApk;
  if (timer || dismissed || !(needsApk || offer)) return null;
  const later = () => {
    setDismissed(true);
    if (!apk.latest) return;
    local.set('pt.apkDismissed', apk.latest.version);
    setDismissedApk(apk.latest.version);
  };
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+8px)] z-40 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-s3 py-1.5 pr-1.5 pl-4 text-[14px] shadow-lg" aria-live="polite">
        <span>{apkPhaseText(apk) || (apk.latest ? `Android app ${apk.latest.version} is available` : 'New Android app available')}</span>
        {apk.latest
          ? <ApkUpdateButton compact />
          : <a href={APK_PAGE} className="press inline-flex min-h-9 items-center rounded-lg bg-ink px-3 text-[15px] font-medium text-bg">Get it</a>}
        <IconButton label="Later" className="size-9" onClick={later}>×</IconButton>
      </div>
    </div>
  );
}

// ── Install: one-time first-run explanation (storage durability, §11). ────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function InstallCard() {
  // The Android app is installed by definition.
  const [hidden, setHidden] = useState(() => isNative || isStandalone() || local.get('pt.installSeen') === '1');
  const [canPrompt, setCanPrompt] = useState(() => deferredPrompt !== null);
  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (hidden) return null;

  const dismiss = () => {
    local.set('pt.installSeen', '1');
    setHidden(true);
  };
  const ios = isIos();

  return (
    <section aria-labelledby="install-h" className="mb-4 rounded-xl border border-line bg-s1 p-4">
      <h2 id="install-h" className="text-[15px] font-semibold">Install this to your home screen</h2>
      <p className="mt-1 text-[14px] text-ink-2">
        Installed, it opens like an app, works offline, and your data on this device is kept. A browser bookmark can lose
        locally saved data after a week of not opening it.
      </p>
      {ios ? (
        <ol className="mt-3 flex flex-col gap-2 text-[14px] text-ink-2">
          <li className="flex items-center gap-2">
            <span className="text-ink-3">1.</span> In Safari, tap Share
            <svg aria-hidden width="18" height="22" viewBox="0 0 18 22" className="text-ink">
              <path d="M9 1v13M5 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 9H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-ink-3">2.</span> Choose <span className="rounded-md bg-s2 px-2 py-0.5 text-ink">Add to Home Screen</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-ink-3">3.</span> Open Logbook from the home screen from now on
          </li>
        </ol>
      ) : canPrompt ? null : (
        <p className="mt-2 text-[14px] text-ink-2">Use your browser menu: Install app, or Add to Home screen.</p>
      )}
      <div className="mt-3 flex gap-2">
        {!ios && canPrompt && (
          <Button
            variant="primary"
            onClick={async () => {
              const p = deferredPrompt;
              if (!p) return;
              await p.prompt();
              await p.userChoice.catch(() => null);
              deferredPrompt = null;
              dismiss();
            }}
          >
            Install
          </Button>
        )}
        <Button variant={!ios && canPrompt ? 'ghost' : 'quiet'} onClick={dismiss}>Got it</Button>
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, ListChecks, Settings as SettingsIcon, Square, SunMedium } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useData, type SyncState } from '../state/DataContext';
import { useElapsed, useTimerActions } from '../state/TimerContext';
import { useHue } from '../state/theme';
import { formatClock } from '../lib/format';
import { formatTimeIn } from '../lib/dates';
import { isIos, isStandalone, local } from '../lib/device';
import { Button, IconButton, cx } from './ui';
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
  const hue = useHue(metric?.color ?? '#8590a3');
  if (!timer) return null;

  return (
    <div className="sticky top-0 z-30 safe-top bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="relative mx-auto flex max-w-2xl items-center gap-3 overflow-hidden border-b border-line px-4 py-2">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <span className="timer-sweep absolute inset-y-0 w-1/2" style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }} />
        </span>
        <span aria-hidden className="timer-dot size-2.5 shrink-0 rounded-full" style={{ background: hue }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{metric?.name ?? 'Timer'}</div>
          <div className="text-[12px] text-ink-3">since {formatTimeIn(timer.startedAt, tz)}</div>
        </div>
        <span className="text-[26px] font-medium leading-none tracking-tight" aria-live="off">
          {formatClock(Math.max(0, elapsed))}
        </span>
        {elapsed < 0 && <span className="sr-only">Clock difference detected</span>}
        <Button variant="primary" className="px-3" onClick={() => stop()} aria-label={`Stop ${metric?.name ?? 'timer'} and log it`}>
          <Square size={14} fill="currentColor" />
          Stop
        </Button>
      </div>
      {elapsed < 0 && (
        <p className="mx-auto max-w-2xl px-4 py-1 text-[12px] text-ink-3">
          This device’s clock is behind the one that started the timer.
        </p>
      )}
    </div>
  );
}

// ── Navigation ─────────────────────────────────────────────────────────────

const TABS: { route: Route; label: string; icon: typeof SunMedium }[] = [
  { route: 'today', label: 'Today', icon: SunMedium },
  { route: 'history', label: 'History', icon: CalendarDays },
  { route: 'stats', label: 'Stats', icon: BarChart3 },
  { route: 'metrics', label: 'Metrics', icon: ListChecks },
  { route: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function TabBar({ route }: { route: Route }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-s1 md:hidden">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ route: r, label, icon: Icon }) => (
          <li key={r} className="flex-1">
            <a
              href={`#/${r}`}
              aria-current={route === r ? 'page' : undefined}
              className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', route === r ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
            >
              <Icon size={21} strokeWidth={route === r ? 2.2 : 1.8} />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
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
        {TABS.map(({ route: r, label, icon: Icon }) => (
          <li key={r}>
            <a
              href={`#/${r}`}
              aria-current={route === r ? 'page' : undefined}
              className={cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium', route === r ? 'bg-s2 text-ink' : 'text-ink-2 hover:bg-s2 hover:text-ink')}
            >
              <Icon size={18} />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Update prompt: never auto-reload, and never while a timer runs. ───────

export function UpdatePrompt() {
  const { timer } = useData();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new shell hourly while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh || timer) return null;
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
  const [hidden, setHidden] = useState(() => isStandalone() || local.get('pt.installSeen') === '1');
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

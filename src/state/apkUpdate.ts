import { useSyncExternalStore } from 'react';
import { IN_APP_UPDATE_API, LockTimer, isNative, onNativeResume, quietly } from '../lib/native';
import { RELEASES_API, isNewer, parseRelease, type ApkRelease } from '../lib/apkUpdate';

/**
 * A newer Android app (APK) than the one installed: looked for on GitHub, offered in the banner
 * (NativeUpdatePrompt in Chrome.tsx) and in Settings → Lock-screen timer. APKs from android-1.2
 * download it and open Android's installer themselves (LockTimerPlugin.installUpdate); older ones
 * get a link that downloads it in the browser. Either way it installs over the old app, so data and
 * sign-in stay. Web updates don't come through here: they arrive by themselves (BundleUpdater).
 */
export interface ApkUpdate {
  /** The installed APK's version ("1.1"); empty until known. */
  installed: string;
  /** Whether this APK can update itself (else the link). */
  inApp: boolean;
  /** A newer APK, or null: none, or not known yet. */
  latest: ApkRelease | null;
  /** Whether GitHub has answered. */
  checked: boolean;
  /** downloading → installer (Android's installer is open) → back to idle if it's cancelled. */
  phase: 'idle' | 'downloading' | 'installer' | 'error';
  percent: number;
  message: string;
}

let state: ApkUpdate = { installed: '', inApp: false, latest: null, checked: false, phase: 'idle', percent: 0, message: '' };
const subscribers = new Set<() => void>();
function set(p: Partial<ApkUpdate>) {
  state = { ...state, ...p };
  subscribers.forEach((f) => f());
}
function subscribe(f: () => void) {
  subscribers.add(f);
  return () => subscribers.delete(f);
}

export function useApkUpdate(): ApkUpdate {
  return useSyncExternalStore(subscribe, () => state);
}

const LOOK_EVERY_MS = 15 * 60_000;
let lastLook = 0;
let looking = false;

/** Looks for a newer APK, at most every 15 minutes. Never throws; offline just means not yet. */
export async function lookForApk(): Promise<void> {
  if (!isNative || looking || Date.now() - lastLook < LOOK_EVERY_MS) return;
  looking = true;
  lastLook = Date.now();
  try {
    const info = await quietly(LockTimer.info());
    if (!info) return;
    set({ installed: info.versionName, inApp: info.api >= IN_APP_UPDATE_API });
    const release = await fetch(RELEASES_API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(parseRelease)
      .catch(() => null);
    if (release) set({ checked: true, latest: isNewer(release.version, info.versionName) ? release : null });
    else lastLook = 0;
  } finally {
    looking = false;
  }
}

let watchingResume = false;

/** Downloads the newer APK and opens Android's installer (inApp only). */
export async function installApk(): Promise<void> {
  const latest = state.latest;
  if (!latest || !state.inApp || state.phase === 'downloading') return;
  if (!watchingResume) {
    // Back in the app with the installer cancelled: offer it again. (An install restarts the app.)
    watchingResume = true;
    onNativeResume(() => {
      if (state.phase === 'installer') set({ phase: 'idle' });
    });
  }
  set({ phase: 'downloading', percent: 0, message: '' });
  const progress = LockTimer.addListener('download', (p) => set({ percent: p.percent }));
  const res = await quietly(LockTimer.installUpdate({ url: latest.url }));
  void progress.then((h) => h.remove()).catch(() => {});
  if (res?.status === 'installer') set({ phase: 'installer' });
  else if (res?.status === 'current') set({ phase: 'idle', latest: null });
  else set({ phase: 'error', message: res?.message || 'The download didn’t finish.' });
}

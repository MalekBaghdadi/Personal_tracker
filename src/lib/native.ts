import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { app } from './firebase';

/**
 * The Android app (android/, Capacitor) runs this same web app inside an APK. Its one extra is the
 * running timer as a notification whose Stop works on the lock screen without unlocking
 * (LockTimerPlugin.java). Everywhere else (browsers, the installed PWA, tests) `isNative` is false
 * and nothing here runs.
 */
export const isNative = Capacitor.isNativePlatform();

/**
 * What this web app needs from the APK's native side; LockTimerPlugin.NATIVE_API must be at least
 * this. Bump both together when the web app starts calling something new it can't do without: an
 * older APK then keeps its current web version and offers the new APK instead
 * (scripts/bundle-manifest.mjs). Something it can do without is checked instead, like
 * IN_APP_UPDATE_API, so older APKs keep getting web updates.
 */
export const NATIVE_API = 1;

/** APKs whose info().api is at least this (android-1.2 on) can update themselves (installUpdate). */
export const IN_APP_UPDATE_API = 2;

/** The live site: the Android app downloads web updates from it (BundleUpdater.java). */
export const LIVE_SITE = `https://${app.options.projectId}.web.app`;

/** Where the APK is published: the latest GitHub release (.github/workflows/android.yml). */
export const APK_URL = 'https://github.com/MalekBaghdadi/Personal_tracker/releases/latest/download/logbook.apk';
export const APK_PAGE = 'https://github.com/MalekBaghdadi/Personal_tracker/releases/latest';

/**
 * A timer stopped from the lock screen. `kind`: 'log' is logged as a timer entry (id = `id`),
 * 'held' ran over 12 hours and is asked about in the app first, 'none' logs nothing (under a
 * second, or the clock was behind). `synced` once state/timer is gone, written by the APK or by
 * the web app; `outcome` 'gone' means another device had already stopped it.
 */
export interface LockStop {
  id: string;
  uid: string;
  metricId: string;
  metricName: string;
  startedAt: string;
  startedAtMs: number;
  stoppedAt: string;
  localDate: string;
  seconds: number;
  kind: 'log' | 'held' | 'none';
  synced: boolean;
  outcome: 'saved' | 'gone' | null;
  problem: 'offline' | 'auth' | 'error' | null;
}

export type NotificationState = 'granted' | 'denied' | 'prompt';

export type UpdateStatus = { status: 'current' | 'ready' | 'needs-apk' | 'error'; version?: string; message?: string };

interface LockTimerPlugin {
  info(): Promise<{ api: number; versionName: string; versionCode: number; notifications: NotificationState }>;
  requestNotifications(): Promise<{ notifications: NotificationState }>;
  setSession(o: { uid: string; refreshToken: string; apiKey: string; projectId: string }): Promise<void>;
  clearSession(): Promise<void>;
  show(o: {
    uid: string;
    metricId: string;
    metricName: string;
    color: string;
    startedAt: string;
    startedAtMs: number;
    localDate: string;
    sinceText: string;
  }): Promise<{ shown: boolean; stopped?: boolean }>;
  clear(): Promise<void>;
  dismissNotice(): Promise<void>;
  getStops(): Promise<{ stops: LockStop[] }>;
  markStop(o: { id: string; outcome: 'saved' | 'gone' }): Promise<Partial<LockStop> & { changed: boolean }>;
  removeStop(o: { id: string }): Promise<void>;
  prepareUpdate(o: { base: string; current: string }): Promise<UpdateStatus>;
  applyUpdate(o: { version: string }): Promise<void>;
  /** IN_APP_UPDATE_API and later: downloads the APK at `url` and opens Android's installer. */
  installUpdate(o: { url: string }): Promise<{ status: 'installer' | 'current' | 'error'; message?: string }>;
  addListener(event: 'resume' | 'stops', fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'download', fn: (p: { percent: number }) => void): Promise<PluginListenerHandle>;
}

// Emulator builds only: e2e/android.mjs stands in for the APK with a fake of this plugin
// (window.CapacitorCustomPlatform makes Capacitor report a native platform).
const e2eFake = import.meta.env.VITE_USE_EMULATORS === '1'
  ? { web: () => (window as unknown as { __lockTimerFake: LockTimerPlugin }).__lockTimerFake }
  : {};

export const LockTimer = registerPlugin<LockTimerPlugin>('LockTimer', e2eFake);

/** Every native call is a convenience: a failure is logged and never reaches the UI. */
export function quietly<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((err) => {
    console.warn('[native]', err);
    return null;
  });
}

/** Runs `fn` when the app comes back to the front. */
export function onNativeResume(fn: () => void): () => void {
  if (!isNative) return () => {};
  const h = LockTimer.addListener('resume', fn);
  return () => void h.then((x) => x.remove()).catch(() => {});
}

/** Runs `fn` when the app comes back to the front or a lock-screen stop changes. */
export function onNativeWake(fn: () => void): () => void {
  if (!isNative) return () => {};
  const handles = [LockTimer.addListener('resume', fn), LockTimer.addListener('stops', fn)];
  return () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
}

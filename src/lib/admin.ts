import { collection, doc, getDoc, getDocs, query, setDoc, where, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { paths } from './repo';
import type { DayStats, Entry, Goal, Metric, Settings } from './types';

/**
 * Malek's account (malekbaghdadi07@gmail.com). It may read every user's data;
 * the same uid is in firestore.rules, which is what actually enforces it.
 * Read-only: the rules give no one write access to another user's data.
 */
export const ADMIN_UID = 'mRRUx09pGmNZcOlLoBH5KWF9lxh1';

const E2E_ADMIN_KEY = 'logbook:e2e-admin';

export function isAdmin(uid: string): boolean {
  if (uid === ADMIN_UID) return true;
  // Emulator builds only, so the browser tests can open the admin screens.
  if (import.meta.env.VITE_USE_EMULATORS === '1') {
    try {
      return localStorage.getItem(E2E_ADMIN_KEY) === '1';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * profiles/{uid}: written by each account about itself when the app opens, so
 * the admin can list users. Spark has no server to list Auth accounts.
 */
export interface Profile {
  uid: string;
  email: string;
  /** When the account was created (from Auth). */
  joinedAt: string;
  /** Last time the app was opened while signed in. */
  lastSeenAt: string;
}

export const profilesRef = collection(db, 'profiles');
export const profileRef = (uid: string) => doc(db, 'profiles', uid);

/** Like every write, never awaited. */
export function saveProfile(p: Profile): void {
  setDoc(profileRef(p.uid), p, { merge: true }).catch((err) => console.error('[profile] write failed', err));
}

export interface Loaded<T> {
  data: T;
  /** Came from this device's cache, not the server (offline): may be incomplete. */
  fromCache: boolean;
}

export async function fetchProfiles(): Promise<Loaded<Profile[]>> {
  const snap = await getDocs(profilesRef);
  return { data: snap.docs.map((d) => d.data() as Profile), fromCache: snap.metadata.fromCache };
}

export interface UserData {
  profile: Profile | null;
  settings: Settings | null;
  metrics: Metric[];
  entries: Entry[];
  goals: Goal[];
}

/**
 * A single doc, or null. Offline, getDoc throws for a doc that isn't cached
 * instead of answering from the cache; treat that as missing and from cache.
 */
async function docOrNull<T>(ref: DocumentReference): Promise<{ value: T | null; fromCache: boolean }> {
  try {
    const snap = await getDoc(ref);
    return { value: snap.exists() ? (snap.data() as T) : null, fromCache: snap.metadata.fromCache };
  } catch (err) {
    if ((err as { code?: string }).code === 'unavailable') return { value: null, fromCache: true };
    throw err;
  }
}

export async function fetchUserData(uid: string): Promise<Loaded<UserData>> {
  const [profile, settings, metrics, entries, goals] = await Promise.all([
    docOrNull<Profile>(profileRef(uid)),
    docOrNull<Settings>(paths.settings(uid)),
    getDocs(paths.metrics(uid)),
    getDocs(query(paths.entries(uid), where('deletedAt', '==', null))),
    getDocs(paths.goals(uid)),
  ]);
  return {
    data: {
      profile: profile.value,
      settings: settings.value,
      metrics: metrics.docs.map((d) => d.data() as Metric).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
      entries: entries.docs.map((d) => d.data() as Entry),
      goals: goals.docs.map((d) => d.data() as Goal),
    },
    fromCache: profile.fromCache || settings.fromCache || [metrics, entries, goals].some((s) => s.metadata.fromCache),
  };
}

/** metricId → localDate → aggregate. The same figures DataContext derives for the signed-in user. */
export function buildDayStats(entries: Entry[]): Map<string, DayStats> {
  const out = new Map<string, DayStats>();
  for (const e of entries) {
    let m = out.get(e.metricId);
    if (!m) out.set(e.metricId, (m = new Map()));
    const s = m.get(e.localDate);
    if (s) {
      s.total += e.value;
      s.count += 1;
    } else m.set(e.localDate, { total: e.value, count: 1 });
  }
  return out;
}

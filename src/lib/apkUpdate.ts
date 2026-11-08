/**
 * Which Android app is newest: the latest GitHub release, published by the Android APK workflow
 * (.github/workflows/android.yml) as tag `android-1.<run>` with `logbook.apk`, and versioned
 * `1.<run>` inside (versionName). See state/apkUpdate.ts for the looking and the installing.
 */

/** GitHub's API allows 60 unauthenticated looks an hour per IP address, and answers CORS. */
export const RELEASES_API = 'https://api.github.com/repos/MalekBaghdadi/Personal_tracker/releases/latest';

export interface ApkRelease {
  /** "1.2", as the APK's versionName says it. */
  version: string;
  /** The release's logbook.apk. */
  url: string;
}

/** [1, 2] from "android-1.2" or "1.2" (a "-preview" suffix is ignored); null for "dev" builds. */
export function versionParts(v: string): [number, number] | null {
  const m = /^(?:android-)?(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Whether `latest` is newer than the installed APK. A local "dev" build is never offered one. */
export function isNewer(latest: string, installed: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(installed);
  if (!a || !b) return false;
  return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
}

/** The release in GitHub's answer, or null when it isn't an Android release with logbook.apk. */
export function parseRelease(json: unknown): ApkRelease | null {
  if (!json || typeof json !== 'object') return null;
  const { tag_name: tag, assets } = json as { tag_name?: unknown; assets?: unknown };
  if (typeof tag !== 'string' || !tag.startsWith('android-') || !versionParts(tag) || !Array.isArray(assets)) return null;
  const apk = assets.find((a): a is { browser_download_url: string } =>
    !!a && typeof a === 'object' && (a as { name?: unknown }).name === 'logbook.apk'
    && typeof (a as { browser_download_url?: unknown }).browser_download_url === 'string'
    && (a as { browser_download_url: string }).browser_download_url.startsWith('https://'));
  return apk ? { version: tag.slice('android-'.length), url: apk.browser_download_url } : null;
}

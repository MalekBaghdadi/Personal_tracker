import { useEffect } from 'react';
import { APK_URL } from '../lib/native';
import { installApk, lookForApk, useApkUpdate, type ApkUpdate } from '../state/apkUpdate';
import { Button, cx } from './ui';

/** What's happening with an update, in a few words, or '' when nothing is. */
export function apkPhaseText(apk: ApkUpdate): string {
  if (apk.phase === 'downloading') return `Downloading… ${apk.percent}%`;
  if (apk.phase === 'installer') return 'Tap Update in Android’s installer.';
  if (apk.phase === 'error') return `${apk.message} Try again.`;
  return '';
}

/**
 * Updates the Android app: from inside it on android-1.2 and later (Android's installer opens),
 * or a link that downloads the APK in the browser on older ones.
 */
export function ApkUpdateButton({ compact = false }: { compact?: boolean }) {
  const apk = useApkUpdate();
  if (!apk.latest) return null;
  const size = compact ? 'min-h-9 px-3' : 'mt-3';
  if (!apk.inApp) {
    return (
      <a href={apk.latest.url || APK_URL} className={cx('press inline-flex items-center justify-center rounded-lg bg-ink text-[15px] font-medium text-bg', compact ? size : 'mt-3 min-h-11 px-4')}>
        {compact ? 'Get it' : `Download ${apk.latest.version}`}
      </a>
    );
  }
  const busy = apk.phase === 'downloading';
  return (
    <Button variant="primary" className={size} disabled={busy} aria-label={`Update the Android app to ${apk.latest.version}`} onClick={() => void installApk()}>
      {busy ? `${apk.percent}%` : compact ? 'Update' : 'Update app'}
    </Button>
  );
}

/** Settings → Lock-screen timer: the app's version, and the update when there is one. */
export function ApkVersion() {
  const apk = useApkUpdate();
  useEffect(() => void lookForApk(), []);
  if (!apk.installed) return null;
  const { latest } = apk;
  const phase = apkPhaseText(apk);
  return (
    <div className="mt-1.5">
      <p className="text-[13px] text-ink-3">
        Android app version {apk.installed}
        {latest ? `. Version ${latest.version} is available.` : apk.checked ? ', the latest.' : '.'}
      </p>
      {latest && (
        <>
          <ApkUpdateButton />
          <p className="mt-1.5 text-[13px] text-ink-3" aria-live="polite">
            {phase || (apk.inApp
              ? 'Android asks you to confirm, and the first time to allow Logbook to install apps. Your data and sign-in stay.'
              : 'Open logbook.apk once it’s downloaded and tap Update. Your data and sign-in stay.')}
          </p>
        </>
      )}
    </div>
  );
}

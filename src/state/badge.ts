import { useEffect, useState } from 'react';
import { itemsOn, useData } from './DataContext';
import { local } from '../lib/device';

/**
 * The open reminders for today as a number on the installed app's icon.
 * Per device and opt-in: iOS shows badges only once notification permission
 * is granted, though the app still never sends a notification. The badge is
 * set while the app is open; with no server, it can't change while closed.
 */

const KEY = 'pt.badge';
const EVENT = 'pt:badge';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};
const nav = () => navigator as BadgeNavigator;

export function badgeSupported(): boolean {
  return typeof nav().setAppBadge === 'function';
}

export function useBadgeSetting(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => local.get(KEY) === '1');
  useEffect(() => {
    const sync = () => setOn(local.get(KEY) === '1');
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const set = (v: boolean) => {
    local.set(KEY, v ? '1' : null);
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, set];
}

/** Keeps the icon badge in step with today's open reminders. Mounted once in the shell. */
export function useAppBadge(): void {
  const data = useData();
  const [on] = useBadgeSetting();
  const open = itemsOn(data, data.today).filter((it) => it.kind === 'reminder' && !it.doneAt).length;
  useEffect(() => {
    if (!badgeSupported()) return;
    const n = nav();
    const p = on && open > 0 ? n.setAppBadge!(open) : n.clearAppBadge?.();
    p?.catch(() => { /* not installed, or permission missing: nothing to show */ });
  }, [on, open]);
}

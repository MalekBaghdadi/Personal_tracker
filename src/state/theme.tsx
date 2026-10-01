import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { local } from '../lib/device';
import { hueFor } from '../lib/palette';
import type { Settings } from '../lib/types';

type Resolved = 'dark' | 'light';
const Ctx = createContext<Resolved>('dark');

export function useTheme(): Resolved {
  return useContext(Ctx);
}

/** The metric's hue for the current theme. */
export function useHue(color: string): string {
  return hueFor(color, useTheme());
}

export function ThemeProvider({ pref, children }: { pref: Settings['theme'] | undefined; children: ReactNode }) {
  const choice = pref ?? (local.get('pt.theme') as Settings['theme'] | null) ?? 'dark';
  const [systemLight, setSystemLight] = useState(() => matchMedia('(prefers-color-scheme: light)').matches);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => setSystemLight(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved: Resolved = choice === 'system' ? (systemLight ? 'light' : 'dark') : choice;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0e1420' : '#f6f4ef');
    local.set('pt.theme', choice);
  }, [resolved, choice]);

  return <Ctx.Provider value={resolved}>{children}</Ctx.Provider>;
}

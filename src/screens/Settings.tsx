import { useEffect, useMemo, useState } from 'react';
import { Download, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useData } from '../state/DataContext';
import { saveSettings } from '../lib/repo';
import { deviceTimezone } from '../lib/dates';
import { exportCsv, exportJson } from '../lib/export';
import { formatNumber } from '../lib/format';
import { Button, Label, Segmented, inputClass } from '../components/ui';
import type { Settings as SettingsT } from '../lib/types';

function allTimezones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function Settings() {
  const { uid, user, settings, tz, metrics, entries, items, timer } = useData();
  const zones = useMemo(() => allTimezones(tz), [tz]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const set = (patch: Partial<SettingsT>) => saveSettings(uid, patch);
  const device = deviceTimezone();

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-5 text-[22px] font-semibold tracking-tight">Settings</h1>

      <div className="flex flex-col gap-6">
        <section>
          <Label htmlFor="tz">Timezone</Label>
          <select id="tz" className={inputClass} value={tz} onChange={(e) => set({ timezone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Days are counted in this zone on every device, so travelling doesn’t shift your streaks.
            {device !== tz && <> This device is set to {device.replace(/_/g, ' ')}.</>}
          </p>
        </section>

        <section>
          <Label>Week starts on</Label>
          <Segmented
            label="Week starts on"
            value={settings?.weekStartsOn ?? 1}
            onChange={(v) => set({ weekStartsOn: v })}
            options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]}
          />
        </section>

        <section>
          <Label>Theme</Label>
          <Segmented
            label="Theme"
            value={settings?.theme ?? 'dark'}
            onChange={(v) => set({ theme: v })}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]}
          />
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="text-[15px] font-medium">Export your data</h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {formatNumber(entries.length)} entries across {metrics.length} metrics, archived ones included, plus {formatNumber(items.length)} events and reminders. Durations are in seconds.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => exportJson(metrics, entries, items, settings)}><Download size={17} /> JSON</Button>
            <Button onClick={() => exportCsv(metrics, entries, items)}><Download size={17} /> CSV</Button>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="text-[15px] font-medium">Account</h2>
          <p className="mt-1 text-[13px] text-ink-3">Signed in as {user.email}</p>
          {persisted === false && (
            <p className="mt-1 text-[13px] text-ink-3">This browser may clear offline data if storage runs low. Installing to the home screen helps.</p>
          )}
          {confirmSignOut ? (
            <div className="mt-3 rounded-lg bg-s1 p-3">
              <p className="text-[14px] text-ink-2">
                {timer ? 'A timer is running. It keeps running on your other devices. ' : ''}
                Changes not yet synced wait on this device until you sign in here again, which needs a connection.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="danger" onClick={() => signOut(auth)}>Sign out</Button>
                <Button onClick={() => setConfirmSignOut(false)}>Stay signed in</Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" variant="ghost" onClick={() => setConfirmSignOut(true)}><LogOut size={17} /> Sign out</Button>
          )}
        </section>

        <p className="text-[12px] text-ink-3">Days roll over at midnight in your timezone.</p>
      </div>
    </div>
  );
}

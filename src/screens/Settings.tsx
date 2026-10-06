import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, LogOut, PlayCircle, Upload, Users } from 'lucide-react';
import { TOURS } from '../lib/tours';
import { isAdmin } from '../lib/admin';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useData } from '../state/DataContext';
import { applyImport, fetchExisting, replayTour, saveSettings } from '../lib/repo';
import { NOT_AN_EXPORT, importIsEmpty, isExport, planImport, type ImportPlan } from '../lib/importer';
import { deviceTimezone, nowIso } from '../lib/dates';
import { exportCsv, exportJson } from '../lib/export';
import { formatNumber } from '../lib/format';
import { Button, Label, Segmented, Sheet, Switch, inputClass, useToast } from '../components/ui';
import { badgeSupported, useBadgeSetting } from '../state/badge';
import { isIos, isStandalone } from '../lib/device';
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
  const { uid, user, settings, tz, dayStart, metrics, entries, items, goals, timer } = useData();
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

        <section data-tour="settings-daystart">
          <Label htmlFor="day-start">Day starts at</Label>
          <select id="day-start" className={inputClass} value={dayStart} onChange={(e) => set({ dayStartHour: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? 'Midnight' : `${h}:00 am`}</option>)}
          </select>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Anything you log before this time counts for the previous day, so a late night doesn’t break your streak or start tomorrow early.
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

        <BadgeSection />

        <section className="border-t border-line pt-5" data-tour="settings-export">
          <h2 className="text-[15px] font-medium">Export your data</h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {plural(entries.length, 'entry', 'entries')} across {plural(metrics.length, 'metric')}, archived ones included, plus {plural(items.length, 'event or reminder', 'events and reminders')} and {plural(goals.length, 'goal')}. Durations are in seconds.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => exportJson(metrics, entries, items, goals, settings)}><Download size={17} /> JSON</Button>
            <Button onClick={() => exportCsv(metrics, entries, items, goals)}><Download size={17} /> CSV</Button>
          </div>
        </section>

        <ImportSection />

        <section className="border-t border-line pt-5" data-tour="settings-tours">
          <h2 className="text-[15px] font-medium">Tutorials</h2>
          <p className="mt-1 text-[13px] text-ink-3">Each tab has a short tour that shows the first time you open it. Replay one here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOURS.map((t) => (
              <Button
                key={t.id}
                onClick={() => {
                  replayTour(uid, t.id);
                  window.location.hash = `#/${t.id}`;
                }}
              >
                <PlayCircle size={17} aria-hidden /> {t.name}
              </Button>
            ))}
          </div>
        </section>

        {isAdmin(uid) && (
          <section className="border-t border-line pt-5">
            <h2 className="text-[15px] font-medium">Admin</h2>
            <p className="mt-1 text-[13px] text-ink-3">Only you see this. View every user’s metrics, streaks and goals; read-only.</p>
            <a href="#/admin" className="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-s2 px-4 text-[15px] font-medium hover:bg-s3">
              <Users size={17} aria-hidden /> Users
            </a>
          </section>
        )}

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

        <p className="text-[12px] text-ink-3">Days roll over at {dayStart === 0 ? 'midnight' : `${dayStart}:00 am`} in your timezone.</p>
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Restore a JSON export. Add-only; see lib/importer.ts. */
function ImportSection() {
  const { uid } = useData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        return setError('That file isn’t valid JSON. Pick a Logbook JSON export.');
      }
      if (!isExport(data)) return setError(NOT_AN_EXPORT);
      let existing;
      try {
        // A flaky connection can leave the server read hanging; give up after 15s.
        existing = await Promise.race([
          fetchExisting(uid),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
        ]);
      } catch {
        return setError('Importing needs a connection, so it can check what’s already here and never bring back anything you deleted. Try again when you’re online.');
      }
      const r = planImport(data, existing, nowIso());
      if (!r.ok) return setError(r.error);
      if (importIsEmpty(r.plan)) return setError('Everything in this backup is already here. Nothing to add.');
      setPlan(r.plan);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const adds = plan
    ? [
        plan.metrics.length && plural(plan.metrics.length, 'metric'),
        plan.entries.length && plural(plan.entries.length, 'entry', 'entries'),
        plan.items.length && plural(plan.items.length, 'event or reminder', 'events and reminders'),
        plan.goals.length && plural(plan.goals.length, 'goal'),
      ].filter(Boolean).join(', ')
    : '';
  const skipped = plan ? plan.skipped.entries + plan.skipped.items + plan.skipped.goals + plan.skipped.metrics : 0;

  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-[15px] font-medium">Restore from a backup</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        Pick a JSON export. Only what’s missing is added; nothing here is changed or replaced. Metrics with the same name are merged.
      </p>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label="Backup file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button className="mt-3 w-full" onClick={() => input.current?.click()} disabled={busy}>
        <Upload size={17} /> {busy ? 'Reading…' : 'Import JSON'}
      </Button>
      {error && <p role="alert" className="mt-2 text-[13px] text-ink-2">{error}</p>}

      <Sheet open={plan !== null} onClose={() => setPlan(null)} title="Import this backup?">
        {plan && (
          <>
            <p className="text-[15px]">Adds {adds}.</p>
            <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-3">
              {plan.mergedMetrics > 0 && <li>{plural(plan.mergedMetrics, 'metric')} matched one already here by name; their entries go into it.</li>}
              {skipped > 0 && <li>{formatNumber(skipped)} already here (or deleted) and skipped.</li>}
              {plan.archivedGoals > 0 && <li>{plural(plan.archivedGoals, 'goal')} imported as archived, because the metric already has an active goal.</li>}
              {plan.invalid > 0 && <li>{formatNumber(plan.invalid)} unreadable or orphaned rows left out.</li>}
              <li>Settings aren’t imported.</li>
            </ul>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  applyImport(uid, plan);
                  setPlan(null);
                  toast(`Imported ${adds}`);
                }}
              >
                Import
              </Button>
              <Button onClick={() => setPlan(null)}>Cancel</Button>
            </div>
          </>
        )}
      </Sheet>
    </section>
  );
}

/** Per device: today's open reminders as a number on the app icon. */
function BadgeSection() {
  const [on, setOn] = useBadgeSetting();
  const [note, setNote] = useState<string | null>(null);
  const supported = badgeSupported();
  const iosBrowser = isIos() && !isStandalone();

  const toggle = async (v: boolean) => {
    setNote(null);
    if (!v) return setOn(false);
    // iOS draws badges only with notification permission. Nothing is ever sent.
    if (isIos() && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
      if (p !== 'granted') {
        setNote('iPhone only shows icon badges with notification permission. Allow it in Settings → Notifications → Logbook, then try again.');
        return;
      }
    }
    setOn(true);
  };

  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-[15px] font-medium">App icon</h2>
      {supported && !iosBrowser ? (
        <>
          <Switch checked={on} onChange={toggle} label="Show today’s open reminders on the icon" />
          <p className="text-[13px] text-ink-3">
            On this device only. It updates while the app is open.
            {isIos() ? ' iPhone asks for notification permission to show the number; Logbook never sends notifications.' : ''}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-ink-3">
          {iosBrowser
            ? 'Install Logbook to your home screen first; then you can show today’s open reminders on its icon.'
            : 'This browser can’t put a number on the app icon. Installed Logbook on iPhone or a desktop browser can.'}
        </p>
      )}
      {note && <p role="alert" className="mt-2 text-[13px] text-ink-2">{note}</p>}
    </section>
  );
}

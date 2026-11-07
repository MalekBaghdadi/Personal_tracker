// The web app's Android side (src/lib/native.ts, TimerContext), with a fake of the APK's
// LockTimer plugin standing in for Android: Capacitor reports a native platform when
// window.CapacitorCustomPlatform is set, and emulator builds use window.__lockTimerFake.
// The native half (LogbookRest.java) has its own test: npm run test:native.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' }); break; } catch { await wait(1000); }
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach/.test(m.text())) errors.push(m.text()); });

await page.evaluateOnNewDocument(() => {
  window.CapacitorCustomPlatform = { name: 'android', plugins: {} };
  const calls = [];
  let listeners = { resume: [], stops: [] };
  const state = { shown: null, stops: [], notifications: 'prompt', bundle: { status: 'current' } };
  const rec = (name, arg) => calls.push({ name, arg: arg === undefined ? null : JSON.parse(JSON.stringify(arg)) });
  window.__fake = { calls, state, fire: (ev) => listeners[ev].forEach((f) => f({})) };
  window.__lockTimerFake = {
    info: async () => ({ api: 1, versionName: '1.test', versionCode: 1, notifications: state.notifications }),
    requestNotifications: async () => {
      rec('requestNotifications');
      state.notifications = 'granted';
      return { notifications: 'granted' };
    },
    setSession: async (o) => rec('setSession', { uid: o.uid, hasToken: !!o.refreshToken, apiKey: o.apiKey, projectId: o.projectId }),
    clearSession: async () => rec('clearSession'),
    show: async (o) => {
      rec('show', o);
      // As APKs up to android-1.1 read startedAtMs (getDouble): a whole number past the int range
      // arrives as a Long and is refused, and no notification shows.
      if (Number.isInteger(o.startedAtMs) && Math.abs(o.startedAtMs) > 2 ** 31 - 1) throw new Error('startedAtMs is required');
      // As LockTimerPlugin.show(): never for a timer already stopped from the lock screen.
      if (state.stops.some((s) => s.startedAt === o.startedAt)) return { shown: false, stopped: true };
      state.shown = { ...o, startedAtMs: Math.trunc(o.startedAtMs) };
      return { shown: true };
    },
    clear: async () => {
      rec('clear');
      state.shown = null;
    },
    dismissNotice: async () => rec('dismissNotice'),
    getStops: async () => ({ stops: JSON.parse(JSON.stringify(state.stops)) }),
    markStop: async (o) => {
      rec('markStop', o);
      const s = state.stops.find((x) => x.id === o.id);
      if (!s) return { changed: false };
      const changed = !s.synced;
      if (changed) Object.assign(s, { synced: true, outcome: o.outcome, problem: null });
      return { ...s, changed };
    },
    removeStop: async (o) => {
      rec('removeStop', o);
      state.stops = state.stops.filter((x) => x.id !== o.id);
    },
    prepareUpdate: async (o) => {
      rec('prepareUpdate', o);
      return state.bundle;
    },
    applyUpdate: async (o) => rec('applyUpdate', o),
    addListener: async (ev, fn) => {
      listeners[ev].push(fn);
      return { remove: async () => { listeners = { ...listeners, [ev]: listeners[ev].filter((f) => f !== fn) }; } };
    },
  };
  // The notification's Stop, as StopReceiver records it, when the APK couldn't reach Firestore.
  window.__lockStop = (seconds, kind) => {
    const sh = state.shown;
    if (!sh) return false;
    state.stops.push({
      id: crypto.randomUUID(), uid: sh.uid, metricId: sh.metricId, metricName: sh.metricName, startedAt: sh.startedAt,
      startedAtMs: sh.startedAtMs, stoppedAt: new Date().toISOString(), localDate: sh.localDate, seconds, kind,
      synced: false, outcome: null, problem: 'offline',
    });
    state.shown = null;
    window.__fake.fire('stops');
    return true;
  };
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const toast = () => page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText.trim() || '(none)');
const calls = (name) => page.evaluate((n) => window.__fake.calls.filter((c) => c.name === n).map((c) => c.arg), name);
const log = (...a) => console.log('•', ...a);
const running = () => page.evaluate(() => !!document.querySelector('[aria-label="Stop Studying and log it"]'));

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);

  const session = (await calls('setSession')).pop();
  log('Session handed to the APK:', !!session?.uid && session.hasToken && session.projectId === 'demo-logbook');
  log('No install card in the app:', !(await text()).includes('Install this to your home screen'));
  const look = (await calls('prepareUpdate')).pop();
  log('Looks for a web update on the live site:', look?.base === 'https://demo-logbook.web.app');

  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');

  // Start: the notification shows the timer; notifications are asked for once.
  await click('::-p-aria(Start Studying timer)');
  await wait(1200);
  let shown = await page.evaluate(() => window.__fake.state.shown);
  log('Notification shows the timer:', shown?.metricName === 'Studying' && shown.uid === session.uid && shown.startedAtMs === Date.parse(shown.startedAt)
    && /^\d{4}-\d\d-\d\d$/.test(shown.localDate) && /^\d\d:\d\d$/.test(shown.sinceText), JSON.stringify(shown));
  log('Asks for notifications on the first start:', (await calls('requestNotifications')).length === 1);

  // Lock screen Stop while offline: the app finishes it, logs 25m and asks for a note.
  log('Lock-screen stop recorded:', await page.evaluate(() => window.__lockStop(25 * 60, 'log')));
  await wait(1500);
  const t = await toast();
  log('Toast says it came from the lock screen:', /Logged 25m to Studying from the lock screen/.test(t), JSON.stringify(t));
  log('…and asks what was accomplished:', t.includes('What did you accomplish?'));
  log('Timer stopped in the app:', !(await running()));
  log('Stop claimed before writing:', JSON.stringify(await calls('markStop')) === JSON.stringify([{ id: (await calls('removeStop'))[0]?.id, outcome: 'saved' }]));
  log('Stop record removed:', (await page.evaluate(() => window.__fake.state.stops.length)) === 0);
  log('Notice taken down:', (await calls('dismissNotice')).length > 0);
  await page.screenshot({ path: `${OUT}90-android-lock-stop.png` });
  await click('::-p-aria(Add a note to this session)');
  await page.keyboard.type('Read chapter 4');
  await page.keyboard.press('Enter');
  await wait(500);
  log('Studying shows 25m:', /Studying[\s\S]{0,40}25m/.test(await text()));

  // Over 12 hours: stopped on the lock screen, then the app asks for the real time.
  const before = (await calls('requestNotifications')).length;
  await click('::-p-aria(Start Studying timer)');
  await wait(1200);
  log('Not asked for notifications again:', (await calls('requestNotifications')).length === before);
  await page.evaluate(() => window.__lockStop(13 * 3600 + 5 * 60, 'held'));
  await wait(1500);
  const sheet = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
  log('Over 12 hours asks first:', sheet.includes('Studying timer was left running') && sheet.includes('ran 13h 5m before you stopped it from the lock screen'), JSON.stringify(sheet.slice(0, 160)));
  log('Nothing logged before answering:', /Studying[\s\S]{0,40}25m/.test(await text()));
  await page.screenshot({ path: `${OUT}91-android-held.png` });
  await page.type('dialog[open] input', '2');
  await click('dialog[open] ::-p-text(Log this duration)');
  await wait(800);
  log('Logged the real time:', /Logged 2h to Studying/.test(await toast()));
  log('Studying shows 2h 25m:', /Studying[\s\S]{0,40}2h 25m/.test(await text()));
  log('Held record removed once answered:', (await page.evaluate(() => window.__fake.state.stops.length)) === 0);

  // Stopping in the app takes the notification down.
  const clears = (await calls('clear')).length;
  await click('::-p-aria(Start Studying timer)');
  await wait(1200);
  await click('::-p-aria(Stop Studying and log it)');
  await wait(800);
  log('Stopping in the app clears the notification:', (await calls('clear')).length > clears);

  // A new web version is switched to at a quiet moment, never with a timer running.
  await page.evaluate(() => { window.__fake.state.bundle = { status: 'ready', version: 'v2' }; window.__fake.fire('resume'); });
  await wait(12_000);
  log('Applies a downloaded web update when quiet:', JSON.stringify(await calls('applyUpdate')) === JSON.stringify([{ version: 'v2' }]));

  // Settings: the lock-screen timer's state instead of the icon badge.
  await page.goto('http://localhost:5173/#/settings');
  await wait(1200);
  const settings = await text();
  log('Settings shows the lock-screen timer:', settings.includes('Lock-screen timer') && settings.includes('Android app version 1.test'));
  log('No icon badge setting:', !settings.includes('App icon'));
  await page.screenshot({ path: `${OUT}92-android-settings.png` });

  // Signing out takes the session back from the APK.
  await click('::-p-text(Sign out)');
  await click('button.text-danger::-p-text(Sign out)');
  await wait(1500);
  log('Sign-out clears the APK session:', (await calls('clearSession')).length > 0);
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-android-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

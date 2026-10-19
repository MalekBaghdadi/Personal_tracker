// Check-off metrics and range targets. A timed Gym with history switches to
// check off and keeps its streak; ticking and unticking on Today, the
// Yesterday sheet and History. Calories with a 1,800–2,200 kcal range:
// validation, "to go", "in range", "over", and Stats.
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

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n, fullPage = false) => page.screenshot({ path: `${OUT}${n}.png`, fullPage });
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The app's day starts at 5am.
const DAY_START_MS = 5 * 3600000;
const today = ymd(new Date(Date.now() - DAY_START_MS));
const yesterday = ymd(new Date(Date.now() - DAY_START_MS - 86400000));
const pressText = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.innerText.trim() === l);
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(400);
};
const row = (name) => page.evaluate((n) => [...document.querySelectorAll('li')].find((l) => l.querySelector('h2')?.textContent.includes(n))?.innerText ?? '', name);
const openMetric = async (name) => {
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await page.evaluate((n) => [...document.querySelectorAll('li button')].find((b) => b.innerText.includes(n))?.click(), name);
  await wait(500);
};
const dialogText = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  // ── Gym: timed, with yesterday logged, then switched to check off ──
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  log('New metric offers Check off:', await page.evaluate(() => [...document.querySelectorAll('[aria-label="Measured as"] [role=radio]')].map((b) => b.textContent).join(',') === 'Time,A number,Check off'));
  await page.type('#m-name', 'Gym');
  await page.type('#m-target-h', '1');
  await click('::-p-text(Create metric)');
  await wait(500);

  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Gym)');
  await page.type('#entry-m', '45');
  await setVal('#entry-date', yesterday);
  await click('dialog[open] button[type=submit]');
  await wait(400);

  await openMetric('Gym');
  let dlg = await dialogText();
  log('Timed metric with entries offers the switch:', dlg.includes('except for switching to check off') && dlg.includes('Switch to check off'));
  await pressText('Switch to check off', 'dialog[open]');
  dlg = await dialogText();
  log('Switch explains history is kept:', dlg.includes('Every day with anything logged counts as done'));
  log('No target, one-tap or timer fields for check off:', !dlg.includes('Daily target') && !dlg.includes('One-tap buttons') && !dlg.includes('start/stop timer'));
  await shot('cr-01-switch', true);
  await click('::-p-text(Save changes)');
  await wait(400);

  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  let gym = await row('Gym');
  log('Today: Gym is check off, not done yet:', gym.includes('Check off') && gym.includes('Not yet') && gym.includes('Mark done'));
  log('No chips, custom amount or timer on a check-off row:', !(await page.$('[aria-label="Add a custom amount to Gym"]')) && !(await page.$('[aria-label="Start Gym timer"]')));
  log('Yesterday’s 45m counts as done: 1 in a row:', gym.includes('1 in a row'));
  await shot('cr-02-today');

  await click('[data-tour=today-check]');
  gym = await row('Gym');
  log('Tap: done, streak 2:', gym.includes('Done') && gym.includes('2 in a row') && !gym.includes('Not yet'));
  log('Toast says done with Undo:', (await text()).includes('Gym done'));
  log('Button is pressed:', await page.$eval('[data-tour=today-check]', (b) => b.getAttribute('aria-pressed') === 'true'));
  await shot('cr-03-done');

  await wait(400); // past the double-tap guard
  await click('[data-tour=today-check]');
  gym = await row('Gym');
  log('Tap again: unchecked, streak back to 1:', gym.includes('Not yet') && gym.includes('1 in a row'));
  await pressText('Undo');
  gym = await row('Gym');
  log('Undo: done again:', gym.includes('Done') && gym.includes('2 in a row'));

  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  log('Done survives a reload:', (await row('Gym')).includes('2 in a row'));

  // Yesterday sheet: Gym shows as done, with the same button.
  await click('::-p-aria(Add to yesterday)');
  dlg = await dialogText();
  log('Yesterday sheet: Gym done, no amounts:', dlg.includes('Gym') && dlg.includes('Done') && !(await page.$('dialog[open] [aria-label="Add a custom amount to Gym yesterday"]')));
  await shot('cr-04-yesterday');
  await page.keyboard.press('Escape');
  await wait(400);

  // History: the day sheet reads "Done", and there's nothing more to add.
  await page.goto('http://localhost:5173/#/history');
  await wait(500);
  await click('[role=radio]::-p-text(Gym)');
  if (yesterday.slice(0, 7) !== today.slice(0, 7)) await click('::-p-aria(Previous month)');
  await page.evaluate((d) => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').startsWith(new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')))?.click(), yesterday);
  await wait(500);
  dlg = await dialogText();
  log('History day sheet: old 45m session reads Done:', dlg.includes('Done') && !dlg.includes('45m'));
  log('No add button on a done day:', !dlg.includes('Add an entry') && !dlg.includes('Mark done on this day'));
  await shot('cr-05-history');
  await page.keyboard.press('Escape');
  await wait(300);

  // ── Calories with a range ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(400);
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Calories');
  await click('[role=radio]::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await click('[role=radio]::-p-text(Range)');
  await page.type('#m-min', '2200');
  await page.type('#m-target', '1800');
  await setVal('#m-quick', '500');
  await click('::-p-text(Create metric)');
  log('Upper end below lower end is refused:', (await dialogText()).includes('The upper end has to be more than the lower end'));
  await setVal('#m-min', '1800');
  await setVal('#m-target', '2200');
  await shot('cr-06-range-editor', true);
  await click('::-p-text(Create metric)');
  await wait(500);
  log('Metrics list shows the range:', (await text()).includes('1,800–2,200 kcal'));

  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  let cal = await row('Calories');
  log('Today: range label:', cal.includes('Range 1,800–2,200 kcal'));
  await click('::-p-aria(Add a custom amount to Calories)');
  await page.type('#entry-count', '1500');
  await click('dialog[open] button[type=submit]');
  await wait(400);
  cal = await row('Calories');
  log('1,500: 300 kcal to go:', cal.includes('300 kcal to go'));
  await click('::-p-aria(Add 500 kcal to Calories)');
  cal = await row('Calories');
  log('2,000: in range:', cal.includes('in range') && !cal.includes('to go'));
  await shot('cr-07-in-range');
  await wait(400);
  await click('::-p-aria(Add 500 kcal to Calories)');
  cal = await row('Calories');
  log('2,500: 300 kcal over:', cal.includes('300 kcal over') && !cal.includes('in range'));
  await shot('cr-08-over');

  // ── Stats ──
  await page.goto('http://localhost:5173/#/stats');
  await wait(800);
  const stats = await text();
  log('Stats: Calories legend says Range:', stats.includes('Range'));
  log('Stats: Gym shows days done, no chart:', await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === 'Gym');
    return !!sec && sec.innerText.includes('Days done') && !sec.querySelector('.recharts-wrapper');
  }));
  await shot('cr-09-stats', true);

  // ── A fresh check-off metric ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(400);
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Floss');
  await click('[role=radio]::-p-text(Check off)');
  log('Check off hint:', (await dialogText()).includes('Done or not done'));
  await click('::-p-text(Create metric)');
  await wait(500);
  log('Metrics list: Floss is check off:', (await text()).includes('check off'));
  await openMetric('Floss');
  log('Goal button hidden for check off:', !(await dialogText()).includes('deadline goal'));
  await page.keyboard.press('Escape');
  await wait(300);

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('cr-crash');
} finally {
  await browser.close();
}

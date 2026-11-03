import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

// Editing a time entry's start and end, not just its length: the three move together.
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
  const RealDate = Date;
  let skew = 0;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
  window.__advance = (ms) => { skew += ms; };
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const val = (sel) => page.$eval(sel, (el) => el.value);
const fields = async () => ({ start: await val('#entry-start'), end: await val('#entry-end'), h: await val('#entry-h'), m: await val('#entry-m') });
const log = (...a) => console.log('•', ...a);
const openRow = async (label) => {
  await page.evaluate((l) => [...document.querySelectorAll('dialog[open] li button')].find((b) => b.innerText.includes(l))?.click(), label);
  await wait(400);
};
const save = async () => { await click('dialog[open] button[type=submit]'); await wait(500); };

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');

  // A 90-minute timer session to edit.
  await click('::-p-aria(Start Studying timer)');
  await wait(800);
  await page.evaluate(() => window.__advance(90 * 60 * 1000));
  await wait(800);
  await click('::-p-aria(Stop Studying and log it)');
  await click('[aria-live=polite] ::-p-aria(Dismiss)');

  const today = await page.evaluate(() => {
    const d = new Date(Date.now() - 5 * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.goto(`http://localhost:5173/#/history/${today}`);
  await wait(1200);
  await openRow('1h 30m');
  let f = await fields();
  log('Sheet shows start, end and length:', !!f.start && !!f.end && f.h === '1' && f.m === '30', JSON.stringify(f));
  await page.screenshot({ path: `${OUT}83-entry-times-sheet.png` });

  // Start and end set: the length follows.
  await setVal('#entry-start', '09:00');
  await setVal('#entry-end', '11:30');
  f = await fields();
  log('09:00 to 11:30 makes 2h 30m:', f.h === '2' && f.m === '30', JSON.stringify(f));
  await save();
  const day = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
  log('History row shows 09:00 and 2h 30m:', /09:00[\s\S]*2h 30m/.test(day));

  // Reopen: stored as start + length.
  await openRow('2h 30m');
  f = await fields();
  log('Reopened with 09:00, 11:30, 2h 30m:', f.start === '09:00' && f.end === '11:30' && f.h === '2' && f.m === '30', JSON.stringify(f));

  // Length edited: the start stays, the end follows.
  await setVal('#entry-h', '1');
  await setVal('#entry-m', '0');
  f = await fields();
  log('1h from 09:00 ends 10:00:', f.start === '09:00' && f.end === '10:00', JSON.stringify(f));

  // Start edited: the end stays, the length follows.
  await setVal('#entry-start', '08:15');
  f = await fields();
  log('Start 08:15 with end 10:00 is 1h 45m:', f.end === '10:00' && f.h === '1' && f.m === '45', JSON.stringify(f));

  // Past midnight: 23:30 to 00:20 is 50 minutes.
  await setVal('#entry-start', '23:30');
  await setVal('#entry-end', '00:20');
  f = await fields();
  log('23:30 to 00:20 is 50m:', (f.h === '' || f.h === '0') && f.m === '50', JSON.stringify(f));
  await save();
  await openRow('50m');
  f = await fields();
  log('Saved past-midnight entry reopens as 23:30 to 00:20:', f.start === '23:30' && f.end === '00:20' && f.m === '50', JSON.stringify(f));
  const date = await val('#entry-date');
  log('It stays on the same tracking day:', date === today, date);
  await page.keyboard.press('Escape');
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-entry-times-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

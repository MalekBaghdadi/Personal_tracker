// The day rolls over at 5am: at 01:30 "today" is still the previous date.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' }); break; } catch { await wait(1000); }
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach/.test(m.text())) errors.push(m.text()); });

// Pin the clock to the most recent 01:30 local time (always in the past, so
// auth tokens stay valid).
const target = new Date();
target.setHours(1, 30, 0, 0);
if (target.getTime() > Date.now()) target.setDate(target.getDate() - 1);
const skew = target.getTime() - Date.now();
await page.evaluateOnNewDocument((s) => {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + s); }
    static now() { return RealDate.now() + s; }
  }
  window.Date = FakeDate;
}, skew);

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const calendarDay = ymd(target);
const prev = new Date(target);
prev.setDate(prev.getDate() - 1);
const trackingDay = ymd(prev);
const longName = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' });

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');
  log('Clock is 01:30:', await page.evaluate(() => new Date().getHours() === 1 && new Date().getMinutes() === 30));

  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');
  await wait(400);

  let header = await page.$eval('main h1', (h) => h.textContent);
  log('At 01:30 Today is still the previous day:', header.startsWith(longName(prev)), JSON.stringify(header));

  // A quick add and a timer session at 01:30 both land on the previous day.
  await click('::-p-aria(Add 15m to Studying)');
  await click('::-p-aria(Start Studying timer)');
  await wait(1500);
  await click('::-p-aria(Stop Studying and log it)');
  await page.goto(`http://localhost:5173/#/history/${trackingDay}`);
  await wait(1200);
  const sheet = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');
  log('Both entries are on the previous day in History:', /Quick add/.test(sheet) && /Timer/.test(sheet), JSON.stringify(sheet.slice(0, 120)));
  await page.keyboard.press('Escape');

  // Settings: shown at 5am; switching to midnight makes it the calendar date.
  await page.goto('http://localhost:5173/#/settings');
  await wait(800);
  log('Setting defaults to 5am:', await page.$eval('#day-start', (s) => s.value) === '5');
  log('Footer says 5:00 am:', (await text()).includes('Days roll over at 5:00 am'));
  await page.screenshot({ path: `${OUT}98-settings-day-start.png` });
  await page.select('#day-start', '0');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  header = await page.$eval('main h1', (h) => h.textContent);
  log('With midnight, Today is the calendar date:', header.startsWith(longName(target)), JSON.stringify(header));
  await page.goto('http://localhost:5173/#/settings');
  await wait(500);
  await page.select('#day-start', '5');
  log('Calendar day / tracking day:', calendarDay, trackingDay);
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-day-start-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

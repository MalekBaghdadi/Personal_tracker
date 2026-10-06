// Rest days: Gym due Mon–Fri with one rest day a week. An unlogged weekday
// is used as the rest day automatically; "Rest day" on Today marks one ahead.
// The clock is pinned to the most recent Thursday so the week has a past.
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

// Back (never forward, so auth tokens stay valid) to the latest Thursday,
// following the app's 5am day start.
const DAY_START_MS = 5 * 3600000;
const back = (new Date(Date.now() - DAY_START_MS).getDay() - 4 + 7) % 7;
await page.evaluateOnNewDocument((days) => {
  const RealDate = Date;
  const skew = -days * 86400000;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
}, back);

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const thursday = new Date(Date.now() - DAY_START_MS - back * 86400000);
const day = (offset) => ymd(new Date(thursday.getTime() + offset * 86400000)); // 0 = today (Thu), -3 = Mon
const pressText = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.innerText.trim() === l);
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(400);
};
const gymRow = () => page.evaluate(() => [...document.querySelectorAll('li')].find((l) => l.querySelector('h2')?.textContent.includes('Gym'))?.innerText ?? '');

async function logGym(date) {
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Gym)');
  await page.type('#entry-h', '1');
  await setVal('#entry-date', date);
  await click('dialog[open] button[type=submit]');
  await wait(300);
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');
  log('App date is a Thursday:', await page.evaluate(() => new Date(Date.now() - 5 * 3600000).getDay() === 4));

  // Gym: 1h a day, Mon–Fri, one rest day a week.
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Gym');
  await page.type('#m-target-h', '1');
  await click('[role=radio]::-p-text(Some days)');
  await pressText('Tu', 'dialog[open]');
  await pressText('Th', 'dialog[open]');
  const restOptions = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Rest days a week"] [role=radio]')].map((b) => b.textContent));
  log('Rest options for 5 days (None, 1, 2, 3):', restOptions.join(',') === 'None,1,2,3');
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Rest days a week"] [role=radio]')][1].click());
  await wait(200);
  log('Hint explains it:', (await text()).includes('one due day can be skipped without breaking the streak'));
  await page.screenshot({ path: `${OUT}rd-01-editor.png`, fullPage: true });
  await click('::-p-text(Create metric)');
  await wait(500);

  // Last week: Mon, Tue, Thu, Fri (Wed off). This week: Mon, Tue; Wed not logged.
  for (const off of [-10, -9, -7, -6, -3, -2]) await logGym(day(off));

  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  let row = await gymRow();
  log('Unlogged Wednesday used as the rest day: streak 6:', row.includes('6 in a row'));
  log('No Rest day button once this week’s is used:', !row.includes('Rest day'));
  await shot('rd-02-auto');

  await page.goto(`http://localhost:5173/#/history`);
  await wait(500);
  await click('[role=radio]::-p-text(Gym)');
  await wait(400);
  // Wednesday can fall in last month when Thursday is the 1st.
  if (day(-1).slice(0, 7) !== day(0).slice(0, 7)) await click('::-p-aria(Previous month)');
  const wedLabel = await page.evaluate((d) => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label')?.includes(new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')))?.getAttribute('aria-label') ?? '', day(-1));
  log('History marks Wednesday as a rest day:', wedLabel.includes('rest day'));
  log('Calendar shows "rest" on it:', await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].some((b) => b.getAttribute('aria-label').includes('rest day') && b.innerText.includes('rest'))));
  await shot('rd-03-history');

  // Log Wednesday after all: the rest day is free again, so Today offers it.
  await logGym(day(-1));
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  row = await gymRow();
  log('Wednesday logged: streak 7:', row.includes('7 in a row'));
  log('Rest day button offered:', row.includes('Rest day'));
  await shot('rd-04-offer');

  await click('[data-tour=today-rest]');
  row = await gymRow();
  log('Marked: says rest day, streak kept:', row.includes('Rest day today · streak kept') && row.includes('7 in a row'));
  log('Toast with Undo:', (await text()).includes('Rest day: Gym streak kept'));
  await shot('rd-05-resting');

  await pressText('Undo');
  row = await gymRow();
  log('Undo brings the button back:', row.includes('Rest day') && !row.includes('streak kept'));

  await click('[data-tour=today-rest]');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  row = await gymRow();
  log('Rest day survives a reload:', row.includes('Rest day today · streak kept'));

  // Editing the metric keeps the mark.
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('li button')].find((b) => b.innerText.includes('Gym'))?.click());
  await wait(500);
  await click('::-p-text(Save changes)');
  await wait(400);
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  log('Editing the metric keeps today’s rest day:', (await gymRow()).includes('Rest day today'));

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('rd-crash');
} finally {
  await browser.close();
}

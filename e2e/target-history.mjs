// Target history. Changing a metric's target only affects the days from the
// date chosen: a day that met the old 30m target stays met after the target
// goes up to 1h 30m, and a back-dated change repairs the past.
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

    // ── Study: 30m target, 30m logged yesterday ──
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Study');
  await page.type('#m-target-m', '30');
  await click('::-p-text(Create metric)');
  await wait(500);

  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Study)');
  await page.type('#entry-m', '30');
  await setVal('#entry-date', yesterday);
  await click('dialog[open] button[type=submit]');
  await wait(400);

  // The calendar cell's label says "target met" for a day that met its target.
  const historyDay = async () => {
    await page.goto('http://localhost:5173/#/history');
    await wait(500);
    await click('[role=radio]::-p-text(Study)');
    if (yesterday.slice(0, 7) !== today.slice(0, 7)) await click('::-p-aria(Previous month)');
    return page.evaluate((d) => {
      const prefix = new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
      return [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').startsWith(prefix))?.getAttribute('aria-label') ?? '';
    }, yesterday);
  };
  log('Yesterday met the 30m target:', (await historyDay()).includes('target met'));

  // ── Raise it to 1h 30m from today: the date field appears, yesterday keeps its target ──
  await openMetric('Study');
  log('No date field until the target is edited:', !(await page.$('#m-from')));
  await setVal('#m-target-h', '1');
  await setVal('#m-target-m', '30');
  await wait(200);
  log('Date field defaults to today:', (await page.$eval('#m-from', (el) => el.value)) === today);
  await shot('th-01-editor', true);
  await click('::-p-text(Save changes)');
  await wait(500);

  log('Yesterday still met after the target went up:', (await historyDay()).includes('target met'));
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  log('Today uses the new target:', (await row('Study')).includes('1h 30m'));

  await openMetric('Study');
  const dlg = await dialogText();
  log('Editor lists both targets:', dlg.includes('Target history') && dlg.includes('at least 30m') && dlg.includes('until') && dlg.includes('at least 1h 30m') && dlg.includes('from'));
  await shot('th-02-history-list', true);

  // ── Back-date it to yesterday: the whole past is now judged by 1h 30m ──
  await setVal('#m-target-m', '45');
  await setVal('#m-from', yesterday);
  await click('::-p-text(Save changes)');
  await wait(500);
  log('Back-dated: yesterday no longer meets 1h 45m:', !(await historyDay()).includes('target met'));

  // ── A date in the future is refused ──
  await openMetric('Study');
  await setVal('#m-target-m', '15');
  await setVal('#m-from', '2999-01-01');
  await click('::-p-text(Save changes)');
  log('Future start refused:', (await dialogText()).includes('can start today at the latest'));
  await page.keyboard.press('Escape');
  await wait(300);

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('th-crash');
} finally {
  await browser.close();
}

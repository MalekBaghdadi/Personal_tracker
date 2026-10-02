import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5173/';
const EMAIL = 'e2e@logbook.test';
const PASS = 'emulator-only-pass';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
// Firestore is unreachable on purpose (offline path), so its connection errors are expected noise.
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach Cloud Firestore/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.innerText);
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(250); };
const log = (...a) => console.log('•', ...a);

try {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' });
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await wait(800);
  await shot('01-auth');

  await click('::-p-text(Create account)');
  await page.type('#email', EMAIL);
  await page.type('#password', PASS);
  await click('button[type=submit]');
  await wait(2500);
  let t = await text();
  if (t.includes('already exists')) {
    await click('::-p-text(Sign in)');
    await click('button[type=submit]');
    await wait(2500);
    t = await text();
  }
  await shot('02-after-signin');
  log('After sign-in shows empty state:', t.includes('Nothing to track yet'));

  // Create a metric from the UI (works offline: no server needed).
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '90');
  await shot('03-new-metric');
  await click('::-p-text(Create metric)');
  await wait(600);
  await shot('04-metrics-list');

  // Second metric: a count with a ceiling.
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Calories');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await click('::-p-text(At most)');
  await page.type('#m-target', '2200');
  await page.$eval('#m-quick', (el) => { el.value = ''; });
  await page.type('#m-quick', '250, 500');
  await click('::-p-text(Create metric)');
  await wait(600);

  await click('nav.fixed a[href="#/today"]');
  await wait(400);
  await shot('05-today');

  // Quick add twice, deliberately spaced: two entries.
  await click('::-p-aria(Add 15m to Studying)');
  await wait(500);
  await click('::-p-aria(Add 15m to Studying)');
  await wait(500);
  t = await text();
  log('Studying total 30m after two quick-adds:', /Studying[\s\S]{0,40}30m/.test(t));
  await shot('06-after-quickadd');

  // Accidental double tap (<350ms): one entry.
  await page.locator('::-p-aria(Add 250 kcal to Calories)').click();
  await wait(80);
  await page.locator('::-p-aria(Add 250 kcal to Calories)').click();
  await wait(600);
  t = await text();
  log('Calories 250 after accidental double tap:', /Calories[\s\S]{0,60}\b250\b/.test(t) && !/\b500\b\s*kcal/.test(t));

  // Timer.
  await click('::-p-aria(Start Studying timer)');
  await wait(3200);
  t = await text();
  log('Timer bar visible with elapsed:', /0:0[2-4]/.test(t));
  await shot('07-timer-running');
  await click('nav.fixed a[href="#/stats"]');
  await wait(1200);
  t = await text();
  log('Timer bar visible on another tab:', /0:0\d/.test(t) && t.includes('Stop'));
  await shot('08-stats-with-timer');
  await click('::-p-aria(Stop Studying and log it)');
  await wait(800);
  t = await text();
  log('Stop toast:', (t.match(/Logged \d+s to Studying/) || ['none'])[0]);

  // Manual entry validation.
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add a custom amount to Studying)');
  await click('::-p-text(Log it)');
  t = await text();
  log('Zero rejected inline:', t.includes('Enter a duration above zero.'));
  await page.type('#entry-h', '20');
  await click('::-p-text(Log it)');
  t = await text();
  log('20h asks for confirmation:', t.includes('Tap again to confirm'));
  await shot('09-long-confirm');
  await page.keyboard.press('Escape');
  await wait(300);

  // Persistence: reload, data comes back from IndexedDB with no server.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  t = await text();
  log('After reload Studying still 30m+:', /Studying[\s\S]{0,40}30m/.test(t), '| Calories 250:', /\b250\b/.test(t));
  await shot('10-after-reload');

  // History + day sheet.
  await click('nav.fixed a[href="#/history"]');
  await wait(500);
  await shot('11-history');
  const today = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'));
    return b?.getAttribute('aria-label');
  });
  log('Today cell label:', today);
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.click());
  await wait(500);
  await shot('12-day-sheet');
  await page.keyboard.press('Escape');

  // Settings + light theme.
  await click('nav.fixed a[href="#/settings"]');
  await click('::-p-text(Light)');
  await wait(400);
  await shot('13-settings-light');
  await click('nav.fixed a[href="#/today"]');
  await wait(300);
  await shot('14-today-light');
  await click('nav.fixed a[href="#/settings"]');
  await click('::-p-text(Dark)');

  // Desktop layout.
  await page.setViewport({ width: 1280, height: 820 });
  await click('nav.sticky a[href="#/stats"]');
  await wait(1000);
  await shot('15-desktop-stats');
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('99-failure');
} finally {
  console.log('Console errors:', errors.length ? errors.slice(0, 15) : 'none');
  await browser.close();
}

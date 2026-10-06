// Spotlight tours: each tab's tour shows once, steps skip missing controls,
// the screen underneath is blocked, finishing/skipping is remembered, and
// Settings replays them. Tours are off in other suites (emulator builds need
// the logbook:e2e-tours flag).
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
const log = (...a) => console.log('•', ...a);
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(250); };
const tour = () => page.evaluate(() => {
  const t = document.querySelector('[data-testid=tour]');
  if (!t) return null;
  return { title: t.querySelector('#tour-title')?.textContent, count: t.querySelector('[aria-live]')?.textContent };
});
const tourBtn = async (label) => {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('[data-testid=tour] button')].find((x) => x.textContent.trim() === l);
    b?.click();
    return !!b;
  }, label);
  if (!ok) console.log(`FAILED: no tour button "${label}"`);
  await wait(350);
};
const go = async (hash) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await wait(1300);
};
// The spotlight sits over the target: their centres match.
const spotOnTarget = (marker) => page.evaluate((m) => {
  const el = document.querySelector(`[data-tour="${m}"]`);
  const spot = document.querySelector('[data-testid=tour] .ring-2');
  if (!el || !spot) return false;
  const a = el.getBoundingClientRect();
  const b = spot.getBoundingClientRect();
  return Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) < 2 && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 2;
}, marker);

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('logbook:e2e-tours', '1'));
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  // Like a real new account: first run, then tours. (Seeding needs the server,
  // so the emulator-only hook stands in for it.)
  await page.evaluate(() => window.__e2eFirstRun());
  await wait(800);
  log('No tour during first run:', (await tour()) === null);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start with nothing')?.click());
  await wait(2000);

  let t = await tour();
  log('Today tour on first open:', t?.title === 'Welcome to Today');
  log('Steps for missing controls skipped (no metrics → 2 steps):', t?.count === '1 of 2');
  await shot('to-01-welcome');
  await tourBtn('Skip');
  log('Skip closes it:', (await tour()) === null);

  await click('nav.fixed a[href="#/metrics"]');
  await wait(1300);
  t = await tour();
  log('Metrics tour on first open:', t?.title === 'Track something new');
  log('Spotlight on New metric:', await spotOnTarget('metrics-new'));
  await shot('to-02-metrics');
  // Taps on the screen underneath are blocked.
  const box = await (await page.$('[data-tour="metrics-new"]')).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(400);
  log('Screen underneath blocked:', !(await page.evaluate(() => !!document.querySelector('dialog[open]'))));
  await tourBtn('Next');
  await tourBtn('Done');
  log('Done closes it:', (await tour()) === null);

  // A metric with a timer, so Today's tour has every step.
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '30');
  await click('::-p-text(Create metric)');
  await wait(500);
  await click('nav.fixed a[href="#/today"]');
  await wait(1300);
  log('Seen tour does not come back:', (await tour()) === null);

  await click('nav.fixed a[href="#/settings"]');
  await wait(1300);
  log('Settings tour on first open:', (await tour())?.title === 'Late nights');
  await tourBtn('Next');
  await tourBtn('Next');
  log('Last Settings step spotlights Tutorials:', await spotOnTarget('settings-tours'));
  await tourBtn('Done');

  // Replay Today from Settings.
  await page.evaluate(() => [...document.querySelectorAll('[data-tour=settings-tours] button')].find((b) => b.textContent.includes('Today'))?.click());
  await wait(1500);
  t = await tour();
  log('Replay goes to Today and starts the tour:', (await page.evaluate(() => location.hash)) === '#/today' && t?.title === 'Welcome to Today');
  log('Full tour with a metric (8 steps):', t?.count === '1 of 8');
  const seenTitles = [t.title];
  for (let i = 0; i < 7; i++) {
    await tourBtn('Next');
    const now = await tour();
    seenTitles.push(now?.title);
    if (now?.title === 'Quick add') {
      log('Spotlight on first chip:', await spotOnTarget('today-chip'));
      await shot('to-03-quick-add');
    }
    if (now?.title === 'Timer') {
      log('Spotlight on timer:', await spotOnTarget('today-timer'));
      await shot('to-04-timer');
    }
  }
  log('Goals step skipped (no goals):', !seenTitles.includes('Deadline goals'));
  await tourBtn('Back');
  log('Back goes to previous step:', (await tour())?.title === 'Add or take away');
  await tourBtn('Next');
  await tourBtn('Done');
  log('Nothing was logged by the tour:', !(await page.evaluate(() => document.body.innerText)).includes('Logged'));

  // Escape skips and is remembered.
  await click('nav.fixed a[href="#/history"]');
  await wait(1300);
  log('History tour on first open:', (await tour())?.title === 'All or one');
  await page.keyboard.press('Escape');
  await wait(300);
  log('Escape closes it:', (await tour()) === null);

  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  for (const h of ['#/today', '#/history', '#/metrics', '#/settings']) {
    await go(h);
    if (await tour()) log(`FAILED: tour came back on ${h}`, true);
  }
  log('Seen tours stay seen after reload:', true);

  await go('#/stats');
  log('Stats tour still to come:', (await tour()) !== null);
  await shot('to-05-stats');

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('to-crash');
} finally {
  await page.evaluate(() => localStorage.removeItem('logbook:e2e-tours')).catch(() => {});
  await browser.close();
}

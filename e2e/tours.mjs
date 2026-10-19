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
// Animations off, like on Windows where headless Chrome reports reduced motion (macOS doesn’t).
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
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
  await page.keyboard.press('Escape');
  await wait(300);

  // ── Goal and plan tours: the first time each screen opens; replayable once one exists ──
  const pressIn = async (label) => {
    await page.evaluate((l) => {
      const all = [...document.querySelectorAll('dialog[open] button, main button')];
      (all.find((b) => b.innerText.trim() === l) ?? all.find((b) => b.innerText.trim().startsWith(l)))?.click();
    }, label);
    await wait(500);
  };
  const setVal = (sel, v) => page.$eval(sel, (el, val) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, v);
  await go('#/settings');
  const replayNames = () => page.evaluate(() => [...document.querySelectorAll('[data-tour=settings-tours] button')].map((b) => b.textContent.trim()));
  log('No goal or plan yet: no replay buttons for them:', !(await replayNames()).some((n) => n === 'Plan' || n === 'Deadline goal'));

  await go('#/metrics');
  await click('::-p-text(New goal)');
  await pressIn('Plan: start empty');
  await setVal('#p-name', 'Uptime Monitor');
  await setVal('#p-metric', await page.$eval('#p-metric', (sel) => [...sel.options].find((o) => o.text === 'Studying').value));
  await pressIn('Create plan');
  await wait(1300);
  t = await tour();
  log('Plan tour on first open:', t?.title === 'A plan' && t?.count === '1 of 6');
  const planTitles = [t?.title];
  for (let i = 0; i < 5; i++) {
    await tourBtn('Next');
    const now = await tour();
    planTitles.push(now?.title);
    if (now?.title === 'Link it to a metric') {
      log('Link step spotlights Edit plan:', await spotOnTarget('plan-edit'));
      await shot('to-06-plan-link');
    }
  }
  log('Plan tour steps:', planTitles.join(' → '));
  await tourBtn('Done');
  log('Plan tour done:', (await tour()) === null);

  // One task so the plan shows on Today, inside the Studying row.
  await pressIn('Edit tasks');
  await pressIn('Add a task');
  await page.type('input[aria-label="New task"]', 'Write the health-check worker');
  await page.keyboard.press('Enter');
  await wait(500);
  await pressIn('Done editing');

  // An amount goal on Studying: its tour on first open.
  await go('#/metrics');
  await click('::-p-text(New goal)');
  await pressIn('Amount goal');
  await page.type('#g-target', '40');
  await setVal('#g-deadline', '2026-12-15');
  await click('dialog[open] button[type=submit]');
  await wait(600);
  await page.evaluate(() => document.querySelector('a[href^="#/goals/"]')?.click());
  await wait(1500);
  t = await tour();
  log('Goal tour on first open:', t?.title === 'A deadline goal');
  await tourBtn('Next');
  await tourBtn('Next');
  log('Goal tour: Linked metric step on Edit:', (await tour())?.title === 'Linked metric' && (await spotOnTarget('goal-edit')));
  await page.keyboard.press('Escape');
  await wait(300);

  // Today's tour now has the linked-goals step, spotlighting the goals inside the Studying row.
  await go('#/settings');
  log('Replay buttons for Deadline goal and Plan now shown:', (await replayNames()).includes('Plan') && (await replayNames()).includes('Deadline goal'));
  await page.evaluate(() => [...document.querySelectorAll('[data-tour=settings-tours] button')].find((b) => b.textContent.trim() === 'Today')?.click());
  await wait(1500);
  let linkedSeen = false;
  for (let i = 0; i < 14 && (await tour()); i++) {
    if ((await tour())?.title === 'Goals under a metric') {
      linkedSeen = await spotOnTarget('today-linked');
      await shot('to-07-today-linked');
      break;
    }
    await tourBtn('Next');
  }
  log('Today tour: Goals under a metric step on the linked goals:', linkedSeen);
  await page.keyboard.press('Escape');
  await wait(300);

  // Replay the plan tour from Settings: opens the plan.
  await go('#/settings');
  await page.evaluate(() => [...document.querySelectorAll('[data-tour=settings-tours] button')].find((b) => b.textContent.trim() === 'Plan')?.click());
  await wait(1500);
  log('Replay Plan opens the plan with its tour:', (await page.evaluate(() => location.hash)).startsWith('#/plans/') && (await tour())?.title === 'A plan');
  await page.keyboard.press('Escape');
  await wait(300);

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('to-crash');
} finally {
  await page.evaluate(() => localStorage.removeItem('logbook:e2e-tours')).catch(() => {});
  await browser.close();
}

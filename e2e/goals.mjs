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
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const dialog = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}, v);
const card = () => page.evaluate(() => document.querySelector('section[aria-label="Deadline goals"]')?.innerText ?? '(no card)');
const log = (...a) => console.log('•', ...a);
const press = async (label) => { await page.evaluate((l) => [...document.querySelectorAll('main button, dialog[open] button')].find((b) => b.textContent.trim() === l).click(), label); await wait(400); };

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Network+');
  await click('::-p-text(Create metric)');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Calories');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await click('::-p-text(At most)');
  await click('::-p-text(Create metric)');

  // Create from the Goals list.
  await click('::-p-text(New goal)');
  const options = await page.$$eval('#g-metric option', (os) => os.map((o) => o.textContent));
  log('Metric choices (no at_most metrics):', options.join(', '));
  await page.type('#g-target', '120');
  await page.type('#g-prior', '20');
  await setVal('#g-deadline', '2026-12-15');
  await wait(200);
  let d = await dialog();
  log('Preview:', (d.match(/That’s[^\n]*/) || ['(none)'])[0]);
  // The pace depends on today's date, so take it from the preview rather than hardcoding it.
  const pace = d.match(/That’s (.+?) per day/)?.[1];
  log('Auto name:', await page.$eval('#g-name', (el) => el.value));
  await page.screenshot({ path: `${OUT}70-goal-form.png` });
  await click('dialog[open] button[type=submit]');
  await wait(400);

  await click('nav.fixed a[href="#/today"]');
  log('Card:', JSON.stringify(await card()));
  log('Card on day one reads exactly on schedule:', /Exactly on schedule/.test(await card()));
  const row = await page.evaluate(() => [...document.querySelectorAll('li')].find((li) => li.querySelector('h2')?.textContent.includes('Network+'))?.innerText);
  log('Metric row has goal pace line:', (row ?? '').includes(`Goal pace: ${pace} today`), '|', (row ?? '').match(/Goal pace:[^\n]*/)?.[0]);
  await page.screenshot({ path: `${OUT}71-today-goal.png` });

  // Log 1h: card updates, required pace for today doesn't move.
  await click('::-p-aria(Add 1h to Network+)');
  await wait(400);
  log('Card after +1h:', JSON.stringify(await card()));
  log('Card shows the amount ahead, not just "On track":', /1h ahead/.test(await card()));

  // Detail screen with chart.
  await click('section[aria-label="Deadline goals"] a');
  await wait(1500);
  log('URL:', await page.evaluate(() => location.hash));
  const lines = await page.$$eval('.recharts-line path.recharts-curve', (ps) => ps.length);
  log('Chart lines drawn (done, steady, projected → ≥2 before enough data):', lines);
  const figs = await page.evaluate(() => [...document.querySelectorAll('dl div')].map((x) => x.innerText.replace('\n', ': ')).join(' | '));
  log('Figures:', figs);
  await page.screenshot({ path: `${OUT}72-goal-detail.png`, fullPage: true });

  // Change the deadline: everything recomputes.
  await press('Edit');
  await setVal('#g-deadline', '2026-11-01');
  await wait(200);
  log('Preview after deadline change:', ((await dialog()).match(/That’s[^\n]*/) || ['(none)'])[0]);
  await click('dialog[open] button[type=submit]');
  await wait(400);
  log('Detail after edit:', (await text()).match(/Network\+ — [^\n]*/)?.[0], '|', (await page.evaluate(() => [...document.querySelectorAll('dl div')][0]?.innerText.replace('\n', ': '))));

  // One active goal per metric.
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New goal)');
  d = await dialog();
  log('Second goal on same metric blocked:', d.includes('already has an active goal'));
  await page.keyboard.press('Escape');
  await wait(300);

  // Delete confirmation names the goal.
  await click('::-p-text(Network+)');
  log('Editor offers "View deadline goal":', (await dialog()).includes('View deadline goal'));
  await click('dialog[open] ::-p-text(Delete)');
  log('Delete confirmation:', ((await dialog()).match(/This removes[^\n]*/) || [''])[0]);
  await click('dialog[open] ::-p-text(Keep it)');
  await page.keyboard.press('Escape');
  await wait(300);

  // Already-met target saves as achieved, after a confirm.
  await page.evaluate(() => [...document.querySelectorAll('a[href^="#/goals/"]')][0].click());
  await wait(800);
  await press('Archive');
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New goal)');
  await page.type('#g-target', '10');
  await page.type('#g-prior', '12');
  await setVal('#g-deadline', '2026-10-30');
  await click('dialog[open] button[type=submit]');
  log('Confirm step shown:', (await dialog()).includes('Yes, save as achieved'));
  await click('dialog[open] button[type=submit]');
  await wait(400);
  const list = await page.evaluate(() => document.querySelector('section[aria-labelledby="goals-h"]')?.innerText);
  log('Goals list:', JSON.stringify(list));
  await page.screenshot({ path: `${OUT}73-goals-list.png`, fullPage: true });

  // Reload: everything persisted locally.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  await click('nav.fixed a[href="#/today"]');
  log('After reload, card:', JSON.stringify(await card()));
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-goals-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

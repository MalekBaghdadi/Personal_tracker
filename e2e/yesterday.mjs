// "Yesterday" on Today: catch up on a missed day and restore a streak.
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
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const row = (name) => page.evaluate((n) => [...document.querySelectorAll('dialog[open] li')].find((li) => li.querySelector('h3')?.textContent.includes(n))?.innerText ?? '(no row)', name);
const log = (...a) => console.log('•', ...a);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The app's day starts at 5am.
const day = (offset) => ymd(new Date(Date.now() - 5 * 3600000 + offset * 86400000));

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
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '90');
  await click('::-p-text(Create metric)');

  // Gym only on a day that is neither today nor yesterday: it shouldn't show in either place.
  const offDay = (new Date(Date.now() - 5 * 3600000).getDay() + 2) % 7;
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Gym');
  await click('dialog[open] [role=radio]::-p-text(Some days)');
  // One click per render: the day picker computes each change from the current selection.
  for (let i = 0; i < 7; i++) {
    const clicked = await page.evaluate((keep) => {
      const names = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const b = [...document.querySelectorAll('dialog[open] [aria-label="Scheduled days"] button')]
        .find((x) => (x.getAttribute('aria-pressed') === 'true') !== (x.textContent === names[keep]));
      b?.click();
      return !!b;
    }, offDay);
    if (!clicked) break;
    await wait(150);
  }
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');
  await wait(400);
  let t0 = await page.evaluate(() => document.querySelector('main').innerText);
  log('Gym (not scheduled today) is hidden on Today:', !t0.includes('Gym') && t0.includes('Studying'));
  log('No "Not scheduled today" section:', !t0.includes('Not scheduled today'));

  // A 2-day streak three and two days ago; yesterday was missed.
  for (const o of [-3, -2]) {
    await click('::-p-aria(Add a custom amount to Studying)');
    await page.type('#entry-h', '2');
    await setVal('#entry-date', day(o));
    await click('dialog[open] button[type=submit]');
    await wait(300);
  }
  await page.screenshot({ path: `${OUT}96-today-yesterday-button.png` });

  await click('::-p-aria(Add to yesterday)');
  let d = await dialog();
  log('Sheet title names yesterday:', d.startsWith('Yesterday ·'), JSON.stringify(d.split('\n')[0]));
  let r = await row('Studying');
  log('Gym (not scheduled yesterday) is hidden in the sheet:', !d.includes('Gym'));
  log('Row offers to restore the streak:', r.includes('1h 30m more restores your 2-day streak'), JSON.stringify(r));
  await page.screenshot({ path: `${OUT}97-yesterday-sheet.png` });

  await click('::-p-aria(Add 1h to Studying yesterday)');
  await wait(400);
  await click('::-p-aria(Add 30m to Studying yesterday)');
  r = await row('Studying');
  log('After +1h +30m the streak is kept:', r.includes('Target met · streak kept (3 days)'));
  log('Undo shown inside the sheet:', (await dialog()).includes('Logged 30m to Studying yesterday'));
  await click('dialog[open] ::-p-text(Undo)');
  r = await row('Studying');
  log('Undo takes it back to 1h:', /1h\s*\/\s*1h 30m/.test(r) && r.includes('30m more restores'));
  await click('::-p-aria(Add 30m to Studying yesterday)');

  // − mode trims yesterday, never below 0.
  await click('::-p-aria(Adding to Studying yesterday. Switch to subtracting)');
  await click('::-p-aria(Subtract 15m from Studying yesterday)');
  r = await row('Studying');
  log('Subtract in the sheet trims yesterday:', /1h 15m\s*\/\s*1h 30m/.test(r));
  await click('::-p-aria(Subtracting from Studying yesterday. Switch to adding)');
  await click('::-p-aria(Add 15m to Studying yesterday)');

  // Custom amount opens the entry sheet on yesterday's date.
  await click('::-p-aria(Add a custom amount to Studying yesterday)');
  const date = await page.$eval('#entry-date', (el) => el.value);
  log('Custom amount is dated yesterday:', date === day(-1));
  await page.keyboard.press('Escape');
  await wait(300);
  await page.keyboard.press('Escape');
  await wait(300);
  log('Sheet closed:', (await dialog()) === '(no sheet)');

  // The streak is whole again: Today and History agree.
  const t = await text();
  log('Today shows a 3-day streak:', t.includes('3 in a row'));
  await page.goto(`http://localhost:5173/#/history/${day(-1)}`);
  await wait(1000);
  await page.keyboard.press('Escape');
  await click('[role=radio]::-p-text(Studying)');
  const label = await page.evaluate((n) => [...document.querySelectorAll('section[aria-label] button[aria-label]')].find((b) => b.querySelector('span')?.textContent === String(n))?.getAttribute('aria-label'), Number(day(-1).slice(8)));
  log('History: yesterday is day 3 of a streak:', (label ?? '').includes('day 3 of a streak'));
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-yesterday-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

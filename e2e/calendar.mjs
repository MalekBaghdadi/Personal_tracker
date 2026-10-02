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
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const dialog = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
const header = () => page.evaluate(() => document.querySelector('header a')?.innerText ?? '');

async function addItem(kind, title, time) {
  await click(`dialog[open] ::-p-text(Add ${kind})`);
  await page.type('#item-title', title);
  if (time) await page.$eval('#item-time', (el, t) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
  await click('dialog[open] button[type=submit]');
}

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
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add 30m to Studying)');

  // Alignment: left edges of name, progress bar, first control; right edges of total and last control.
  const edges = await page.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find((x) => x.querySelector('h2')?.textContent.includes('Studying'));
    const r = (el) => el.getBoundingClientRect();
    const bar = li.querySelector('[role=presentation]');
    const btns = li.querySelectorAll(':scope > div:last-child > button');
    return {
      left: [r(li.querySelector('h2')).left, r(bar).left, r(btns[0]).left].map(Math.round),
      right: [r(li.querySelector('p')).right, r(bar).right, r(btns[btns.length - 1]).right].map(Math.round),
    };
  });
  console.log('• Left edges (name, bar, +):', edges.left.join(', '), '| equal:', new Set(edges.left).size === 1);
  console.log('• Right edges (total, bar, ▶):', edges.right.join(', '), '| equal:', new Set(edges.right).size === 1);
  console.log('• Header with nothing planned:', JSON.stringify(await header()));

  // Tap the date on Today: History opens with today's day sheet.
  await click('header a');
  await wait(400);
  console.log('• URL after tapping date:', await page.evaluate(() => location.hash));
  let d = await dialog();
  console.log('• Day sheet opened with sections:', d.includes('Events and reminders') && d.includes('Logged'));

  await addItem('event', 'Network+ exam', '14:00');
  await addItem('event', 'Dentist');
  await addItem('reminder', 'Call bank');
  await addItem('reminder', 'Pay rent');
  await wait(300);
  await page.screenshot({ path: `${OUT}60-day-sheet-items.png` });

  // Tick off one reminder.
  await click('dialog[open] [role=checkbox][aria-label="Mark Call bank as done"]');
  console.log('• Reminder ticked:', await page.$eval('[role=checkbox][aria-label="Mark Call bank as not done"]', (b) => b.getAttribute('aria-checked')));

  // Close the sheet: URL drops the day.
  await page.keyboard.press('Escape');
  await wait(300);
  console.log('• URL after closing sheet:', await page.evaluate(() => location.hash));

  await click('nav.fixed a[href="#/today"]');
  console.log('• Today summary:', JSON.stringify(await header()));
  await page.screenshot({ path: `${OUT}61-today-summary.png` });

  // Plan ahead: next month, a future day accepts events but not entries.
  await click('nav.fixed a[href="#/history"]');
  await click('::-p-aria(Next month)');
  const futureLabel = await page.evaluate(() => {
    const b = [...document.querySelectorAll('section[aria-label^="All metrics"] button')].find((x) => x.getAttribute('aria-label').startsWith('') && x.textContent.trim() === '15');
    b.click();
    return b.getAttribute('aria-label');
  });
  await wait(400);
  d = await dialog();
  console.log('• Future day opens:', futureLabel.split(':')[0], '| has events section:', d.includes('Events and reminders'), '| no Logged section:', !d.includes('Logged'));
  await addItem('event', 'Flight to Paris', '09:30');
  await page.keyboard.press('Escape');
  await wait(300);
  const marked = await page.evaluate(() => [...document.querySelectorAll('section[aria-label^="All metrics"] button')].find((x) => x.textContent.trim() === '15').getAttribute('aria-label'));
  console.log('• Future cell label:', marked);
  await page.screenshot({ path: `${OUT}62-next-month.png` });

  // Month title jumps back to the current month.
  await click('button[aria-label$="Go to this month"]');
  console.log('• Back on current month:', await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /\d{4}$/.test(b.textContent))?.textContent));

  // Reload persists items.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  await click('nav.fixed a[href="#/today"]');
  console.log('• After reload, Today summary:', JSON.stringify(await header()));
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-calendar-failure.png` });
} finally {
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

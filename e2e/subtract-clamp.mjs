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
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(450); };
const total = () => page.evaluate(() => [...document.querySelectorAll('li')].find((li) => li.querySelector('h2')?.textContent.includes('Studying'))?.querySelector('p span')?.textContent);
const dialog = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
const toastText = () => page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText ?? '');

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
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add 30m to Studying)');
  await click('::-p-aria(Add 15m to Studying)');
  console.log('• Start:', await total());

  await click('::-p-aria(Adding to Studying. Switch to subtracting)');
  await click('::-p-aria(Subtract a custom amount from Studying)');
  await page.type('#entry-m', '50');
  await wait(200);
  const d = await dialog();
  console.log('• Hint:', (d.match(/45m logged on this day[^\n]*/) || ['(none)'])[0]);
  console.log('• Button:', (d.match(/Subtract all [^\n]*|Subtract \d[^\n]*/) || ['(none)'])[0]);
  // Layout: date field spans the full width, nothing beside it.
  const widths = await page.evaluate(() => {
    const date = document.querySelector('#entry-date').getBoundingClientRect();
    const form = document.querySelector('dialog[open] form').getBoundingClientRect();
    return { date: Math.round(date.width), form: Math.round(form.width) };
  });
  console.log('• Date field full width:', widths.date === widths.form, widths);
  await page.screenshot({ path: `${OUT}80-oversubtract-sheet.png` });
  await click('dialog[open] button[type=submit]');
  console.log('• After −50m from 45m (expect 0m):', await total(), '| toast:', JSON.stringify(await toastText()));

  await click('::-p-text(Undo)');
  console.log('• After Undo (expect 45m):', await total());

  await click('::-p-aria(Subtract 1h from Studying)');
  console.log('• Chip −1h from 45m (expect 0m):', await total(), '| toast:', JSON.stringify(await toastText()));
  await click('::-p-text(Undo)');

  await click('::-p-aria(Subtract 30m from Studying)');
  console.log('• Chip −30m from 45m (expect 15m):', await total());

  // Edit sheet shares the new layout.
  await click('nav.fixed a[href="#/history"]');
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.click());
  await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.includes('Quick add'))?.click());
  await wait(500);
  console.log('• Edit sheet info line:', ((await dialog()).match(/Logged at [^\n]*/) || ['(none)'])[0]);
  await page.screenshot({ path: `${OUT}81-edit-sheet.png` });
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-oversubtract-failure.png` });
} finally {
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

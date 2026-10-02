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
const total = (name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll('li')].find((li) => li.querySelector('h2')?.textContent === n);
  return row?.querySelector('p span')?.textContent;
}, name);
// Controls on one line? Compare the tops of the first and last control in the row.
const oneLine = (name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll('li')].find((li) => li.querySelector('h2')?.textContent === n);
  const btns = [...row.querySelectorAll(':scope > div:last-child > button')];
  return btns[0].getBoundingClientRect().top === btns[btns.length - 1].getBoundingClientRect().top;
}, name);

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
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Calories');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await page.$eval('#m-quick', (el) => { el.value = ''; });
  await page.type('#m-quick', '100, 250, 500');
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');

  await click('::-p-aria(Add 1h to Studying)');
  await click('::-p-aria(Add 30m to Studying)');
  console.log('• Start (expect 1h 30m):', await total('Studying'));
  console.log('• Controls fit on one line (+ mode):', await oneLine('Studying'));
  await page.screenshot({ path: `${OUT}50-plus-mode.png` });

  await click('::-p-aria(Adding to Studying. Switch to subtracting)');
  const chips = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Subtract "]')].map((b) => b.textContent));
  console.log('• Chips in − mode:', chips.join(' '));
  console.log('• Controls fit on one line (− mode):', await oneLine('Studying'));
  await page.screenshot({ path: `${OUT}51-minus-mode.png` });

  await click('::-p-aria(Subtract 15m from Studying)');
  console.log('• After −15m (expect 1h 15m):', await total('Studying'));
  await click('::-p-text(Undo)');
  console.log('• After Undo (expect 1h 30m):', await total('Studying'));

  // Custom amount in − mode opens the sheet as a subtraction.
  await click('::-p-aria(Subtract a custom amount from Studying)');
  const title = await page.evaluate(() => document.querySelector('dialog[open] h2')?.textContent);
  console.log('• Sheet title:', title, '| no Add/Subtract switch:', !(await page.$('dialog[open] [role=radiogroup]')));
  await page.type('#entry-m', '40');
  await click('dialog[open] button[type=submit]');
  console.log('• After custom −40m (expect 50m):', await total('Studying'));

  // Toggle back: chips add again.
  await click('::-p-aria(Subtracting from Studying. Switch to adding)');
  await click('::-p-aria(Add 15m to Studying)');
  console.log('• Back to + then +15m (expect 1h 5m):', await total('Studying'));

  // Count metric in − mode with nothing logged: chips disabled.
  await click('::-p-aria(Adding to Calories. Switch to subtracting)');
  const disabled = await page.$eval('button[aria-label="Subtract 100 kcal from Calories"]', (b) => b.disabled);
  console.log('• Calories − chips disabled at 0:', disabled);
  console.log('• Calories row fits on one line:', await oneLine('Calories'));
  await page.screenshot({ path: `${OUT}52-both-rows.png` });
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-toggle-failure.png` });
} finally {
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

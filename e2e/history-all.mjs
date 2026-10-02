import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for the emulator to accept connections.
for (let i = 0; i < 60; i++) {
  try { await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' }); break; } catch { await wait(1000); }
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(250); };
const text = () => page.evaluate(() => document.body.innerText);

async function newMetric(name, opts = {}) {
  await click('::-p-text(New metric)');
  await page.type('#m-name', name);
  if (opts.count) { await click('::-p-text(A number)'); await page.type('#m-unit', opts.count); }
  if (opts.atMost) await click('::-p-text(At most)');
  if (opts.target) await page.type(opts.count ? '#m-target' : '#m-target-m', opts.target);
  await click('::-p-text(Create metric)');
  await wait(400);
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
  await newMetric('Studying', { target: '30' });
  await newMetric('Reading', { target: '60' });
  await newMetric('Calories', { count: 'kcal', atMost: true, target: '2000' });

  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add 30m to Studying)');   // Studying target met
  await wait(400);
  await click('::-p-aria(Add 15m to Reading)');    // Reading logged, not met
  await wait(400);

  // Backfill yesterday from History for a second day.
  await click('nav.fixed a[href="#/history"]');
  await wait(500);
  console.log('• All chip selected by default:', await page.$eval('[role=radio][aria-checked=true]', (b) => b.textContent));
  await page.screenshot({ path: `${OUT}30-history-all.png` });

  const todayLabel = await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.getAttribute('aria-label'));
  console.log('• Today cell:', todayLabel);
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.click());
  await wait(500);
  const t = await text();
  console.log('• Day sheet lists both metrics:', t.includes('Studying') && t.includes('Reading'), '| add chips:', t.includes('Add an entry for this day'));
  await page.screenshot({ path: `${OUT}31-history-all-day.png` });

  // Add a Calories entry for today from the sheet.
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Calories')?.click());
  await wait(400);
  await page.type('#entry-count', '1500');
  await click('::-p-text(Log it)');
  await wait(600);
  const after = await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.getAttribute('aria-label'));
  console.log('• Today cell after adding Calories:', after);

  // Switch to a single metric and back.
  await click('[role=radio]::-p-text(Reading)');
  await wait(300);
  console.log('• Single-metric view still works:', (await text()).includes('Month total'));
  await click('[role=radio]::-p-text(All)');
  await wait(300);
  await page.screenshot({ path: `${OUT}32-history-all-after.png` });
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-history-failure.png` });
} finally {
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

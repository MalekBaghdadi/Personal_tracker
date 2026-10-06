// History merges a day's quick adds and manual amounts into one summed row;
// tapping it edits the total. Noted entries keep their own row.
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
const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(250); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });
// Rows of the open day sheet's entry list: [main line, sub line].
const rows = () => page.evaluate(() =>
  [...document.querySelectorAll('dialog[open] ul.divide-y li button')].map((b) => [...b.querySelectorAll('span.block')].map((s) => s.textContent.trim())),
);
const openToday = async () => {
  await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((x) => x.className.includes('ring-1'))?.click());
  await wait(600);
};
const tapRow = async (main) => {
  await page.evaluate((m) => [...document.querySelectorAll('dialog[open] ul.divide-y li button')].find((b) => b.querySelector('span.block')?.textContent.trim() === m)?.click(), main);
  await wait(500);
};
const pressInDialog = async (label) => {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim().startsWith(l));
    b?.click();
    return !!b;
  }, label);
  if (!ok) console.log(`FAILED: no dialog button "${label}"`);
  await wait(600);
};
const setCount = async (v) => {
  await page.$eval('#total-count', (el) => { el.select(); });
  await page.keyboard.press('Backspace');
  await page.type('#total-count', v);
};

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
  await page.type('#m-name', 'Calories');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await click('::-p-text(At most)');
  await page.$eval('#m-quick', (el) => { el.value = ''; });
  await page.click('#m-quick', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#m-quick', '100, 250, 500');
  await click('::-p-text(Create metric)');
  await wait(400);

  await click('nav.fixed a[href="#/today"]');
  for (const v of [500, 250, 100]) {
    await click(`::-p-aria(Add ${v} kcal to Calories)`);
    await wait(350);
  }

  await click('nav.fixed a[href="#/history"]');
  await wait(500);
  await openToday();
  let r = await rows();
  log('One row for three quick adds:', r.length === 1);
  log('Row shows the sum 850 kcal:', r[0]?.[0] === '850 kcal');
  log('Row says 3 quick adds:', /^3 quick adds · last at/.test(r[0]?.[1] ?? ''));
  await shot('me-01-merged');

  // Lower the total: trims the newest entries.
  await tapRow('850 kcal');
  let t = await text();
  log('Total editor opens:', t.includes('Edit Calories total'));
  log('Shows the pieces:', (await page.$eval('[data-testid=total-parts]', (e) => e.textContent)).includes('500 kcal + 250 kcal + 100 kcal'));
  await shot('me-02-editor');
  await setCount('700');
  await pressInDialog('Save 700 kcal');
  r = await rows();
  log('Lowered to 700:', r.length === 1 && r[0][0] === '700 kcal');
  log('Undo offered:', (await text()).includes('Undo'));

  // Raise it: adds the difference as one manual entry, still one row.
  await tapRow('700 kcal');
  await setCount('1000');
  await pressInDialog('Save 1,000 kcal');
  r = await rows();
  log('Raised to 1,000, still one row:', r.length === 1 && r[0][0] === '1,000 kcal');
  log('Mixed sources say entries:', /entries · last at/.test(r[0]?.[1] ?? ''));

  // A noted entry keeps its own row.
  await pressInDialog('Calories');
  await page.type('#entry-count', '300');
  await page.type('#entry-note', 'birthday cake');
  await pressInDialog('Log it');
  r = await rows();
  log('Noted entry is its own row:', r.length === 2 && r.some((x) => x[0] === '300 kcal' && x[1].includes('birthday cake')));
  log('Day total includes both:', (await text()).includes('1,300 kcal'));
  await shot('me-03-with-note');

  // Remove all of the merged ones: the noted entry stays.
  await tapRow('1,000 kcal');
  await pressInDialog('Remove all');
  r = await rows();
  log('Remove all leaves the noted entry:', r.length === 1 && r[0][0] === '300 kcal');
  await shot('me-04-removed');

  // Single-metric view merges too.
  await page.keyboard.press('Escape');
  await wait(300);
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add 100 kcal to Calories)');
  await wait(300);
  await click('::-p-aria(Add 100 kcal to Calories)');
  await wait(300);
  await click('nav.fixed a[href="#/history"]');
  await wait(400);
  await click('[role=radio]::-p-text(Calories)');
  await wait(300);
  await openToday();
  r = await rows();
  log('Metric view: merged 200 plus noted 300:', r.length === 2 && r.some((x) => x[0] === '200 kcal') && r.some((x) => x[0] === '300 kcal'));
  await shot('me-05-metric-view');

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('me-crash');
} finally {
  await browser.close();
}

// Revoked cards: Overachiever now counts a target as at least an hour. Cards collected under
// the old rule (no `rev`) are checked once: the ones the data still earns are stamped, the rest
// are taken back with a notice that explains why, said once, and the XP drops with them.
import puppeteer from 'puppeteer-core';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' }); break; } catch { await wait(1000); }
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach|offline/.test(m.text())) errors.push(m.text()); });

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const log = (...a) => console.log('•', ...a);
const until = async (check, ms = 8000) => { for (let t = 0; t < ms; t += 250) { if (await check()) return true; await wait(250); } return false; };
const notice = () => page.evaluate(() => document.querySelector('dialog[open] [data-testid=revoked-notice]')?.innerText ?? null);
const revs = () => page.evaluate(() => window.__e2eAch.collectedRevs());

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'revoked@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  // A 10-minute target, and 8h 20m in a day: 50× on the old rule, 8.3× (Diamond) on the new one.
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '10');
  await click('::-p-text(Create metric)');
  await wait(600);
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Add a custom amount to Studying)');
  await page.type('#entry-h', '8');
  await page.type('#entry-m', '20');
  await click('::-p-text(Log it)');
  await wait(800);

  // Three cards from before the change: Bronze (still earned), Diamond (still earned), Mythic (not).
  await page.evaluate(() => window.__e2eAch.seedOldCards(['over.1', 'over.5', 'over.6']));
  log('The Mythic is taken back and a notice says so:', await until(async () => /Target Was a Suggestion/.test((await notice()) ?? '')));
  const t = (await notice()) ?? '';
  log('It names only that card, with its tier:', /Mythic/.test(t) && !/Seventh Gear|Extra Credit/.test(t), '|', t.replace(/\n+/g, ' / '));
  log('It says why, and what it costs:', /at least 1 hour/.test(t) && /400 XP/.test(t));
  log('The cards the data still earns are stamped, the Mythic is gone:', JSON.stringify(await revs()) === JSON.stringify({ 'over.1': 2, 'over.5': 2 }), '|', JSON.stringify(await revs()));
  await click('dialog[open] ::-p-text(Got it)');
  log('Got it closes the notice:', await until(async () => (await notice()) === null));

  // Said once: after a reload the notice is read, and nothing is revoked twice.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2500);
  log('No notice after a reload:', (await notice()) === null);
  log('Still stamped, still no Mythic:', JSON.stringify(await revs()) === JSON.stringify({ 'over.1': 2, 'over.5': 2 }));
  log('No page errors:', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

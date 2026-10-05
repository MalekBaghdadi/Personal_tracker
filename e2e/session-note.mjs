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

// A clock we can move forward, so a "long" session doesn't take real minutes.
await page.evaluateOnNewDocument(() => {
  const RealDate = Date;
  let skew = 0;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
  window.__advance = (ms) => { skew += ms; };
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const toast = () => page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText.trim() || '(none)');
const log = (...a) => console.log('•', ...a);

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);

  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await click('::-p-text(Create metric)');
  await click('nav.fixed a[href="#/today"]');

  // Short session: the usual Undo toast, no note prompt.
  await click('::-p-aria(Start Studying timer)');
  await wait(1500);
  await click('::-p-aria(Stop Studying and log it)');
  let t = await toast();
  log('Short session toast:', JSON.stringify(t));
  log('Short session has no note prompt:', !t.includes('accomplish'));
  await wait(5500);
  log('Short session toast fades:', (await toast()) === '(none)');

  // Long session (11 minutes): the prompt appears and stays.
  await click('::-p-aria(Start Studying timer)');
  await page.evaluate(() => window.__advance(11 * 60 * 1000));
  await wait(800);
  await click('::-p-aria(Stop Studying and log it)');
  t = await toast();
  log('Long session toast:', JSON.stringify(t));
  log('Long session asks for a note:', /Logged 11m to Studying[\s\S]*What did you accomplish\?/.test(t));
  await page.screenshot({ path: `${OUT}80-session-note-prompt.png` });
  await wait(6000);
  log('Note prompt stays past the usual 5s:', (await toast()).includes('accomplish'));

  // Pen → inline field → save.
  await click('::-p-aria(Add a note to this session)');
  log('Note field focused:', await page.evaluate(() => document.activeElement?.tagName === 'INPUT' && !!document.activeElement.closest('[aria-live]')));
  await page.keyboard.type('Finished subnetting chapter');
  await page.screenshot({ path: `${OUT}81-session-note-typing.png` });
  await page.keyboard.press('Enter');
  await wait(500);
  log('Toast closes after saving:', (await toast()) === '(none)');

  // The note lands on that entry (History day sheet).
  await click('nav.fixed a[href="#/history"]');
  await wait(600);
  const today = await page.evaluate(() => {
    const d = new Date(Date.now() - 5 * 3600000); // the app's day starts at 5am
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.goto(`http://localhost:5173/#/history/${today}`);
  await wait(1200);
  const sheet = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
  log('Entry shows the note in History:', sheet.includes('Finished subnetting chapter'));
  await page.screenshot({ path: `${OUT}82-session-note-history.png` });
  await page.keyboard.press('Escape');
  await wait(400);

  // Dismiss with ✕ saves nothing.
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  await click('::-p-aria(Start Studying timer)');
  await page.evaluate(() => window.__advance(15 * 60 * 1000));
  await wait(800);
  await click('::-p-aria(Stop Studying and log it)');
  await click('[aria-live=polite] ::-p-aria(Dismiss)');
  log('Dismiss closes the prompt:', (await toast()) === '(none)');
  t = await text();
  log('Studying total is 26m (short session + 11m + 15m):', /Studying[\s\S]{0,40}26m/.test(t));
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-session-note-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

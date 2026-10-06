// Admin view. Firestore is unreachable here, so the screens load from this
// device's cache (and must say so). The emulator-only localStorage flag makes
// the test account an admin; the security rules can't be exercised without the
// Firestore emulator.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5173/';
const EMAIL = 'e2e@logbook.test';
const PASS = 'emulator-only-pass';
const FLAG = 'logbook:e2e-admin';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach Cloud Firestore/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

const shot = (n) => page.screenshot({ path: `${OUT}${n}.png`, fullPage: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const press = async (label) => {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button, a')].find((x) => x.innerText.trim() === l);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, label);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(300);
};
const go = async (hash, ms = 1500) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await wait(ms);
};
// Polls until the loading text is gone (cache fallback can take a moment offline).
const settle = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await text()).includes('Loading…')) return;
    await wait(250);
  }
};

try {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' });
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.evaluate((k) => localStorage.removeItem(k), FLAG);
  await wait(800);
  await press('Create account');
  await page.type('#email', EMAIL);
  await page.type('#password', PASS);
  await page.click('button[type=submit]');
  await wait(2500);

  await go('#/settings', 800);
  log('Not admin: no Admin section:', !(await text()).includes('Users'));
  await go('#/admin', 800);
  log('Not admin: page refused:', (await text()).includes('isn’t available'));

  // Some data to look at: a metric with a target and one quick add.
  await go('#/metrics', 600);
  await press('New metric');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '30');
  await press('Create metric');
  await wait(600);
  await go('#/today', 800);
  await press('+15m');
  await wait(500);

  await page.evaluate((k) => localStorage.setItem(k, '1'), FLAG);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  await go('#/settings', 800);
  let t = await text();
  log('Admin: Users link in Settings:', t.includes('Admin') && t.includes('Users'));
  await shot('ad-01-settings');

  await press('Users');
  await settle();
  t = await text();
  log('List shows own account:', t.includes(EMAIL) && t.includes('you'));
  log('List says joined and last seen:', /Joined .* · last seen/.test(t));
  log('Offline note shown:', t.includes('Offline: showing what this device has cached'));
  await shot('ad-02-users');

  await page.evaluate(() => document.querySelector('[data-testid=admin-users] a').click());
  await wait(500);
  await settle();
  t = await text();
  log('Detail: email header:', t.includes(EMAIL));
  log('Detail: metric and target:', t.includes('Studying') && t.includes('At least 30m · daily'));
  log('Detail: today total:', /Today\s*15m/.test(t));
  log('Detail: 7-day total:', /Last 7 days\s*15m/.test(t));
  log('Detail: no goals line:', t.includes('No active goals'));
  log('Detail: back to Users:', t.includes('Users'));
  await shot('ad-03-user');

  // Nothing on the detail screen can change data.
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll('main button, main input, main select, main textarea')].length,
  );
  log('Detail: no inputs or buttons:', controls === 0);

  await press('Users');
  await settle();
  log('Back returns to list:', (await text()).includes('1 user'));

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('ad-crash');
} finally {
  await page.evaluate((k) => localStorage.removeItem(k), FLAG).catch(() => {});
  await browser.close();
}

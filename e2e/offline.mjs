// Production build + service worker: log online, then reload fully offline.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const URL_ = 'http://localhost:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const text = () => page.evaluate(() => document.body.innerText);

try {
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.locator('[role=radio]::-p-text(Create account)').click();
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await page.locator('button[type=submit]').click();
  await wait(2500);
  await page.locator('nav.fixed a[href="#/metrics"]').click();
  await page.locator('::-p-text(New metric)').click();
  await page.type('#m-name', 'Reading');
  await page.locator('::-p-text(Create metric)').click();
  await wait(500);
  await page.locator('nav.fixed a[href="#/today"]').click();
  await page.locator('::-p-aria(Add 30m to Reading)').click();
  await wait(800);

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  console.log('• Service worker active:', sw);
  await wait(1500); // let precache finish

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(3000);
  const t = await text();
  console.log('• Offline reload shows the app (not a browser error page):', t.includes('Reading'));
  console.log('• Offline reload keeps the 30m entry:', /Reading[\s\S]{0,40}30m/.test(t));
  // Log while fully offline after the reload.
  await page.locator('::-p-aria(Add 15m to Reading)').click();
  await wait(800);
  console.log('• Logging works offline after reload (45m):', /Reading[\s\S]{0,40}45m/.test(await text()));
  await page.screenshot({ path: `${OUT}20-offline-reload.png` });
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-offline-failure.png` });
} finally {
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

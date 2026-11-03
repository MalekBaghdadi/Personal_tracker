// Production build + service worker: a new version applies itself at a quiet moment, and
// never while a timer runs or a sheet is open. "A new version" is the served dist/sw.js with
// a few different bytes, which is all the browser needs to install and wait with a new worker.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_ = 'http://localhost:4173/';
const SW = fileURLToPath(new URL('../dist/sw.js', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const original = readFileSync(SW, 'utf8');

await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...a) => console.log('•', ...a);

// A new "release": different bytes each time, then the same nudge the app gets when it comes back to the front.
const nudge = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
const release = async () => {
  writeFileSync(SW, `${original}\n// release ${Date.now()}\n`);
  await nudge();
};
const waiting = () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
// The nudge is repeated: on a busy machine the app may not have registered its listener yet.
const waitingWithin = async (s) => { for (let i = 0; i < s * 2; i++) { if (await waiting()) return true; if (i % 4 === 3) await nudge(); await wait(500); } return false; };
const mark = () => page.evaluate(() => { window.__m = 1; });
const stillHere = async () => { try { return (await page.evaluate(() => window.__m)) === 1; } catch { return false; } };
const reloadedWithin = async (s) => {
  for (let i = 0; i < s * 2; i++) {
    try { if ((await page.evaluate(() => window.__m ?? null)) === null) return true; } catch { /* navigating */ }
    if (i % 4 === 3) await nudge();
    await wait(500);
  }
  return false;
};
const open = (tab) => page.locator(`nav.fixed a[href="#/${tab}"]`).click();

try {
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.locator('[role=radio]::-p-text(Create account)').click();
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await page.locator('button[type=submit]').click();
  await wait(2500);
  await open('metrics');
  await page.locator('::-p-text(New metric)').click();
  await page.type('#m-name', 'Reading');
  await page.locator('::-p-text(Create metric)').click();
  await wait(500);
  await open('today');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await wait(3000); // let precache finish
  // A page only has a worker "in charge" from its next load; a new worker waits only if one is.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(3000);
  log('The page is under the service worker:', await page.evaluate(() => !!navigator.serviceWorker.controller));

  // 1. A timer is running: the new version is found and waits.
  await page.locator('::-p-aria(Start Reading timer)').click();
  await wait(500);
  await mark();
  await release();
  log('Timer running: the new version is found and waits:', await waitingWithin(15));
  await wait(16000);
  log('Timer running: the page is not reloaded:', await stillHere());
  await page.locator('::-p-aria(Stop Reading and log it)').click();
  log('Timer stopped: it updates by itself:', await reloadedWithin(30));

  // 2. A sheet is open: same.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await wait(3000);
  await open('metrics');
  await page.locator('::-p-text(New metric)').click();
  await wait(500);
  await mark();
  await release();
  log('Sheet open: the new version is found and waits:', await waitingWithin(15));
  await wait(16000);
  log('Sheet open: the page is not reloaded:', await stillHere());
  await page.keyboard.press('Escape');
  await wait(500);
  log('Sheet closed:', !(await page.$('dialog[open]')));
  log('Sheet closed: it updates by itself:', await reloadedWithin(30));

  // 3. Nothing going on, as when the app is opened or comes back to the front: quick.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await wait(3000);
  await mark();
  await release();
  log('Quiet: it updates by itself, without a banner:', (await reloadedWithin(30)) && !(await page.evaluate(() => document.body.innerText)).includes('Update available'));
  log('Updated: nothing left waiting, the new worker is in charge:', !(await waiting()) && (await page.evaluate(() => !!navigator.serviceWorker.controller)));
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  writeFileSync(SW, original);
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
}

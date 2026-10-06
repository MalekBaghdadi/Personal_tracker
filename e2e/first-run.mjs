// First run: a new account picks its own metrics, then sets targets.
// Seeding waits for the server, which is unreachable here, so the emulator-only
// window.__e2eFirstRun hook puts the account into the first-run state.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5173/';
const EMAIL = 'e2e@logbook.test';
const PASS = 'emulator-only-pass';

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
// Click a button by its exact visible text (avoids the fixed tab bar swallowing clicks).
const press = async (label) => {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === l);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, label);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(300);
};
const pressStarting = async (prefix) => {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(l));
    if (!b) return false;
    b.click();
    return true;
  }, prefix);
  if (!ok) console.log(`FAILED: no button starting "${prefix}"`);
  await wait(300);
};
const pressed = (name) =>
  page.evaluate((n) => {
    const b = [...document.querySelectorAll('[data-testid=suggestions] button')].find((x) => x.innerText.includes(n));
    return b?.getAttribute('aria-pressed') === 'true';
  }, name);

try {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' });
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await wait(800);
  await press('Create account');
  await page.type('#email', EMAIL);
  await page.type('#password', PASS);
  await page.click('button[type=submit]');
  await wait(2500);

  await page.evaluate(() => window.__e2eFirstRun());
  await wait(800);
  let t = await text();
  log('Picker shown:', t.includes('What do you want to track?'));
  log('Suggestions listed:', t.includes('Studying') && t.includes('Water') && t.includes('Sleep'));
  log('No metrics pre-made (Next disabled):', t.includes('Pick at least one'));
  await shot('fr-01-picker');

  await pressStarting('Studying');
  await pressStarting('Gym');
  await pressStarting('Water');
  await pressStarting('Water'); // toggled back off
  log('Studying selected:', await pressed('Studying'));
  log('Water toggled off again:', !(await pressed('Water')));

  // A time metric of their own, and a count with a unit.
  await press('Add your own');
  await page.type('#ob-name', 'Piano');
  await press('Add');
  await press('Add your own');
  await page.type('#ob-name', 'Pushups');
  await press('Count');
  await page.type('#ob-unit', 'reps');
  await press('Add');
  // Typing a suggestion's name selects the suggestion instead of duplicating it.
  await press('Add your own');
  await page.type('#ob-name', 'reading');
  await press('Add');
  t = await text();
  log('Own metrics listed:', t.includes('Piano') && t.includes('reps · daily'));
  log('Typed suggestion selects it:', await pressed('Reading'));
  log('Count on button:', t.includes('Next · 5 picked'));
  await shot('fr-02-picked');

  await pressStarting('Next');
  t = await text();
  log('Targets step:', t.includes('Set your targets'));
  log('Only picks shown:', ['Studying', 'Reading', 'Gym', 'Piano', 'Pushups'].every((n) => t.includes(n)) && !t.includes('Water'));
  log('Gym asks which days:', t.includes('Which days?'));
  await shot('fr-03-targets');

  // Back keeps nothing broken; go forward again.
  await press('Back');
  log('Back returns to picker:', (await text()).includes('What do you want to track?'));
  log('Back keeps the picks:', (await pressed('Gym')) && (await text()).includes('Next · 5 picked'));
  await pressStarting('Next');

  const ids = await page.evaluate(() => [...document.querySelectorAll('input[id^="ob-"]')].map((i) => i.id));
  const studyingMin = ids.find((id) => /Studying/.test(id) && /m$/.test(id)) ?? ids.find((id) => /Studying/.test(id));
  if (studyingMin) await page.type(`[id="${studyingMin}"]`, '45');
  else console.log('FAILED: no Studying target input', ids);
  const pushups = ids.find((id) => /Pushups/.test(id));
  if (pushups) await page.type(`[id="${pushups}"]`, '50');
  await press('Start logging');
  await wait(1200);

  t = await text();
  log('Left first run:', !t.includes('Set your targets') && !t.includes('What do you want to track?'));
  await shot('fr-04-today');
  await page.goto(URL_ + '#/metrics');
  await wait(800);
  t = await text();
  log('Metrics created:', ['Studying', 'Reading', 'Gym', 'Piano', 'Pushups'].every((n) => t.includes(n)));
  log('Unpicked suggestion not created:', !t.includes('Water') && !t.includes('Calories'));
  log('Studying target saved:', /45m/.test(t));
  await shot('fr-05-metrics');

  // An account that already has metrics but isn't onboarded goes straight to targets.
  await page.evaluate(() => window.__e2eFirstRun());
  await wait(800);
  t = await text();
  log('Existing metrics skip the picker:', t.includes('Set your targets') && !t.includes('What do you want to track?'));
  await press('Skip targets for now');
  await wait(800);
  t = await text();
  log('Skip leaves first run:', !t.includes('Set your targets'));

  // Reload: first run doesn't come back.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  log('Stays done after reload:', !(await text()).includes('Set your targets'));

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('fr-crash');
} finally {
  await browser.close();
}

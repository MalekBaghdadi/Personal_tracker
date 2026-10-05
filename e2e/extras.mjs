// Weekly review (Stats), streak shading in History, session notes lists, start-earlier, import and the badge setting.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
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

// The review only shows early in a week, so pin "today" to the most recent
// Monday. Moving the clock back (never forward) keeps auth tokens valid.
// The app's day rolls over at 5am, so work from "now minus 5 hours".
const DAY_START_MS = 5 * 3600000;
const back = (new Date(Date.now() - DAY_START_MS).getDay() + 6) % 7;
await page.evaluateOnNewDocument((days) => {
  const RealDate = Date;
  const skew = -days * 86400000;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
}, back);

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const dialog = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '(no sheet)');
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const review = () => page.evaluate(() => document.querySelector('section[aria-label="Last week"]')?.innerText ?? '(no card)');
const log = (...a) => console.log('•', ...a);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = new Date(Date.now() - DAY_START_MS - back * 86400000);
const day = (offset) => ymd(new Date(monday.getTime() + offset * 86400000));

async function addEntry(metric, { h = '', m = '', count = '', date, note = '' }) {
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click(`::-p-aria(Add a custom amount to ${metric})`);
  if (count) await page.type('#entry-count', count);
  else {
    if (h) await page.type('#entry-h', h);
    if (m) await page.type('#entry-m', m);
  }
  await setVal('#entry-date', date);
  if (note) await page.type('#entry-note', note);
  await click('dialog[open] button[type=submit]');
  await wait(300);
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');
  log('App date is a Monday:', await page.evaluate(() => new Date(Date.now() - 5 * 3600000).getDay() === 1));

  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-m', '90');
  await click('::-p-text(Create metric)');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Calories');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'kcal');
  await click('::-p-text(At most)');
  await page.type('#m-target', '2200');
  await click('::-p-text(Create metric)');

  // Last week: Mon 1h with a note, Wed 2h, Tue 1800 kcal. The week before: 30m.
  await addEntry('Studying', { h: '1', date: day(-7), note: 'Read chapter 4' });
  await addEntry('Studying', { h: '2', date: day(-5) });
  await addEntry('Studying', { m: '30', date: day(-10) });
  await addEntry('Calories', { count: '1800', date: day(-6) });

  // A goal that started two weeks ago, so last week counts toward it.
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New goal)');
  await page.type('#g-target', '100');
  await setVal('#g-start', day(-14));
  await setVal('#g-deadline', day(60));
  await click('dialog[open] button[type=submit]');
  await wait(400);

  await click('nav.fixed a[href="#/today"]');
  await wait(500);
  log('Today no longer shows the review:', (await review()) === '(no card)');
  await click('nav.fixed a[href="#/stats"]');
  await wait(1500);
  const r = await review();
  log('Review card:', JSON.stringify(r));
  log('Review: Studying total 3h:', /Studying\s*\n?\s*3h/.test(r));
  log('Review: target met 1 of 7 days (only Wed reached 1h 30m):', r.includes('Target met 1 of 7 days'));
  log('Review: best day Wed, 2h:', r.includes('Best Wed, 2h'));
  log('Review: week before 30m:', r.includes('Week before 30m'));
  log('Review: calories as a daily average:', r.includes('1,800 kcal a day') && r.includes('Logged 1 of 7 days'));
  log('Review: goal moved +3h:', /\+3h, now 3h 30m of 100h/.test(r));
  await page.screenshot({ path: `${OUT}90-week-review.png` });

  // Session notes on the goal and in Stats.
  await click('nav.fixed a[href="#/today"]');
  await wait(500);
  await click('section[aria-label="Deadline goals"] a');
  await wait(1500);
  let t = await text();
  log('Goal detail lists the note:', /Session notes · 1[\s\S]*Read chapter 4/.test(t));
  await page.screenshot({ path: `${OUT}91-goal-notes.png`, fullPage: true });
  await click('nav.fixed a[href="#/stats"]');
  await wait(1500);
  t = await text();
  log('Stats lists the note:', /Notes · 1[\s\S]*Read chapter 4/.test(t));
  await click('::-p-text(Read chapter 4)');
  log('Tapping a note opens the entry:', (await dialog()).includes('Edit Studying entry'));
  await page.keyboard.press('Escape');
  await wait(300);

  // Streaks in History: Wed–Sun of last week all hit 1h 30m, so Sunday is day 5.
  for (const o of [-4, -3, -2, -1]) await addEntry('Studying', { h: '2', date: day(o) });
  await page.goto(`http://localhost:5173/#/history/${day(-1)}`);
  await wait(1200);
  await page.keyboard.press('Escape');
  await wait(400);
  const cell = (d) => page.evaluate((date) => {
    const n = Number(date.slice(8));
    const b = [...document.querySelectorAll('section[aria-label] button[aria-label]')].find((x) => x.querySelector('span')?.textContent === String(n));
    if (!b) return null;
    const c = getComputedStyle(b).backgroundColor;
    return { label: b.getAttribute('aria-label'), bg: c };
  }, d);
  // Lightness from the computed colour (oklab or rgb).
  const light = (c) => {
    const ok = c.match(/oklab\(([\d.]+)/);
    if (ok) return Number(ok[1]);
    const [r, g, b] = c.match(/[\d.]+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  let allCells = [];
  for (const o of [-5, -4, -3, -2, -1]) allCells.push(await cell(day(o)));
  log('All view labels give the average streak:', allCells[4]?.label.includes('average streak'));
  const allLight = allCells.map((c) => light(c.bg));
  log('All view gets brighter along the run:', allLight.every((v, i) => i === 0 || v >= allLight[i - 1]) && allLight[4] > allLight[0], allLight.map((v) => v.toFixed(3)).join(' '));
  await page.screenshot({ path: `${OUT}94-history-all-streaks.png` });

  await click('[role=radio]::-p-text(Studying)');
  await wait(500);
  const metricCells = [];
  for (const o of [-6, -5, -4, -3, -2, -1]) metricCells.push(await cell(day(o)));
  log('Studying: Sunday is day 5 of a streak:', metricCells[5].label.includes('day 5 of a streak'));
  log('Studying: Tuesday (missed) is not a streak day:', !metricCells[0].label.includes('of a streak'));
  const ml = metricCells.slice(1).map((c) => light(c.bg));
  log('Studying cells get brighter day by day:', ml.every((v, i) => i === 0 || v > ml[i - 1]) || ml.every((v, i) => i === 0 || v < ml[i - 1]), ml.map((v) => v.toFixed(3)).join(' '));
  log('Streak legend shown:', (await text()).includes('Streak: day 1'));
  await page.screenshot({ path: `${OUT}95-history-metric-streaks.png` });

  // Start earlier: press and hold ▶.
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  await click('nav.fixed a[href="#/today"]');
  await wait(500);
  const play = await page.$('::-p-aria(Start Studying timer)');
  const box = await play.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await wait(700);
  await page.mouse.up();
  await wait(400);
  let d = await dialog();
  log('Hold opens the start-earlier sheet:', d.includes('Start Studying earlier'));
  log('Holding did not also start a timer:', !(await text()).includes('Stop'));
  await page.screenshot({ path: `${OUT}92-start-earlier.png` });
  await click('::-p-aria(Started 15 minutes ago)');
  await wait(1200);
  t = await text();
  log('Timer bar shows ~15 minutes:', /\b15:0\d\b/.test(t), (t.match(/\d+:\d\d(:\d\d)?/) || [''])[0]);
  await click('::-p-aria(Stop Studying and log it)');
  t = await page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText ?? '');
  log('Stopping a 15m backdated timer asks for a note:', t.includes('Logged 15m to Studying') && t.includes('What did you accomplish?'));
  await click('[aria-live=polite] ::-p-aria(Dismiss)');

  // Right-click opens it too; a custom start time 40 minutes ago.
  await page.click('::-p-aria(Start Studying timer)', { button: 'right' });
  await wait(400);
  log('Right-click opens the sheet:', (await dialog()).includes('Start Studying earlier'));
  const at = await page.evaluate(() => {
    const t = new Date(Date.now() - 40 * 60000);
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  });
  await setVal('#start-at', at);
  await click('dialog[open] button[type=submit]');
  await wait(1200);
  t = await text();
  log('Custom start time gives ~40 minutes:', /\b(39|40):\d\d\b/.test(t));
  await click('::-p-aria(Stop Studying and log it)');
  await click('[aria-live=polite] ::-p-aria(Dismiss)');

  // A plain tap still starts and stops normally.
  await click('::-p-aria(Start Studying timer)');
  await wait(1200);
  log('Plain tap starts the timer:', /0:0[0-2]/.test(await text()));
  await click('::-p-aria(Stop Studying timer)');

  // Import: wrong file, then a real export (needs the server, which is unreachable here).
  await click('nav.fixed a[href="#/settings"]');
  await wait(500);
  writeFileSync(`${OUT}import-bad.json`, '{"hello": 1}');
  writeFileSync(`${OUT}import-good.json`, JSON.stringify({ format: 'personal-tracker/1', metrics: [], entries: [], items: [], goals: [] }));
  const file = await page.$('input[type=file]');
  await file.uploadFile(`${OUT}import-bad.json`);
  await wait(800);
  log('Import rejects a file that is not an export:', (await text()).includes('isn’t a Logbook JSON export'));
  await (await page.$('input[type=file]')).uploadFile(`${OUT}import-good.json`);
  await wait(16500);
  t = await text();
  log('Import says it needs a connection when offline:', t.includes('Importing needs a connection'));
  await page.screenshot({ path: `${OUT}93-settings-import-badge.png`, fullPage: true });
  log('Badge setting shown:', t.includes('App icon'));
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}99-extras-failure.png` });
} finally {
  console.log('Errors:', errors.length ? errors : 'none');
  await browser.close();
}

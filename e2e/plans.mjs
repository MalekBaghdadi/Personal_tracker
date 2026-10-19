// Plans: import the Uptime Monitor plan from pasted Markdown (preview, Cancel
// writes nothing, Create), then the queue on Today: on pace, ticking forward,
// Undo, behind on a later day with no overdue styling, Push remaining, a task
// note, Start empty with no dates, the linked timer's Mark done, History and
// export. The app's clock is pinned to the plan's dates (stored per test in
// localStorage, read before the app loads).
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const FIXTURE = readFileSync(new URL('./fixtures/uptime-plan.md', import.meta.url), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-logbook/accounts', { method: 'DELETE' }); break; } catch { await wait(1000); }
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// The pinned clock is behind the cache's real write times; Firestore notes that, harmlessly.
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach|update time that is in the future/.test(m.text())) errors.push(m.text()); });

// The app's day: 10:00 local on localStorage['e2e.day'], plus whatever __advance adds.
await page.evaluateOnNewDocument(() => {
  const RealDate = Date;
  let skew = 0;
  try {
    const day = localStorage.getItem('e2e.day');
    if (day) {
      const [y, m, d] = day.split('-').map(Number);
      skew = new RealDate(y, m - 1, d, 10, 0, 0).getTime() - RealDate.now();
    }
  } catch { /* no storage on about:blank */ }
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
  window.__advance = (ms) => { skew += ms; };
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n, fullPage = false) => page.screenshot({ path: `${OUT}${n}.png`, fullPage });
const dialogText = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const press = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const root = s === 'dialog' ? document.querySelector('dialog[open]') : document.querySelector(s);
    const all = [...(root?.querySelectorAll('button') ?? [])];
    const b = all.find((x) => x.innerText.trim() === l) ?? all.find((x) => x.innerText.trim().startsWith(l));
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(450);
};
const setDay = async (day) => {
  await page.evaluate((d) => localStorage.setItem('e2e.day', d), day);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
};
const card = () => page.evaluate(() => document.querySelector('[data-tour=today-plan]')?.innerText ?? '');
const current = () => page.evaluate(() => document.querySelector('[data-testid=plan-current]')?.innerText ?? '');
const status = () => page.evaluate(() => document.querySelector('[data-testid=plan-status]')?.innerText ?? '');
const tick = async () => { await page.click('[data-tour=today-plan-tick] button'); await wait(500); };

const importPlan = async () => {
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await press('New goal');
  await press('Plan: import from Markdown', 'dialog');
  await setVal('#plan-md', FIXTURE);
  await press('Preview', 'dialog');
};

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('e2e.day', '2026-10-19'));
  await page.reload({ waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');
  log('App date is Mon 19 Oct 2026:', (await text()).includes('Monday 19 October'));

  // ── Import: preview, Cancel writes nothing ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await press('New goal');
  log('New goal asks for a type:', (await dialogText()).includes('Amount goal') && (await dialogText()).includes('Plan: import from Markdown') && (await dialogText()).includes('Plan: start empty'));
  await press('Plan: import from Markdown', 'dialog');
  await setVal('#plan-md', FIXTURE);
  await press('Preview', 'dialog');
  const counts = await page.evaluate(() => document.querySelector('[data-testid=plan-preview-counts]')?.innerText ?? '');
  log('Preview counts:', JSON.stringify(counts));
  log('Preview: 6 sections · 30 tasks · 5 checkpoints · 19 Oct – 27 Nov · Mon–Fri:', counts === '6 sections · 30 tasks · 5 checkpoints · 19 Oct – 27 Nov · Mon–Fri');
  log('Preview: name filled from the # title:', await page.$eval('#p-name', (el) => el.value === 'Uptime Monitor: 6-week plan'));
  log('Preview: no warnings for the clean plan:', !(await page.$('dialog[open] [aria-label=Warnings]')));
  await shot('pl-01-preview');
  await press('Cancel', 'dialog');
  await wait(400);
  log('Cancel saves nothing:', !(await text()).includes('Uptime Monitor'));

  // ── Create ──
  await importPlan();
  await setVal('#p-name', 'Uptime Monitor');
  await press('Create', 'dialog');
  await wait(600);
  log('Goals list shows the plan:', (await text()).includes('Uptime Monitor') && (await text()).includes('0/30 tasks'));

  // ── Today: collapsed card, Monday's task, on pace ──
  await page.goto('http://localhost:5173/#/today');
  await wait(800);
  log('Card shows Monday’s task:', (await current()).startsWith('Create the repo'));
  log('On pace:', (await status()) === 'On pace');
  log('Collapsed: no details or link yet:', !(await card()).includes('Open the plan'));
  log('Plan name and section:', (await card()).includes('Uptime Monitor · Week 1') && (await card()).includes('0/30'));
  await shot('pl-02-today');

  // Two ticks in one day: forward twice. Today's own task keeps you on pace; the next one puts you ahead.
  await tick();
  log('Tick: Tuesday’s task, still on pace:', (await current()).startsWith('Add a health endpoint') && (await status()) === 'On pace');
  log('Undo toast:', (await text()).includes('Done: Create the repo'));
  await wait(400);
  await tick();
  log('Second tick: Wednesday’s task, 1 ahead:', (await current()).startsWith('Design the target model') && (await status()) === '1 task ahead');
  await press('Undo');
  log('Undo: back to Tuesday’s task:', (await current()).startsWith('Add a health endpoint') && (await status()) === 'On pace');
  await shot('pl-03-ticked');

  // Expand: details, need, checkpoint, next tasks, link.
  await page.click('[data-tour=today-plan] [role=button]');
  await wait(400);
  const open = await card();
  log('Expanded: details of the current task:', open.includes('Write one test for it.'));
  log('Expanded: today’s need:', open.includes('Today’s done'));
  log('Expanded: checkpoint:', open.includes('Checkpoint') && open.includes('a recorded curl session'));
  log('Expanded: next tasks and link:', open.includes('Next') && open.includes('Design the target model') && open.includes('Open the plan'));
  await shot('pl-04-expanded', true);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  log('Expanded state and the tick survive a reload:', (await card()).includes('Open the plan') && (await status()) === 'On pace' && (await card()).includes('1/30'));

  // ── Wed 21 Oct with only Monday done: behind, Tuesday still current, nothing red ──
  await setDay('2026-10-21');
  log('Wednesday: Tuesday’s task still current:', (await current()).startsWith('Add a health endpoint'));
  log('Wednesday: 1 task behind:', (await status()) === '1 task behind');
  log('Wednesday: 2 today to get back on pace:', (await card()).includes('2 today to get back on pace'));
  log('No overdue styling:', await page.evaluate(() => !document.querySelector('[data-tour=today-plan] .text-danger')));
  await shot('pl-05-behind', true);

  // ── Plan detail: push remaining by 1 work day → on pace ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.innerText.includes('Uptime Monitor'))?.click());
  await wait(800);
  log('Detail: 1 of 30, 1 behind:', (await text()).includes('of 30 tasks') && (await page.$eval('[data-testid=plan-detail-status]', (e) => e.innerText)) === '1 task behind');
  log('Detail: current section open, others folded:', await page.evaluate(() => {
    const secs = [...document.querySelectorAll('section[aria-label^="Week"]')];
    return secs.length === 6 && secs[0].querySelectorAll('li').length >= 5 && secs[1].querySelectorAll('li').length === 0;
  }));
  log('Detail: burn-up chart drawn:', !!(await page.$('.recharts-wrapper')));
  await shot('pl-06-detail', true);
  await page.evaluate(() => document.querySelector('#plan-burnup-h')?.scrollIntoView({ block: 'start' }));
  await wait(300);
  log('Burn-up draws both lines:', await page.evaluate(() => document.querySelectorAll('.recharts-line path.recharts-curve').length >= 2));
  await shot('pl-06b-burnup');
  await press('Push remaining');
  log('Push preview says on pace after:', (await dialogText()).includes('Then: On pace'));
  await press('Push 1 work day', 'dialog');
  await wait(500);
  log('After push: on pace:', (await page.$eval('[data-testid=plan-detail-status]', (e) => e.innerText)) === 'On pace');
  await press('Undo');
  log('Undo push: behind again:', (await page.$eval('[data-testid=plan-detail-status]', (e) => e.innerText)) === '1 task behind');
  await press('Push remaining');
  await press('Push 1 work day', 'dialog');
  await wait(400);

  // A task: open, add a note, Undo the edit.
  await page.evaluate(() => [...document.querySelectorAll('section[aria-label^="Week 1"] li button')].find((b) => b.innerText.includes('Add a health endpoint'))?.click());
  await wait(500);
  log('Task sheet opens with details:', await page.$eval('#t-details', (el) => el.value.includes('Write one test for it.')));
  await setVal('#t-note', 'Health check done, tests next');
  await press('Save', 'dialog');
  await wait(400);
  log('Note shows under Notes:', (await text()).includes('Health check done, tests next'));
  await press('Undo');
  log('Undo removes the note:', !(await text()).includes('Health check done, tests next'));

  // ── Linked timer: Mark done from the note prompt ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(400);
  await press('New metric');
  await page.type('#m-name', 'Uptime work');
  await press('Create metric', 'dialog');
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.innerText.includes('Uptime Monitor'))?.click());
  await wait(600);
  await press('Edit plan');
  await page.select('#p-metric', await page.$eval('#p-metric', (s) => [...s.options].find((o) => o.text === 'Uptime work').value));
  await press('Save changes', 'dialog');
  await wait(400);
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Start Uptime work timer)');
  await page.evaluate(() => window.__advance(25 * 60 * 1000));
  await wait(800);
  await click('::-p-aria(Stop Uptime work and log it)');
  const toastText = await page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText ?? '');
  log('Note prompt offers the current task:', toastText.includes('What did you accomplish?') && toastText.includes('Mark done: Add a health endpoint'));
  await shot('pl-07-timer-prompt');
  await page.evaluate(() => [...document.querySelectorAll('[aria-live=polite] button')].find((b) => b.innerText.includes('Mark done'))?.click());
  await wait(300);
  await click('::-p-aria(Add a note to this session)');
  await page.keyboard.type('Endpoint and test written');
  await page.keyboard.press('Enter');
  await wait(600);
  log('Mark done ticked it: Wednesday’s task is current:', (await current()).startsWith('Design the target model'));
  log('Card shows the logged time:', (await card()).includes('25m logged today'));

  // ── History: tasks done that day, and the note on the task ──
  await page.goto('http://localhost:5173/#/history/2026-10-21');
  await wait(800);
  const day = await dialogText();
  log('History day sheet lists the task done that day:', day.includes('Plan tasks') && day.includes('Add a health endpoint'));
  log('…and the timer entry’s note:', day.includes('Endpoint and test written'));
  await shot('pl-08-history', true);
  await page.keyboard.press('Escape');
  await wait(300);
  await page.goto('http://localhost:5173/#/metrics');
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.innerText.includes('Uptime Monitor'))?.click());
  await wait(600);
  log('The note landed on the task too:', (await text()).includes('Endpoint and test written'));

  // ── Start empty, no dates: an even pace line ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(400);
  await press('New goal');
  await press('Plan: start empty', 'dialog');
  await setVal('#p-name', 'Reading list');
  await setVal('#p-start', '2026-10-19');
  await setVal('#p-deadline', '2026-10-23');
  await press('Create plan', 'dialog');
  await wait(800);
  log('Start empty opens the new plan:', (await text()).includes('Reading list') && (await text()).includes('No tasks yet'));
  await press('Edit tasks');
  await press('Add a task');
  for (const t of ['Chapter one', 'Chapter two']) {
    await page.type('input[aria-label="New task"]', t);
    await page.keyboard.press('Enter');
    await wait(400);
  }
  await press('Done', 'section[aria-labelledby=tasks-h]');
  await press('Done editing');
  // Two undated tasks over Mon–Fri land on Wed and Fri; on Wed nothing was due before today.
  log('Undated tasks: on pace on Wednesday:', (await page.$eval('[data-testid=plan-detail-status]', (e) => e.innerText)) === 'On pace');
  await setDay('2026-10-22');
  log('…and 1 behind on Thursday:', (await page.$eval('[data-testid=plan-detail-status]', (e) => e.innerText)) === '1 task behind');

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('pl-crash');
} finally {
  await browser.close();
}

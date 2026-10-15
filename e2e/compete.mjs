// Compete. Firestore is unreachable here, so there's no second account: the
// emulator-only window.__e2eCompete hooks play the partner ("Cousin") by
// writing straight into this device's cache. Covers the pairing screen, invite
// codes, joining offline, linking a metric, the weekly race and tally, what
// gets published, link and challenge requests, the three challenge kinds,
// finished challenges and unlinking. The security rules are tested separately
// (e2e/rules.mjs, against the Firestore emulator).
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
// Headless Chrome reports reduced motion; this suite checks the animations, so turn motion on.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach|invite read failed|offline/.test(m.text())) errors.push(m.text());
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png`, fullPage: true });
const pressText = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.innerText.trim() === l);
    b?.scrollIntoView({ block: 'center' });
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(500);
};
const hook = (fn, ...args) => page.evaluate((f, a) => window.__e2eCompete[f](...a), fn, args);
const until = async (check, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await check()) return true;
    await wait(250);
  }
  return false;
};
const fitsPhone = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const card = (id) => page.evaluate((i) => [...document.querySelectorAll(`[data-testid="${i}"]`)].map((e) => e.innerText).join('\n---\n'), id);

// Dates follow the app's 5am day start; weeks start on Monday.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(Date.now() - 5 * 3600000);
const day = (offset) => ymd(new Date(now.getTime() + offset * 86400000));
const TODAY = day(0);
const weekStart = -((now.getDay() + 6) % 7);
const LAST_MON = day(weekStart - 7);
const LAST_TUE = day(weekStart - 6);
const LAST_WED = day(weekStart - 5);
const LAST_SUN = day(weekStart - 1);
const H = 3600;
const theirStudy = (days) => ({ 'their-study': { name: 'Study', type: 'duration', unit: 'h', target: H, color: '#e0a03a', icon: 'book', days } });

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  // Studying: at least 1h a day. 2h logged today.
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Studying');
  await page.type('#m-target-h', '1');
  await click('::-p-text(Create metric)');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Studying)');
  await page.type('#entry-h', '2');
  await click('dialog[open] button[type=submit]');
  await wait(400);

  // ── Not paired ──
  const tabs = await page.evaluate(() => [...document.querySelectorAll('nav.fixed a')].map((a) => a.innerText.trim()));
  log('Tab bar has Compete after Stats:', tabs.join(',') === 'Today,History,Stats,Compete,Metrics,Settings');
  await click('nav.fixed a[href="#/compete"]');
  await wait(600);
  log('Explains what is shared, notes during challenges:', (await text()).includes('notes included'));
  log('Name defaults to the email name:', (await page.$eval('#c-name', (e) => e.value)) === 'e2e');
  log('Fits a phone:', await fitsPhone());
  await shot('cp-01-setup');

  await pressText('Create invite code');
  const code = await page.$eval('[data-testid="invite-code"]', (e) => e.textContent).catch(() => '');
  log('Invite code shown, 6 unambiguous characters:', /^[A-HJKMNP-Z2-9]{6}$/.test(code));
  log('Says when it expires:', (await text()).includes('Expires'));
  await shot('cp-02-invite');
  await pressText('Cancel invite');
  log('Cancel brings back Create:', await until(async () => (await text()).includes('Create invite code')));

  await page.type('[aria-label="Invite code"]', 'abc');
  await pressText('Join');
  log('Short code refused:', (await text()).includes('six letters and numbers'));
  await page.$eval('[aria-label="Invite code"]', (e) => { e.select(); });
  await page.type('[aria-label="Invite code"]', 'abc-234');
  await pressText('Join');
  log('Joining offline says it needs a connection:', await until(async () => (await text()).includes('Joining needs a connection'), 20000));

  // ── Paired (Cousin plays the partner) ──
  await hook('pair', 'Cousin');
  log('Header shows the pair:', await until(async () => (await text()).includes('you vs Cousin')));
  log('No numbers from them yet:', (await text()).includes('Cousin hasn’t shared any numbers yet'));
  log('New challenge disabled before a link:', await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('New challenge'))?.disabled === true));

  await pressText('Link a metric');
  log('Link sheet lists Studying:', (await page.$eval('#l-metric', (e) => e.innerText)).includes('Studying (time)'));
  await pressText('Send to Cousin', 'dialog[open]');
  log('Waiting for them:', await until(async () => (await text()).includes('Waiting for Cousin to pick a metric to race your Studying')));
  await shot('cp-03-proposed');

  // They accept, starting last week so there's a finished week.
  await hook('acceptMine', 'their-study', LAST_MON);
  log('Race card appears:', await until(async () => (await card('race-card')).includes('Studying')));
  log('Me ahead with nothing from them:', (await card('race-card')).includes('You’re 2h ahead'));
  log('My target days shown:', (await card('race-card')).includes('target 1/1 day'));

  // What this account published: Studying only, numbers only.
  const published = await until(async () => !!(await hook('myScore')), 6000);
  const score = await hook('myScore');
  const m = score && Object.values(score.metrics)[0];
  log('Published after a moment:', published);
  log('Published today’s total and a hit:', !!m && m.days[TODAY]?.t === 2 * H && m.days[TODAY]?.s === 'h');
  log('Published nothing but the summary (no logs without a challenge):', !!score && Object.keys(score).sort().join(',') === 'asOf,metrics,uid,updatedAt' && Object.keys(score.metrics).length === 1 && !m.logs);

  // Their numbers: 3h today, and 1h last week (when I had nothing).
  await hook('score', TODAY, theirStudy({ [LAST_TUE]: { t: H, s: 'h' }, [TODAY]: { t: 3 * H, s: 'h' } }));
  log('They lead this week:', await until(async () => (await card('race-card')).includes('Cousin is 1h ahead')));
  log('Their metric name shown:', (await card('race-card')).includes('Studying vs Study'));
  log('Tally counts last week for them:', (await card('race-card')).includes('Weeks won: you 0 · Cousin 1'));
  log('Last week result:', (await card('race-card')).includes('Last week: Cousin won, 0m to 1h'));
  log('Freshness line:', (await text()).includes('Cousin’s numbers updated'));
  const bubble = await page.$eval('[data-testid="race-card"] [data-testid="taunt"]', (e) => ({
    speaker: e.dataset.speaker, text: e.innerText, size: parseFloat(getComputedStyle(e.querySelector('blockquote')).fontSize),
  })).catch(() => null);
  log('Trash talk is a bubble from the leader (Cousin):', bubble?.speaker === 'them' && bubble.text.includes('— Cousin'));
  log('Bubble text is big (16px+):', (bubble?.size ?? 0) >= 16);
  log('Bubble names no placeholders:', !!bubble && !/[{}]/.test(bubble.text));
  log('Crown on the leader (Cousin):', await page.evaluate(() => {
    const crown = document.querySelector('[data-testid="race-card"] [aria-label="Leading"]');
    return !!crown && crown.closest('span')?.innerText.includes('Cousin');
  }));

  // Last week's loss shows once as a banner that wobbles.
  log('Loss banner for last week:', await until(async () => (await card('result-banner')).includes('Cousin took the week on Studying')));
  log('Loss banner wobbles and Cousin taunts:', await page.$eval('[data-testid="result-banner"]', (e) => e.classList.contains('wobble') && e.querySelector('[data-testid="taunt"]')?.dataset.speaker === 'them'));
  await shot('cp-04b-loss-banner');
  await pressText('Ugh, fine');
  log('Dismissed banner stays gone:', !(await text()).includes('took the week'));
  log('Fits a phone:', await fitsPhone());
  await shot('cp-04-race');

  // Their request on a count metric I don't have.
  await hook('proposeLink', 'L-count', 'their-pushups', 'count');
  log('Link request shown:', await until(async () => (await card('link-request')).includes('Cousin wants to race a count metric')));
  log('Explains I have no count metric:', (await card('link-request')).includes('no free “at least” count metric'));
  await pressText('Decline', '[data-testid="link-request"]');
  log('Declined request goes away:', await until(async () => !(await text()).includes('wants to race')));

  // ── Challenges ──
  await pressText('New challenge');
  await page.type('#ch-amount', 'abc');
  await pressText('Send challenge', 'dialog[open]');
  log('Bad amount refused:', (await text()).includes('Enter an amount in hours'));
  await page.$eval('#ch-amount', (e) => { e.select(); });
  await page.type('#ch-amount', '5');
  await shot('cp-05-challenge-form');
  await pressText('Send challenge', 'dialog[open]');
  log('Mine waits for them:', await until(async () => (await card('challenge-card')).includes('Waiting for Cousin to accept')));
  await hook('acceptMyChallenges');
  log('Accepted: first to 5h, they lead:', await until(async () => {
    const c = await card('challenge-card');
    return c.includes('First to 5h of Studying') && c.includes('Cousin leads by 1h');
  }));

  // ── Logs on a challenge day ──
  const logs = () => card('challenge-logs');
  log('Logs section on the challenge, today:', await until(async () => (await logs()).includes('Today')));
  log('My 2h log listed:', /You\s*2h · 1 log/.test(await logs()) && (await logs()).includes('+2h'));
  log('Their logs wait for their new version:', (await logs()).includes('Cousin’s logs show up once they open'));
  log('Can’t go before the challenge started:', await page.$eval('[data-testid="challenge-logs"] [aria-label="Previous day"]', (b) => b.disabled));
  const published2 = await until(async () => {
    const sc = await hook('myScore');
    const l = sc && Object.values(sc.metrics)[0].logs;
    return !!l && l[TODAY]?.length === 1 && l[TODAY][0].v === 2 * H && l[TODAY][0].src === 'm';
  }, 6000);
  log('My challenge-day logs published:', published2);
  const at = (h) => new Date(Date.now() - h * 3600000).toISOString();
  await hook('score', TODAY, { 'their-study': { ...theirStudy({ [LAST_TUE]: { t: H, s: 'h' }, [TODAY]: { t: 3 * H, s: 'h' } })['their-study'],
    logs: { [TODAY]: [{ v: 2 * H, at: at(4), src: 't', note: 'Subnetting drills, 40 questions' }, { v: H, at: at(1), src: 'q' }] } } });
  log('Their logs with times and the note:', await until(async () => {
    const t = await logs();
    return /Cousin\s*3h · 2 logs/.test(t) && t.includes('Subnetting drills, 40 questions') && t.includes('timer') && t.includes('quick add');
  }));
  log('Timer log shows its span:', /\d\d:\d\d–\d\d:\d\d/.test(await logs()));
  // A note logged today lands in my list and in what's published, and the sheet says Cousin will see it.
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Studying)');
  log('Entry sheet says Cousin sees the note:', (await text()).includes('Cousin sees this entry and its note'));
  await page.type('#entry-m', '30');
  await page.type('#entry-note', 'Port numbers flashcards');
  await click('dialog[open] button[type=submit]');
  await wait(400);
  await page.goto('http://localhost:5173/#/compete');
  await wait(800);
  log('My new log with its note:', await until(async () => (await logs()).includes('Port numbers flashcards') && /You\s*2h 30m · 2 logs/.test(await logs())));
  log('Note published for Cousin:', await until(async () => JSON.stringify(await hook('myScore')).includes('Port numbers flashcards'), 6000));
  log('Fits a phone:', await fitsPhone());
  await page.evaluate(() => document.querySelector('[data-testid="challenge-logs"]').scrollIntoView({ block: 'center' }));
  await shot('cp-05b-logs');

  // Their challenge: most target days this week.
  const linkId = await hook('raceLinkId');
  log('Found the race link:', !!linkId);
  await hook('proposeChallenge', {
    id: 'C-days', linkId, kind: 'most_days', amount: null, startDate: day(weekStart), endDate: day(weekStart + 6),
    createdBy: '', createdAt: new Date().toISOString(), acceptedAt: null, declinedAt: null, cancelledAt: null,
  });
  log('Their challenge shown as a request:', await until(async () => (await text()).includes('Cousin challenges you')));
  await shot('cp-06-request');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('Cousin challenges you'));
    [...c.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accept').click();
  });
  log('Accepted: most target days, level at 1 each:', await until(async () => {
    const c = await card('challenge-card');
    return c.includes('Most Studying target days') && /You\s*1 day/.test(c) && /Cousin\s*1 day/.test(c);
  }));

  // A finished one: most total last week, already accepted. They had 1h, I had nothing.
  await hook('proposeChallenge', {
    id: 'C-done', linkId, kind: 'most_total', amount: null, startDate: LAST_MON, endDate: LAST_SUN,
    createdBy: '', createdAt: new Date(Date.now() - 1000).toISOString(), acceptedAt: new Date().toISOString(), declinedAt: null, cancelledAt: null,
  });
  log('Finished list shows the winner:', await until(async () => (await card('finished-challenges')).includes('Most Studying') && (await card('finished-challenges')).includes('Cousin won')));
  log('Challenge loss banner:', await until(async () => (await card('result-banner')).includes('Cousin won “Most Studying”')));
  await pressText('Ugh, fine');

  // A win: I log 2h last Wednesday, then accept "most Studying last week" (they had 1h).
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Studying)');
  await page.type('#entry-h', '2');
  await page.$eval('#entry-date', (el, val) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, LAST_WED);
  await click('dialog[open] button[type=submit]');
  await wait(400);
  await page.goto('http://localhost:5173/#/compete');
  await wait(800);
  await hook('proposeChallenge', {
    id: 'C-win', linkId, kind: 'most_total', amount: null, startDate: LAST_MON, endDate: LAST_SUN,
    createdBy: '', createdAt: new Date().toISOString(), acceptedAt: null, declinedAt: null, cancelledAt: null,
  });
  await until(async () => (await text()).includes('Cousin challenges you'));
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('Cousin challenges you'));
    [...c.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accept').click();
  });
  log('Win banner with a trophy:', await until(async () => (await card('result-banner')).includes('You won')));
  log('Confetti fires on a win:', await page.evaluate(() => !!document.querySelector('body > canvas')));
  await wait(400);
  await shot('cp-07b-win-banner');
  await pressText('Gloat');
  log('Confetti cleans up after itself:', await until(async () => page.evaluate(() => !document.querySelector('body > canvas')), 4000));
  log('Fits a phone:', await fitsPhone());
  await shot('cp-07-challenges');

  // Calling one off.
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('First to'));
    [...c.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Call it off').click();
  });
  await wait(300);
  await pressText('Call it off', '[data-testid="challenge-card"] div.rounded-lg.bg-s2');
  log('Called-off challenge gone:', await until(async () => !(await card('challenge-card')).includes('First to')));

  // ── Changing my name ──
  log('Shows the name they see:', (await page.$eval('[data-testid="my-name"]', (e) => e.textContent)) === 'Me');
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="my-name"]').closest('div');
    [...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Change').click();
  });
  await wait(300);
  await page.$eval('#c-rename', (e) => { e.select(); });
  await page.keyboard.press('Backspace');
  await pressText('Save');
  log('Empty name refused:', (await text()).includes('Enter a name.'));
  await page.type('#c-rename', 'Malek');
  await shot('cp-09-rename');
  await pressText('Save');
  log('New name shown:', await until(async () => (await page.$eval('[data-testid="my-name"]', (e) => e.textContent).catch(() => '')) === 'Malek'));
  log('Toast confirms:', (await text()).includes('Cousin now sees you as Malek'));

  // ── Unlink ──
  await pressText('Unlink from Cousin');
  log('Unlink asks first:', (await text()).includes('You stop sharing numbers'));
  await pressText('Unlink');
  log('Back to the setup screen:', await until(async () => (await text()).includes('Create invite code')));
  await shot('cp-08-unlinked');
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('cp-error').catch(() => {});
} finally {
  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
}

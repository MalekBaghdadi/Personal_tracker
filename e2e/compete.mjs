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
// The other suites ask for reduced motion; this one checks the animations, so turn motion on.
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
// Compete's tabs: Races, Challenges (with a count), History.
const tab = async (name) => {
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll('[data-testid="compete-tabs"] [role=radio]')].find((x) => x.innerText.trim().startsWith(n));
    b?.click();
    return !!b;
  }, name);
  if (!ok) console.log(`FAILED: no tab "${name}"`);
  await wait(400);
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
  log('Tab bar has Compete after Stats:', tabs.join(',') === 'Today,History,Stats,Compete,Metrics,Profile');
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
  log('Scoreboard shows the pair:', await until(async () => (await card('scoreboard')).includes('Cousin') && (await card('scoreboard')).includes('Weeks won')));
  log('No numbers from them yet:', (await text()).includes('Cousin hasn’t shared any numbers yet'));
  await tab('Challenges');
  log('New challenge disabled before a link:', await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('New challenge'))?.disabled === true));
  await tab('Races');

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
  log('Scoreboard: weeks won 0 to 1:', /0\s*Weeks won\s*1/.test(await card('scoreboard')));
  log('Fits a phone:', await fitsPhone());
  await shot('cp-04-race');

  // ── More than one metric on my side: Network+ joins Studying ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(600);
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Network+');
  await page.type('#m-target-h', '1');
  await click('::-p-text(Create metric)');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Network+)');
  await page.type('#entry-h', '1');
  await click('dialog[open] button[type=submit]');
  await wait(400);
  await page.goto('http://localhost:5173/#/compete');
  await wait(800);
  log('Still behind before adding it:', (await card('race-card')).includes('Cousin is 1h ahead'));
  await pressText('Add metric', '[data-testid="race-card"]');
  log('Sheet lists my side and theirs:', await until(async () => {
    const t = await card('team-sheet');
    return t.includes('Your side') && t.includes('Studying') && t.includes('Cousin’s side') && t.includes('Study');
  }));
  log('Network+ offered to add:', (await page.$eval('#t-add', (e) => e.innerText)).includes('Network+'));
  await shot('cp-04c-team-sheet');
  await pressText('Add', 'dialog[open]');
  log('Network+ now on my side:', await until(async () => (await card('team-sheet')).includes('Added today')));
  await page.keyboard.press('Escape');
  await wait(400);
  log('Card names both of mine:', await until(async () => (await card('race-card')).includes('Studying & Network+ vs Study')));
  log('Both summed this week, level at 3h:', /You\s*3h/.test(await card('race-card')) && (await card('race-verdict')).includes('Level'));
  log('Both published:', await until(async () => Object.keys((await hook('myScore'))?.metrics ?? {}).length === 2, 6000));
  log('Last week unchanged (still their win):', (await card('race-card')).includes('Last week: Cousin won'));
  log('Fits a phone:', await fitsPhone());
  await shot('cp-04d-two-metrics');
  // Take it off again: it stops counting this week.
  await pressText('Add metric', '[data-testid="race-card"]');
  await pressText('Remove', '[data-testid="team-sheet"]');
  log('Removing asks first:', (await card('team-sheet')).includes('stops counting toward this week'));
  await pressText('Remove', '[data-testid="team-sheet"]');
  log('Network+ off my side:', await until(async () => !(await card('team-sheet')).includes('Added today')));
  await page.keyboard.press('Escape');
  await wait(400);
  log('Back to Studying alone, 1h behind:', await until(async () => (await card('race-verdict')).includes('Cousin is 1h ahead') && !(await card('race-card')).includes('Network+')));

  // ── A check-off on my side: each Gym check counts as 45m, then 1h from today ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(600);
  await click('::-p-text(New metric)');
  await click('[aria-label="Measured as"] [role=radio]::-p-text(Check off)');
  await page.type('#m-name', 'Gym');
  await click('::-p-text(Create metric)');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  await click('[data-tour=today-check]');
  await page.goto('http://localhost:5173/#/compete');
  await wait(800);
  await pressText('Add metric', '[data-testid="race-card"]');
  await until(async () => (await card('team-sheet')).includes('Your side'));
  log('Gym offered as a check-off:', (await page.$eval('#t-add', (e) => e.innerText)).includes('Gym (check off)'));
  await page.select('#t-add', await page.$eval('#t-add', (e) => [...e.options].find((o) => o.text.startsWith('Gym')).value));
  await wait(300);
  log('Picking it asks what a check counts as:', (await card('team-sheet')).includes('Each Gym check counts as'));
  await pressText('Add', '[data-testid="worth-field"]');
  log('A value is required:', (await card('team-sheet')).includes('Enter how much one Gym check counts as'));
  await page.type('#worth-add-m', '45');
  await shot('cp-04e-check-worth');
  await pressText('Add', '[data-testid="worth-field"]');
  log('Gym on my side at 45m a check:', await until(async () => (await card('team-sheet')).includes('✓ = 45m a day')));
  log('Toast says what a check counts as:', (await page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText ?? '')).includes('each check counts as 45m'));
  await page.keyboard.press('Escape');
  await wait(400);
  log('Card names Gym on my side:', await until(async () => (await card('race-card')).includes('Studying & Gym vs Study')));
  log('Today’s check adds 45m: 15m behind:', await until(async () => (await card('race-verdict')).includes('Cousin is 15m ahead')));
  const gymOut = async () => Object.values((await hook('myScore'))?.metrics ?? {}).find((m) => m.name === 'Gym');
  log('Published as time, 45m on today, a target day:', await until(async () => {
    const g = await gymOut();
    return g?.type === 'duration' && g.per === 45 * 60 && g.days[TODAY]?.t === 45 * 60 && g.days[TODAY]?.s === 'h';
  }, 6000));

  await pressText('Add metric', '[data-testid="race-card"]');
  await pressText('Change', '[data-testid="team-sheet"]');
  log('Change shows the current value:', (await page.$eval('#worth-edit-m', (e) => e.value)) === '45');
  await page.$eval('#worth-edit-m', (e) => { e.select(); });
  await page.keyboard.press('Backspace');
  await page.type('#worth-edit-h', '1');
  log('Explains it applies from today:', (await card('team-sheet')).includes('From today on. Days already checked keep the value they had.'));
  await pressText('Save', '[data-testid="team-sheet"]');
  log('Now 1h a check:', await until(async () => (await card('team-sheet')).includes('✓ = 1h a day')));
  await page.keyboard.press('Escape');
  await wait(400);
  log('Today’s check now 1h: level at 3h:', await until(async () => (await card('race-verdict')).includes('Level')));
  log('Published at 1h for today:', await until(async () => {
    const g = await gymOut();
    return g?.days[TODAY]?.t === H && g.per === H;
  }, 6000));

  // Their check-off shows its value on their side.
  await hook('theirExtra', 'their-duo', 30 * 60);
  await hook('score', TODAY, { ...theirStudy({ [LAST_TUE]: { t: H, s: 'h' }, [TODAY]: { t: 3 * H, s: 'h' } }), 'their-duo': { name: 'Duolingo', type: 'duration', unit: 'h', target: 30 * 60, per: 30 * 60, color: '#28a592', icon: 'languages', days: { [TODAY]: { t: 30 * 60, s: 'h' } } } });
  await wait(500);
  await pressText('Add metric', '[data-testid="race-card"]');
  log('Their check-off shows its value:', await until(async () => /Duolingo\s*✓ = 30m a day/.test(await card('team-sheet'))));
  await shot('cp-04f-check-sides');
  // Off again, so the rest of the suite runs on Studying alone.
  await pressText('Remove', '[data-testid="team-sheet"]');
  await pressText('Remove', '[data-testid="team-sheet"]');
  await page.keyboard.press('Escape');
  await wait(400);
  log('Gym off my side, Cousin 1h 30m ahead with Duolingo:', await until(async () => (await card('race-verdict')).includes('Cousin is 1h 30m ahead') && !(await card('race-card')).includes('Gym')));
  await hook('score', TODAY, theirStudy({ [LAST_TUE]: { t: H, s: 'h' }, [TODAY]: { t: 3 * H, s: 'h' } }));
  log('Duolingo unpublished: back to 1h behind:', await until(async () => (await card('race-verdict')).includes('Cousin is 1h ahead')));

  // Their request on a count metric I don't have.
  await hook('proposeLink', 'L-count', 'their-pushups', 'count');
  log('Link request shown:', await until(async () => (await card('link-request')).includes('Cousin wants to race a count metric')));
  log('Explains I have no count metric:', (await card('link-request')).includes('no free “at least” count metric'));
  await pressText('Decline', '[data-testid="link-request"]');
  log('Declined request goes away:', await until(async () => !(await text()).includes('wants to race')));

  // ── Challenges ──
  await tab('Challenges');
  await pressText('New challenge');
  await page.type('#ch-amount', 'abc');
  await pressText('Send challenge', 'dialog[open]');
  log('Bad amount refused:', (await text()).includes('Enter an amount in hours'));
  await page.$eval('#ch-amount', (e) => { e.select(); });
  await page.type('#ch-amount', '5');
  log('Times are off by default (no time fields):', !(await page.$('#ch-start-time')));
  await page.type('#ch-stake', 'a shawarma');
  await shot('cp-05-challenge-form');
  await pressText('Send challenge', 'dialog[open]');
  log('Mine waits for them:', await until(async () => (await card('challenge-card')).includes('Waiting for Cousin to accept')));
  await hook('acceptMyChallenges');
  log('Accepted: first to 5h, they lead:', await until(async () => {
    const c = await card('challenge-card');
    return c.includes('First to 5h of Studying') && c.includes('Cousin leads by 1h');
  }));
  log('Stake shown on the card:', (await card('challenge-stake')).includes('Winner gets a shawarma'));

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
  const theirWithLogs = { 'their-study': { ...theirStudy({ [LAST_TUE]: { t: H, s: 'h' }, [TODAY]: { t: 3 * H, s: 'h' } })['their-study'],
    logs: { [TODAY]: [{ v: 2 * H, at: at(4), src: 't', note: 'Subnetting drills, 40 questions' }, { v: H, at: at(1), src: 'q' }] } } };
  await hook('score', TODAY, theirWithLogs);
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
  log('Challenge loss banner:', await until(async () => (await card('result-banner')).includes('Cousin won “Most Studying”')));
  await pressText('Ugh, fine');
  await tab('History');
  log('History lists the finished challenge and its winner:', await until(async () => (await card('finished-challenges')).includes('Most Studying') && (await card('finished-challenges')).includes('Cousin won')));
  log('History lists last week:', (await card('past-weeks')).includes('Cousin won'));
  log('Scoreboard counts the challenge:', /0\s*Challenges won\s*1/.test(await card('scoreboard')));
  await shot('cp-07c-history');
  await tab('Challenges');

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

  // ── A challenge with times: the last 3 hours to 2 hours from now, most total ──
  const setField = (sel, val) => page.$eval(sel, (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, val);
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  await pressText('New challenge');
  await pressText('Most', 'dialog[open]');
  await pressText('Set start and end times', 'dialog[open]');
  log('Time fields appear:', !!(await page.$('#ch-start-time')) && !!(await page.$('#ch-end-time')));
  const winStart = new Date(Date.now() - 3 * 3600000);
  const winEnd = new Date(Date.now() + 2 * 3600000);
  // End before the start is refused.
  await setField('#ch-start', ymd(winStart));
  await setField('#ch-start-time', hm(winStart));
  await setField('#ch-end', ymd(winStart));
  await setField('#ch-end-time', hm(new Date(winStart.getTime() - 60000)));
  await pressText('Send challenge', 'dialog[open]');
  log('End before start refused:', (await text()).includes('The end has to be after the start.'));
  await setField('#ch-end', ymd(winEnd));
  await setField('#ch-end-time', hm(winEnd));
  await shot('cp-05c-timed-form');
  await pressText('Send challenge', 'dialog[open]');
  await hook('acceptMyChallenges');
  const timedCard = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="challenge-card"]')]
    .find((e) => /(AM|PM|midnight).* – /.test(e.querySelector('[data-testid="challenge-when"]')?.innerText ?? ''))?.innerText ?? '');
  // Mine: 2h + 30m, both logged in the last few minutes. Theirs: a 2h timer from 4h ago (1h inside) and a 1h quick add.
  log('Timed card counts only inside the window (2h 30m vs 2h):', await until(async () => {
    const c = await timedCard();
    // The time field takes whole minutes, so their part-inside timer can be a few seconds under 1h.
    return c.includes('Most Studying') && /You\s*2h 30m/.test(c) && /Cousin\s*(2h|1h 59m)/.test(c) && /You lead by (30|29)m/.test(c);
  }));
  log('Partly-inside timer shows the part that counts:', (await timedCard()).includes('+1h') && (await timedCard()).includes('of 2h'));
  log('Fits a phone:', await fitsPhone());
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="challenge-card"]')].at(-1).scrollIntoView({ block: 'center' }));
  await shot('cp-05d-timed-card');

  // ── Changing the end of a running challenge, with the new end spelled out ──
  const timedWhen = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="challenge-card"]')]
    .find((e) => /(AM|PM|midnight).* – /.test(e.querySelector('[data-testid="challenge-when"]')?.innerText ?? ''))
    ?.querySelector('[data-testid="challenge-when"]').innerText ?? '');
  const endNoteText = () => page.$eval('[data-testid="challenge-end-edit"] [data-testid="end-note"]', (e) => e.innerText);
  const whenBefore = await timedWhen();
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => /(AM|PM|midnight).* – /.test(e.querySelector('[data-testid="challenge-when"]')?.innerText ?? ''));
    c.querySelector('[data-testid="challenge-change-end"]').click();
  });
  await wait(300);
  const editTime = '[data-testid="challenge-end-edit"] input[type="time"]';
  const editDate = '[data-testid="challenge-end-edit"] input[type="date"]';
  log('Change end opens with the current end spelled out:', /^Ends .*(AM|PM)/.test(await endNoteText()));
  await setField(editTime, '12:00');
  log('12:00 says noon, and what 12 PM / 12 AM mean:', (await endNoteText()).includes('12:00 PM (noon)') && (await endNoteText()).includes('12 PM is noon and 12 AM is midnight'));
  await setField(editTime, '00:00');
  log('00:00 says midnight and names both days:', /midnight, \w{3} \d+ → \w{3} \d+ \w{3}/.test(await endNoteText()));
  await setField(editTime, '18:45');
  log('Other times have no extra hint:', (await endNoteText()).includes('6:45 PM') && !(await endNoteText()).includes('is noon'));
  await shot('cp-05f-change-end');
  // An end before the start, and one that already passed, are both refused.
  await setField(editDate, ymd(new Date(Date.now() - 2 * 86400000)));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('End before the start refused:', (await text()).includes('The end has to be after the start.'));
  await setField(editDate, ymd(new Date(Date.now() - 3600000)));
  await setField(editTime, hm(new Date(Date.now() - 3600000)));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('An end in the past points to End it now:', (await text()).includes('To stop it now, use “End it now”.'));
  // A real change: an hour later than before.
  const later = new Date(winEnd.getTime() + 3600000);
  await setField(editDate, ymd(later));
  await setField(editTime, hm(later));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('New end saved and shown on the card:', await until(async () => (await timedWhen()) !== whenBefore && !(await page.$('[data-testid="challenge-end-edit"]'))));
  log('Card says who moved it and what it was:', await until(async () => /End moved by you, was /.test(await card('challenge-end-changed'))));
  log('Totals untouched by moving the end:', /You lead by (30|29)m/.test(await timedCard()));

  // ── Ending a challenge early: asks first, then the leader at that moment wins ──
  const endTimed = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => /(AM|PM|midnight).* – /.test(e.querySelector('[data-testid="challenge-when"]')?.innerText ?? ''));
    c.querySelector('[data-testid="challenge-end"]').click();
  });
  await endTimed();
  await wait(300);
  const confirmText = await card('challenge-end-confirm');
  log('End it now asks first, saying who’d win:', confirmText.includes('Are you sure you want to end it now?') && confirmText.includes('you’re ahead by') && confirmText.includes('so you’d win'));
  await shot('cp-05e-end-confirm');
  await pressText('Keep going', '[data-testid="challenge-end-confirm"]');
  log('Keep going leaves it running:', !(await page.$('[data-testid="challenge-end-confirm"]')) && /You lead by (30|29)m/.test(await timedCard()));
  await endTimed();
  await wait(300);
  await pressText('End it now', '[data-testid="challenge-end-confirm"]');
  log('Ended: waits for Cousin’s numbers after that moment:', await until(async () => (await text()).includes('Ended early by you') && (await text()).includes('Waiting for Cousin’s numbers to settle it')));
  log('Ending republishes mine:', await until(async () => {
    const [sc, now] = [await hook('myScore'), new Date(Date.now() - 10000).toISOString()];
    return !!sc && sc.updatedAt > now;
  }, 6000));
  // Their app publishes again (nothing new): I was ahead at that moment, so I win.
  await hook('score', TODAY, theirWithLogs);
  log('Ended early: the leader at that moment wins:', await until(async () => (await card('result-banner')).includes('You won “Most Studying”')));
  await pressText('Gloat');
  log('Ended one moves to History:', await until(async () => !(await text()).includes('Ended early by you')));

  // Whole-day challenges: end date only, with the day rollover spelled out.
  const firstToCard = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('First to'))?.innerText ?? '');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('First to'));
    c.querySelector('[data-testid="challenge-change-end"]').click();
  });
  await wait(300);
  log('Whole-day change: date only, with the rollover spelled out:', !(await page.$(editTime)) && /until 5:00 AM the next morning/.test(await endNoteText()));
  await setField(editDate, ymd(new Date(Date.now() - 3 * 86400000)));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('Whole-day end before today refused:', (await text()).includes('The end has to be today or later.') || (await text()).includes('The end can’t be before the start.'));
  await setField(editDate, ymd(new Date(Date.now() + 2 * 86400000)));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('Whole-day end moved and noted:', await until(async () => /End moved by you, was /.test(await firstToCard()) && !(await page.$('[data-testid="challenge-end-edit"]'))));

  // Calling one off.
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('First to'));
    [...c.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Call it off').click();
  });
  await wait(300);
  await pressText('Call it off', '[data-testid="challenge-card"] div.rounded-lg.bg-s2');
  log('Called-off challenge gone:', await until(async () => !(await card('challenge-card')).includes('First to')));

  // ── Best of 3 ──
  // Made up front: three weeks, one card, one accept. Dates follow the app's 5am day.
  await tab('Challenges');
  const dm = (offset) => { const [y, m, d] = day(offset).split('-').map(Number); return `${d} ${new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short' })}`; };
  const cardWith = (needle) => page.evaluate((n) => [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes(n))?.innerText ?? '', needle);
  const rowsOf = (needle) => page.evaluate((n) => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes(n));
    return c ? [...c.querySelectorAll('[data-testid="series-week"]')].map((e) => e.innerText.replace(/\s+/g, ' ')) : [];
  }, needle);
  const inCard = (needle, sel) => page.evaluate((n, s) => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes(n));
    c?.querySelector(s)?.click();
    return !!c?.querySelector(s);
  }, needle, sel);

  await pressText('New challenge');
  await pressText('Most', 'dialog[open]');
  log('Best of 3 is off by default:', !(await page.$('[data-testid="series-preview"]')));
  await pressText('Best of 3', 'dialog[open]');
  log('Weeks 2 and 3 are previewed with their dates:', await until(async () => /Week 2: \w{3} \d+ \w{3} – \w{3} \d+ \w{3}\. Week 3: \w{3} \d+ \w{3} – \w{3} \d+ \w{3}\./.test(await card('series-preview'))));
  log('The prize is for the series winner:', (await page.$eval('label[for="ch-stake"]', (e) => e.innerText)).startsWith('Series winner gets'));
  await page.type('#ch-stake', 'a pizza');
  await shot('cp-10-series-form');
  await pressText('Send challenge', 'dialog[open]');
  log('One card for all three weeks, waiting for Cousin:', await until(async () => {
    const c = await cardWith('a pizza');
    return c.includes('Best of 3 · Week 1 of 3') && c.includes('Waiting for Cousin to accept');
  }));
  log('It lists three weeks:', (await rowsOf('a pizza')).length === 3);
  await hook('acceptMyChallenges');
  log('One accept covers all three: week 1 in play, the others not started:', await until(async () => {
    const rows = await rowsOf('a pizza');
    return rows.length === 3 && rows[0].endsWith('In play') && rows[1].endsWith('Not started') && rows[2].endsWith('Not started');
  }));
  log('Score in weeks starts level, prize is the series’:', (await cardWith('a pizza')).includes('You 0 – 0 Cousin') && (await cardWith('a pizza')).includes('Series winner gets a pizza'));
  log('No End it now on a week of a best of 3:', !(await page.$('[data-testid="challenge-card"]:has([data-testid="series-strip"]) [data-testid="challenge-end"]')));
  await shot('cp-10b-series-card');

  // Change end moves the later weeks with it, so they stay back to back.
  await inCard('a pizza', '[data-testid="challenge-change-end"]');
  await wait(300);
  log('Change end says the later weeks move too:', (await text()).includes('The weeks after this one move with it'));
  await setField(editDate, day(8));
  await pressText('Save', '[data-testid="challenge-end-edit"]');
  log('Weeks 2 and 3 moved by the same two days:', await until(async () => {
    const r = await rowsOf('a pizza');
    return r.length === 3 && r[0].includes(dm(8)) && r[1].includes(dm(9)) && r[1].includes(dm(15)) && r[2].includes(dm(16)) && r[2].includes(dm(22));
  }));

  // A running challenge (their "most target days") becomes week 1 of a best of 3.
  log('A plain running challenge offers it:', await inCard('target days', '[data-testid="challenge-make-series"]'));
  await wait(300);
  log('Making a series asks first:', (await card('series-confirm')).includes('Make this week 1 of a best of 3?'));
  await shot('cp-10c-make-series');
  await pressText('Keep it as is', '[data-testid="series-confirm"]');
  log('Keeping it leaves it plain:', !(await page.$('[data-testid="series-confirm"]')) && (await rowsOf('target days')).length === 0);
  await inCard('target days', '[data-testid="challenge-make-series"]');
  await wait(300);
  await pressText('Make it a best of 3', '[data-testid="series-confirm"]');
  log('It becomes week 1 of 3 and says who made it:', await until(async () => {
    const c = await cardWith('target days');
    return c.includes('Best of 3 · Week 1 of 3') && c.includes('You made this a best of 3.');
  }));
  log('Weeks 2 and 3 follow, already accepted:', await until(async () => {
    const r = await rowsOf('target days');
    return r.length === 3 && r[0].endsWith('In play') && r[1].endsWith('Not started') && r[1].includes(weekStart + 7 === 1 ? 'Tomorrow' : dm(weekStart + 7)) && r[2].endsWith('Not started');
  }));
  log('A series made from a running one can’t be made again:', !(await page.$('[data-testid="challenge-card"]:has([data-testid="series-strip"]) [data-testid="challenge-make-series"]')));

  // Their best of 3 arrives as one request, not three.
  const theirWeek = (n) => ({
    id: `E${n}`, linkId, kind: 'most_total', amount: null, startDate: day(weekStart + 7 * (n - 1)), endDate: day(weekStart + 7 * (n - 1) + 6), startAt: null, endAt: null,
    stake: 'a coffee', createdBy: '', createdAt: new Date(Date.now() + n).toISOString(), acceptedAt: null, declinedAt: null, cancelledAt: null, series: { id: 'S-theirs', round: n, of: 3 },
  });
  for (const n of [1, 2, 3]) await hook('proposeChallenge', theirWeek(n));
  log('Their best of 3 is one request:', await until(async () => (await text()).includes('Cousin challenges you')));
  log('Only one card, the prize is the series’:', await page.evaluate(() => {
    const cs = [...document.querySelectorAll('[data-testid="challenge-card"]')].filter((e) => e.innerText.includes('Cousin challenges you'));
    return cs.length === 1 && cs[0].innerText.includes('Best of 3 · Week 1 of 3') && cs[0].innerText.includes('Series winner gets a coffee');
  }));
  await shot('cp-10d-series-request');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-testid="challenge-card"]')].find((e) => e.innerText.includes('Cousin challenges you'));
    [...c.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accept').click();
  });
  log('Accepting accepts all three weeks:', await until(async () => {
    const r = await rowsOf('a coffee');
    return r.length === 3 && r[0].endsWith('In play') && r[1].endsWith('Not started') && !(await text()).includes('Cousin challenges you');
  }));

  // Calling off the converted one cancels it whole.
  await inCard('target days', '[data-testid="challenge-call-off"]');
  await wait(300);
  log('Call off asks about the whole series:', (await text()).includes('Call off the whole best of 3?'));
  await pressText('Call off the series', '[data-testid="challenge-call-off-confirm"]');
  log('Called-off series is gone:', await until(async () => !(await card('challenge-card')).includes('target days')));

  // A settled series: three finished weeks in the past. I take weeks 2 and 3 (1h on last Friday), they take week 1.
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  await click('::-p-aria(Add a custom amount to Studying)');
  await page.type('#entry-h', '1');
  await page.$eval('#entry-date', (el, val) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, day(weekStart - 3));
  await click('dialog[open] button[type=submit]');
  await wait(400);
  await page.goto('http://localhost:5173/#/compete');
  await wait(800);
  const wonRow = async () => (/(\d+)\s*Challenges won\s*(\d+)/.exec(await card('scoreboard')) ?? []).slice(1).map(Number);
  const [wonMe, wonThem] = await wonRow();
  const past = (n, from, to) => ({
    id: `S${n}`, linkId, kind: 'most_total', amount: null, startDate: from, endDate: to, startAt: null, endAt: null, stake: 'a trip',
    createdBy: '', createdAt: new Date(Date.now() - 4000 + n * 1000).toISOString(), acceptedAt: new Date().toISOString(), declinedAt: null, cancelledAt: null, series: { id: 'S-done', round: n, of: 3 },
  });
  await hook('proposeChallenge', past(1, LAST_MON, LAST_TUE));
  await hook('proposeChallenge', past(2, LAST_WED, day(weekStart - 4)));
  await hook('proposeChallenge', past(3, day(weekStart - 3), LAST_SUN));
  const banners = [];
  for (let i = 0; i < 8; i++) {
    if (!(await until(async () => !!(await page.$('[data-testid="result-banner"]')), i === 0 ? 8000 : 1500))) break;
    banners.push(await card('result-banner'));
    await page.evaluate(() => document.querySelector('[data-testid="result-banner"] button').click());
    await wait(600);
  }
  log('Each week gets its own banner, with no prize:', ['took week 1 of 3', 'You won week 2 of 3', 'You won week 3 of 3'].every((t) => banners.some((b) => b.includes(t))) && !banners.some((b) => /week \d of 3/.test(b) && b.includes('a trip')));
  log('The series gets one banner with the prize and the score in weeks:', banners.filter((b) => b.includes('You won the best of 3')).length === 1 && banners.some((b) => b.includes('You get a trip') && b.includes('2–1 in weeks')));
  await tab('History');
  log('History lists the series once, with its score:', await until(async () => {
    const f = await card('finished-challenges');
    return f.includes('Best of 3 · Most Studying') && f.includes('2–1 in weeks') && f.includes('Winner got a trip');
  }));
  const [wonMe2, wonThem2] = await wonRow();
  log('The scoreboard counts the series as one challenge, not three:', wonMe2 === wonMe + 1 && wonThem2 === wonThem);
  await shot('cp-10e-series-history');
  await tab('Challenges');

  // ── Changing my name ──
  await tab('History');
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

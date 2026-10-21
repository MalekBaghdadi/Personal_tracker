// Achievements: a long timer session unlocks themed cards, the banner drops
// in, Collect opens the reveal, cards flip into the binder, XP and levels
// move, pinning and titles stick after a reload, the binders are a deck you
// swipe through (targeted ones linked to metrics, general ones not, greyed
// ones at the end), linking moves a metric's cards, locked cards show
// progress, secrets stay hidden, Settings sits
// behind the profile's gear, and sharing with a Compete partner (played by
// the emulator-only hooks) puts up and takes down a summary. Runs with
// motion on, like the Compete suite: flips and confetti are the point.
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
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach|offline/.test(m.text())) errors.push(m.text()); });

// A clock we can move forward, so a two-hour session doesn't take two hours.
await page.evaluateOnNewDocument(() => {
  const RealDate = Date;
  let skew = Number(sessionStorage.getItem('e2e.skew') || 0);
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); }
    static now() { return RealDate.now() + skew; }
  }
  window.Date = FakeDate;
  window.__advance = (ms) => { skew += ms; sessionStorage.setItem('e2e.skew', String(skew)); };
});

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const log = (...a) => console.log('•', ...a);
const shot = (n, fullPage = false) => page.screenshot({ path: `${OUT}${n}.png`, fullPage });
const until = async (check, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await check()) return true;
    await wait(250);
  }
  return false;
};
const pressText = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const root = s === 'dialog' ? [...document.querySelectorAll('dialog[open]')].pop() : document.querySelector(s);
    const b = [...(root?.querySelectorAll('button, a') ?? [])].find((x) => x.innerText.trim() === l || x.getAttribute('aria-label') === l);
    b?.scrollIntoView({ block: 'center' });
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(500);
};
const go = async (hash) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await wait(900);
};
const fitsPhone = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const banner = () => page.evaluate(() => document.querySelector('[data-testid=ach-banner]')?.innerText ?? null);
const badge = () => page.evaluate(() => document.querySelector('nav.fixed [data-testid=profile-badge]')?.getAttribute('data-count') ?? null);
const reveal = () => page.evaluate(() => document.querySelector('dialog[open][data-testid=reveal]')?.innerText ?? null);
const sheet = () => page.evaluate(() => document.querySelector('dialog[open] [data-testid=card-sheet]')?.innerText ?? null);
const ladderState = (ladder) => page.evaluate((l) => [...document.querySelectorAll(`[data-ladder="${l}"] li button`)].map((b) => b.getAttribute('aria-label')), ladder);
const openMini = async (ladder, i) => {
  await page.evaluate((l, n) => {
    const b = document.querySelectorAll(`[data-ladder="${l}"] li button`)[n];
    b.scrollIntoView({ block: 'center' });
    b.click();
  }, ladder, i);
  await wait(600);
};
const closeSheet = async () => { await page.keyboard.press('Escape'); await wait(500); };
// The binder in front of the deck: its id, kind, linked metrics, whether it's active, and its text.
const binder = () => page.evaluate(() => {
  const front = document.querySelector('.binder-page[data-front=true] [data-testid^=group-]');
  return {
    id: front?.dataset.testid?.replace('group-', ''),
    active: front?.dataset.active,
    kind: front?.querySelector('[data-testid=binder-kind]')?.textContent,
    linked: front?.querySelector('[data-testid=binder-linked]')?.textContent ?? null,
    text: front?.innerText ?? '',
  };
});
const pressTab = async (name) => {
  await page.evaluate((n) => [...document.querySelectorAll('[role=tablist][aria-label=Binders] [role=tab]')].find((t) => t.innerText.trim() === n)?.click(), name);
  await wait(900);
};
// A finger swipe across the deck: -1 to the binder before, 1 to the one after.
const swipe = async (dir) => {
  await page.$eval('.binder-deck', (e) => e.scrollIntoView({ block: 'start' }));
  await wait(400);
  const box = await page.$eval('.binder-deck', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + 60, w: r.width }; });
  const from = dir > 0 ? box.x + box.w * 0.8 : box.x + box.w * 0.2;
  const to = dir > 0 ? box.x + box.w * 0.15 : box.x + box.w * 0.85;
  await page.touchscreen.touchStart(from, box.y);
  for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(from + ((to - from) * i) / 8, box.y);
  await page.touchscreen.touchEnd();
  await wait(1200);
};

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  // The banner is opt-in for browser tests, like tours.
  await page.evaluate(() => { localStorage.setItem('logbook:e2e-ach', '1'); sessionStorage.removeItem('e2e.skew'); });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  // ── Tabs: Profile replaces Settings on phones ──
  const tabs = await page.evaluate(() => [...document.querySelectorAll('nav.fixed a')].map((a) => a.innerText.trim()));
  log('Tab bar ends with Profile, no Settings:', tabs.join(',') === 'Today,History,Stats,Compete,Metrics,Profile');

  // ── A metric with a Study theme picked in the editor (its icon alone says Other) ──
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'MCAT prep');
  await page.type('#m-target-h', '1');
  const followsIcon = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Achievement binder"] [role=radio]')].find((b) => b.getAttribute('aria-checked') === 'true')?.innerText.trim());
  log('New metric’s binder follows its icon (Other):', /Other/.test(followsIcon ?? ''));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-label="Achievement binder"] [role=radio]')].find((x) => x.innerText.includes('Study'));
    b.scrollIntoView({ block: 'center' });
    b.click();
  });
  await wait(300);
  await shot('ac-00-theme-picker');
  await click('::-p-text(Create metric)');
  // And one left on Other, for the nudge.
  await click('::-p-text(New metric)');
  await page.type('#m-name', 'Water');
  await click('::-p-text(A number)');
  await page.type('#m-unit', 'glasses');
  await click('::-p-text(Create metric)');
  await wait(500);

  // ── Profile before anything: nothing to collect ──
  await click('nav.fixed a[href="#/profile"]');
  await wait(900);
  log('Profile opens with level 1:', (await text()).includes('Level 1'));
  log('Nothing ready yet:', !(await page.$('[data-testid=ready-shelf]')));
  log('Study ladders listed:', !!(await page.$('[data-ladder="study.session"]')) && !!(await page.$('[data-ladder="study.hours"]')));
  log('Nudge for Water (under Other):', (await page.evaluate(() => document.querySelector('[data-testid=theme-nudge]')?.innerText ?? '')).includes('Water'));
  log('No badge yet:', (await badge()) === null);

  // ── The binders: a deck, active ones first, greyed ones at the end ──
  const order = await page.evaluate(() => [...document.querySelectorAll('[role=tablist][aria-label=Binders] [role=tab]')].map((t) => t.innerText.trim()));
  log('Binder tabs, active first:', order.slice(0, 2).join(',') === 'Study,Other' && order.indexOf('Secrets') < order.indexOf('Fitness') && order.indexOf('Secrets') < order.indexOf('Compete'), '|', order.join(','));
  const front = await binder();
  log('Study is in front, targeted, linked to MCAT prep:', front.id === 'study' && front.kind === 'Targeted' && /MCAT prep/.test(front.linked));
  log('No emoji anywhere on the profile:', !/\p{Extended_Pictographic}/u.test(await text()));
  log('Cards are pins:', await page.evaluate(() => document.querySelectorAll('[data-testid=group-study] .ach-pin svg').length >= 6));
  await shot('ac-23-binder-deck');
  await pressTab('Streaks');
  log('Tapping a tab brings that binder to the front:', await until(async () => (await binder()).id === 'streaks'));
  const streaks = await binder();
  log('Streaks is general, nothing to link:', streaks.kind === 'General' && !streaks.linked && /every metric with a target/.test(streaks.text));
  await swipe(-1);
  log('Swiping back goes to the binder before it:', await until(async () => (await binder()).id === 'other'), '|', (await binder()).id);
  await pressTab('Fitness');
  await until(async () => (await binder()).id === 'fitness');
  const fit = await binder();
  log('Fitness greyed: nothing linked, says how to start:', fit.active === 'false' && /No metric linked yet/.test(fit.text));
  log('Compete greyed until paired:', (await page.$eval('[data-testid=group-compete]', (e) => e.dataset.active)) === 'false');
  log('Goals greyed until there is a goal:', (await page.$eval('[data-testid=group-goals]', (e) => e.dataset.active)) === 'false');
  await shot('ac-24-binder-greyed');
  // Link Water to Fitness from the greyed binder, then untick it again.
  await pressText('Link a metric', '[data-testid=group-fitness]');
  const ticks = () => page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=checkbox]')].map((c) => `${c.innerText.split('\n')[0]}:${c.getAttribute('aria-checked')}`).join(','));
  log('Link sheet lists metrics, none ticked:', await until(async () => !!(await page.$('dialog[open] [data-testid=link-list]'))) && (await ticks()) === 'MCAT prep:false,Water:false', '|', await ticks());
  await shot('ac-25-link-sheet');
  const tickWater = () => page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=checkbox]')].find((c) => c.innerText.startsWith('Water')).click());
  await tickWater();
  log('Ticked: Water linked to Fitness, which lights up:', await until(async () => (await page.$eval('[data-testid=group-fitness]', (e) => e.dataset.active)) === 'true'));
  log('… and the sheet says Linked here:', (await page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=checkbox]')].find((c) => c.innerText.startsWith('Water')).innerText)).includes('Linked here'));
  await tickWater();
  log('Unticked: back to Other, Fitness greyed again:', await until(async () => (await page.$eval('[data-testid=group-fitness]', (e) => e.dataset.active)) === 'false'));
  await pressText('Done', 'dialog');
  await pressTab('Study');
  await until(async () => (await binder()).id === 'study');

  // ── A 2h 5m session: Study session cards, plus overachiever ──
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Start MCAT prep timer)');
  await page.evaluate(() => window.__advance((2 * 60 + 5) * 60 * 1000));
  await wait(800);
  await click('::-p-aria(Stop MCAT prep and log it)');
  log('Banner drops in:', await until(async () => !!(await banner())));
  const b = await banner();
  log('Banner says what unlocked:', /achievements unlocked/.test(b ?? '') && /Locked In|Opened the Book|Double Trouble|Extra Credit/.test(b ?? ''), '|', JSON.stringify(b));
  await shot('ac-01-banner');
  log('Profile tab shows a count:', Number(await badge()) >= 3, '|', await badge());
  log('Note prompt still at the bottom:', (await page.evaluate(() => document.querySelector('[aria-live=polite]')?.innerText ?? '')).includes('accomplish'));

  // ── Collect from the banner: straight into the reveal ──
  await page.evaluate(() => [...document.querySelectorAll('[data-testid=ach-banner] a')].find((a) => a.innerText.trim() === 'Collect').click());
  log('Reveal opens:', await until(async () => !!(await reveal())));
  log('Profile is the route:', (await page.evaluate(() => location.hash)) === '#/profile');
  const first = await reveal();
  log('Starts face down:', /Card 1 of \d/i.test(first ?? '') && (first ?? '').includes('Tap the card to flip it'));
  await shot('ac-02-reveal-back');
  await page.click('dialog[open] .ach-flip');
  await wait(1300);
  const flipped = await reveal();
  log('Flipped: name, XP and how it was earned:', /\+\d+ XP/.test(flipped ?? '') && /collected/i.test(flipped ?? ''), '|', (flipped ?? '').split('\n').slice(0, 3).join(' / '));
  await shot('ac-03-reveal-front');
  // Next card, flip it, then take the rest in one go.
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.innerText.startsWith('Next card'))?.click());
  await wait(600);
  await page.click('dialog[open] .ach-flip');
  await wait(1300);
  await shot('ac-04-reveal-second');
  const rest = await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.innerText.startsWith('Collect all'))?.innerText ?? null);
  if (rest) {
    await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.innerText.startsWith('Collect all')).click());
    await wait(900);
    log('Collect all shows what came in:', !!(await page.$('dialog[open] [data-testid=collected-all]')));
    await shot('ac-05-collected-all');
    await pressText('Done', 'dialog');
  } else {
    await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => /Done|Next card/.test(x.innerText))?.click());
    await wait(600);
  }
  await page.keyboard.press('Escape');
  await wait(700);
  log('Reveal closed:', !(await reveal()));
  log('Nothing left waiting, badge gone:', await until(async () => (await badge()) === null));

  // ── The binder ──
  const session = await ladderState('study.session');
  log('Study session: 1h and 2h collected, 3h locked:', /collected/.test(session[0]) && /collected/.test(session[1]) && /locked/.test(session[2]), '|', session.slice(0, 3).join(' / '));
  const prof = await text();
  log('XP and the next level shown:', /\d+ XP to level \d+/.test(prof));
  log('Best so far on the row:', prof.includes('Best: 2h 5m'));
  log('Fits a phone:', await fitsPhone());
  await shot('ac-06-profile-top');
  await shot('ac-07-profile-full', true);

  // A locked card: what it takes and how close.
  await openMini('study.session', 2);
  const locked = await sheet();
  log('Locked card: progress to 3h:', (locked ?? '').includes('2h 5m / 3h') && (locked ?? '').includes('Gold'));
  await shot('ac-08-locked-card');
  await closeSheet();

  // A collected card: pin it and wear it.
  await openMini('study.session', 1);
  const got = await sheet();
  log('Collected card shows how it was earned:', (got ?? '').includes('2h 5m of MCAT prep'), '|', JSON.stringify((got ?? '').split('\n').slice(-6)));
  await shot('ac-09-collected-card');
  await pressText('Pin', 'dialog');
  await pressText('Wear as title', 'dialog');
  await closeSheet();
  log('Title worn on the profile:', await until(async () => (await page.$eval('[data-testid=profile-title]', (e) => e.textContent)) === 'Locked In'));
  log('Pinned in the showcase:', (await page.$eval('[data-testid=showcase]', (e) => e.innerText)).includes('Locked In'));

  // Secrets stay hidden.
  await pressTab('Secrets');
  await page.evaluate(() => document.querySelector('[data-testid=group-secrets] li button').click());
  await wait(600);
  const secret = await sheet();
  log('A locked secret only gives a hint:', (secret ?? '').includes('???') && !(secret ?? '').includes('Bullseye'));
  await closeSheet();

  // ── Link metrics: move Water to Health; the nudge goes ──
  await pressText('Link metrics');
  await page.select('select[aria-label="Binder for Water"]', 'health');
  await wait(500);
  await shot('ac-10-themes');
  await pressText('Done', 'dialog');
  log('Nudge gone once Water is linked:', await until(async () => !(await page.$('[data-testid=theme-nudge]'))));
  log('Health binder lights up, Other greys out:', (await page.$eval('[data-testid=group-health]', (e) => e.dataset.active)) === 'true' &&
    (await page.$eval('[data-testid=group-other]', (e) => e.dataset.active)) === 'false');

  // ── Ten hours straight: Academic Menace, the Mythic ──
  await click('nav.fixed a[href="#/today"]');
  await click('::-p-aria(Start MCAT prep timer)');
  await page.evaluate(() => window.__advance(10 * 3600 * 1000 + 60_000));
  await wait(800);
  await click('::-p-aria(Stop MCAT prep and log it)');
  log('Banner for the big session:', await until(async () => /Academic Menace/.test((await banner()) ?? '')), '|', JSON.stringify(await banner()));
  await page.evaluate(() => [...document.querySelectorAll('[data-testid=ach-banner] a')].find((a) => a.innerText.trim() === 'Collect').click());
  await until(async () => !!(await reveal()));
  await page.click('dialog[open] .ach-flip');
  await wait(1500);
  const mythic = await reveal();
  log('Rarest first: Academic Menace, Mythic:', /Mythic/i.test(mythic ?? '') && (await page.evaluate(() => !!document.querySelector('dialog[open] .ach-t5'))));
  log('Sunburst behind a Gold-or-better card:', !!(await page.$('dialog[open] .ach-rays')));
  await shot('ac-16-reveal-mythic');
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.innerText.startsWith('Next card'))?.click());
  await wait(600);
  await page.click('dialog[open] .ach-flip');
  await wait(1500);
  await shot('ac-17-reveal-diamond');
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.innerText.startsWith('Collect all') || x.innerText === 'Done')?.click());
  await wait(1200);
  await shot('ac-18-collected-all-2');
  await page.keyboard.press('Escape');
  await wait(800);
  await pressTab('Study');
  const row = await page.$('[data-testid=group-study]');
  await row.scrollIntoView();
  await wait(300);
  await row.screenshot({ path: `${OUT}ac-19-study-group.png` });
  log('Study session row complete:', (await ladderState('study.session')).every((l) => /collected/.test(l)));
  await openMini('study.session', 5);
  await shot('ac-20-mythic-card');
  await closeSheet();
  await openMini('study.session', 3);
  await shot('ac-21-platinum-card');
  await closeSheet();

  // ── It all survives a reload ──
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  await go('#/profile');
  log('After reload: the deck opens on the binder you last looked at:', (await binder()).id === 'study');
  log('After reload: title, pin and collected cards kept:',
    (await page.$eval('[data-testid=profile-title]', (e) => e.textContent)) === 'Locked In' &&
    (await page.$eval('[data-testid=showcase]', (e) => e.innerText)).includes('Locked In') &&
    /collected/.test((await ladderState('study.session'))[1]));
  log('No banner again for cards already seen:', !(await banner()));

  // ── Settings behind the gear, and back ──
  await click('main a[href="#/settings"]');
  log('Gear opens Settings, all of it:', (await text()).includes('Timezone') && (await text()).includes('Export your data') && (await text()).includes('Tutorials'));
  log('Profile tab stays lit on Settings:', await page.evaluate(() => document.querySelector('nav.fixed a[aria-current=page]')?.getAttribute('href') === '#/profile'));
  await shot('ac-11-settings');
  await click('a[aria-label="Back to profile"]');
  log('Back goes to the profile:', (await page.evaluate(() => location.hash)) === '#/profile');

  // ── Sharing with a Compete partner ──
  log('Not paired: says how to share:', (await text()).includes('Pair up with someone in Compete'));
  await page.evaluate(() => window.__e2eCompete.pair('Cousin'));
  log('Paired: a switch to share, off by default:', await until(async () => (await text()).includes('Show my profile to Cousin')) && (await text()).includes('Off. Cousin can’t see your profile.'));
  await page.evaluate(() => [...document.querySelectorAll('[role=switch]')].find((s) => s.innerText.includes('Show my profile')).click());
  const mine = await until(async () => !!(await page.evaluate(() => window.__e2eAch.myShared())), 8000);
  const shared = await page.evaluate(() => window.__e2eAch.myShared());
  log('Switched on: a summary is shared:', mine && shared?.title?.name === 'Locked In' && shared?.pinned?.length === 1 && shared?.collected >= 3);
  log('The summary carries no entries or metrics:', !('metrics' in (shared ?? {})) && !('entries' in (shared ?? {})));
  await page.evaluate(() => window.__e2eAch.partnerProfile({
    uid: window.__e2eCompete.partnerUid, name: 'Cousin', level: 6, xp: 400, rank: 'Side Quest Enjoyer', rankArt: '🧭',
    title: { id: 'reading.session.5', name: 'Spine Breaker', tier: 4, art: ['📚', '💥'], flavor: 'x', on: '2026-10-12', detail: null },
    pinned: [{ id: 'reading.session.5', name: 'Spine Breaker', tier: 4, art: ['📚', '💥'], flavor: 'x', on: '2026-10-12', detail: '5h 10m of Reading' }],
    tiers: [5, 3, 2, 0, 1, 0], collected: 11, total: 140, recent: [], updatedAt: new Date().toISOString(),
  }));
  log('Their profile can be opened:', await until(async () => (await text()).includes('See Cousin’s profile')));
  await pressText('See Cousin’s profile');
  const theirs = await page.evaluate(() => document.querySelector('dialog[open] [data-testid=shared-profile]')?.innerText ?? '');
  log('Shows their title, level and showcase:', theirs.includes('Spine Breaker') && theirs.includes('Level 6') && theirs.includes('11') && theirs.includes('Showcase'));
  await shot('ac-12-partner-profile');
  await closeSheet();
  await click('nav.fixed a[href="#/compete"]');
  await wait(800);
  log('Scoreboard shows their title:', (await page.evaluate(() => [...document.querySelectorAll('[data-testid=player-title]')].map((e) => e.textContent))).includes('Spine Breaker'));
  await page.evaluate(() => document.querySelector('[aria-label="Cousin’s profile"]').click());
  await wait(600);
  log('Tapping their name opens it:', !!(await page.$('dialog[open] [data-testid=shared-profile]')));
  await shot('ac-13-compete-profile');
  await closeSheet();
  await go('#/profile');
  await page.evaluate(() => [...document.querySelectorAll('[role=switch]')].find((s) => s.innerText.includes('Show my profile')).click());
  log('Switched off: taken down:', await until(async () => (await page.evaluate(() => window.__e2eAch.myShared())) === null));

  // ── Light theme ──
  await go('#/settings');
  await page.evaluate(() => [...document.querySelectorAll('[role=radio]')].find((r) => r.innerText.trim() === 'Light').click());
  await go('#/profile');
  await wait(400);
  await shot('ac-14-profile-light');
  await openMini('study.session', 1);
  await shot('ac-15-card-light');
  await closeSheet();

  // Laptop: Profile and Settings both in the sidebar.
  await page.setViewport({ width: 1280, height: 900 });
  await go('#/profile');
  await wait(500);
  log('Sidebar has Profile and Settings:', await page.evaluate(() => {
    const side = [...document.querySelectorAll('nav')].find((n) => !n.className.includes('fixed'));
    const labels = [...(side?.querySelectorAll('a') ?? [])].map((a) => a.innerText.trim());
    return labels.includes('Profile') && labels.includes('Settings');
  }));
  await shot('ac-22-desktop');

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log('Page errors:', errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('ac-crash');
} finally {
  await browser.close();
}

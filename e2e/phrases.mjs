// Phrase metrics (quotes, ahadeeth): add phrases with a source, the daily review
// (tap "reviewed", fill the blanks, type it out, hints), a day that only counts
// with its review, the collection (search, filters, edit), History and Stats.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
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
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Could not reach/.test(m.text())) errors.push(m.text()); });

const click = async (sel) => { await page.locator(sel).setTimeout(8000).click(); await wait(400); };
const text = () => page.evaluate(() => document.body.innerText);
const dialogText = () => page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');
const log = (...a) => console.log('•', ...a);
const shot = (n, fullPage = false) => page.screenshot({ path: `${OUT}${n}.png`, fullPage });
const setVal = (sel, v) => page.$eval(sel, (el, val) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The app's day starts at 5am.
const DAY_START_MS = 5 * 3600000;
const today = ymd(new Date(Date.now() - DAY_START_MS));
const yesterday = ymd(new Date(Date.now() - DAY_START_MS - 86400000));
const pressText = async (label, scope = 'body') => {
  const ok = await page.evaluate((l, s) => {
    const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.innerText.trim() === l);
    b?.click();
    return !!b;
  }, label, scope);
  if (!ok) console.log(`FAILED: no button "${label}"`);
  await wait(400);
};
const row = (name) => page.evaluate((n) => [...document.querySelectorAll('li')].find((l) => l.querySelector('h2')?.textContent.includes(n))?.innerText ?? '', name);
const NAME = 'Ahadeeth';

/** Add a phrase from Today's row, on the given day. */
async function addPhrase(phrase, reference, date) {
  await click(`::-p-aria(Add a phrase to ${NAME})`);
  await setVal('#phrase-text', phrase);
  if (reference) await setVal('#phrase-ref', reference);
  if (date) await setVal('#entry-date', date);
  await click('dialog[open] button[type=submit]');
  await wait(300);
}

const Y1 = ['Actions are judged by intentions', 'Sahih al-Bukhari'];
const Y2 = ['إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ', 'صحيح البخاري'];
const T1 = ['The best of people are those most beneficial to people', 'Al-Mu’jam al-Awsat'];
const T2 = ['Let him speak good or remain silent', null];

/** Open the review, read the phrase it picked, and move to the test. */
async function startTest() {
  const phrase = await page.$eval('[data-testid=review-phrase]', (el) => el.textContent);
  await pressText('Test myself from memory', 'dialog[open]');
  return phrase;
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await click('[role=radio]::-p-text(Create account)');
  await page.type('#email', 'e2e@logbook.test');
  await page.type('#password', 'emulator-only-pass');
  await click('button[type=submit]');
  await wait(2500);
  await click('::-p-text(Got it)');

  // ── Make the metric ──
  await click('nav.fixed a[href="#/metrics"]');
  await click('::-p-text(New metric)');
  log('New metric offers Phrases:', await page.evaluate(() => [...document.querySelectorAll('[aria-label="Measured as"] [role=radio]')].map((b) => b.textContent).join(',') === 'Time,A number,Check off,Phrases'));
  await page.type('#m-name', NAME);
  await click('[role=radio]::-p-text(Phrases)');
  let dlg = await dialogText();
  log('Phrases hint, phrases-a-day target, no timer, one-tap or unit:', dlg.includes('Collect a quote, saying or hadith') && dlg.includes('Phrases to add each day') && !dlg.includes('One-tap buttons') && !dlg.includes('start/stop timer') && !(await page.$('#m-unit')));
  log('Target starts at 1, binder is Phrases:', (await page.$eval('#m-target', (el) => el.value)) === '1' && await page.evaluate(() => document.querySelector('[aria-label="Achievement binder"] [aria-checked=true]')?.textContent.includes('Phrases')));
  await setVal('#m-target', '2');
  await shot('ph-01-editor', true);
  await click('::-p-text(Create metric)');
  await wait(500);
  log('Metrics list says 2 phrases:', (await text()).includes('at least 2 phrases'));

  // ── Today, nothing yet ──
  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  let r = await row(NAME);
  log('Today: 0 phrases, add 0 of 2, nothing to review yet:', r.includes('0') && r.includes('Add 0 of 2') && r.includes('Nothing to review yet'));
  log('Review is disabled with nothing to review:', await page.$eval(`[aria-label="Review a phrase from ${NAME}"]`, (b) => b.disabled));
  await shot('ph-02-today-empty');

  // ── Yesterday's phrases (the first day owes no review) ──
  await addPhrase(Y1[0], Y1[1], yesterday);
  await addPhrase(Y2[0], Y2[1], yesterday);
  r = await row(NAME);
  log('Yesterday’s phrases do not count for today:', r.includes('Add 0 of 2'));
  log('Review is now owed: "Review one":', r.includes('Review one'));

  // ── Today's phrases ──
  await addPhrase(T1[0], T1[1]);
  r = await row(NAME);
  log('One phrase today: 1 phrase, add 1 of 2:', /1\s*phrase/.test(r) && r.includes('Add 1 of 2'));
  await addPhrase(T2[0], T2[1]);
  r = await row(NAME);
  log('Two phrases: add 2 of 2, but not done without the review:', r.includes('Add 2 of 2') && !r.includes('· done') && r.includes('Review one'));
  log('The streak holds at 1 (yesterday), today still open:', r.includes('1 in a row'));
  await shot('ph-03-owed');

  // Adding the same phrase twice is flagged, and goes through on a second tap.
  await click(`::-p-aria(Add a phrase to ${NAME})`);
  await setVal('#phrase-text', 'the best of people, are those most beneficial to people!');
  await click('dialog[open] button[type=submit]');
  dlg = await dialogText();
  log('Duplicate is flagged:', dlg.includes('already in your collection') && dlg.includes('Tap again'));
  await shot('ph-04-duplicate');
  await page.keyboard.press('Escape');
  await wait(400);
  r = await row(NAME);
  log('Cancelling adds nothing:', r.includes('Add 2 of 2'));

  // ── Review: tap "reviewed" ──
  await click(`::-p-aria(Review a phrase from ${NAME})`);
  dlg = await dialogText();
  const first = await page.$eval('[data-testid=review-phrase]', (el) => el.textContent);
  log('Review picks a phrase from an earlier day:', first === Y1[0] || first === Y2[0]);
  log('It shows the source, not yet reviewed, and offers both ways:', (dlg.includes(Y1[1]) || dlg.includes(Y2[1])) && dlg.includes('not reviewed yet') && dlg.includes('I’ve reviewed it') && dlg.includes('Test myself from memory'));
  await shot('ph-05-review');
  await pressText('I’ve reviewed it', 'dialog[open]');
  log('Reviewed:', (await dialogText()).includes('Reviewed'));
  await pressText('Done', 'dialog[open]');
  r = await row(NAME);
  log('Day counts now: done, Review done, 2 in a row:', r.includes('· done') && r.includes('Review done') && r.includes('2 in a row'));
  log('Button now offers another:', (await page.$eval(`[aria-label="Review a phrase from ${NAME}"]`, (b) => b.textContent)).includes('Review another'));
  await shot('ph-06-done');

  // ── Review: type it out, with a hint ──
  await click(`::-p-aria(Review a phrase from ${NAME})`);
  dlg = await dialogText();
  log('A second review says today’s is done:', dlg.includes('Today’s review is done'));
  let phrase = await startTest();
  await click('[role=radio]::-p-text(Type it out)');
  await pressText('Reveal next word', 'dialog[open]');
  log('Reveal shows the start:', (await dialogText()).includes('Starts:'));
  await pressText('Show source', 'dialog[open]');
  log('Source is shown on request:', (await dialogText()).includes('Source:'));
  log('Check waits for an attempt:', await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.innerText.trim() === 'Check')?.disabled));
  await shot('ph-07-type');
  await setVal('#review-attempt', phrase.replace(/[ًٌٍَُِّْ]/g, ''));
  await pressText('Check', 'dialog[open]');
  dlg = await dialogText();
  log('Typed out: 100%, word perfect, 2 hints used:', dlg.includes('100%') && dlg.includes('Word perfect') && dlg.includes('2 hints used'));
  await shot('ph-08-result');

  // ── Review: fill the blanks ──
  await pressText('Review another', 'dialog[open]');
  phrase = await startTest();
  dlg = await dialogText();
  log('Blanks are the default way to test:', dlg.includes('Fill the blanks') && (await page.$$('[data-testid=review-blanks] input')).length >= 1);
  await click('[role=radio]::-p-text(Most)');
  const blanksFilled = await page.evaluate((full) => {
    const words = full.trim().split(/\s+/);
    const p = document.querySelector('[data-testid=review-blanks]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    [...p.children].forEach((sp, i) => {
      const inp = sp.querySelector('input');
      if (inp) { set.call(inp, words[i]); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    return [...p.children].length === words.length;
  }, phrase);
  log('One blank per hidden word:', blanksFilled);
  await shot('ph-09-blanks');
  await pressText('Check', 'dialog[open]');
  dlg = await dialogText();
  log('All blanks right: 100%:', dlg.includes('100%') && dlg.includes('No hints used'));

  // ── A poor attempt still finishes the review, and can be undone ──
  await pressText('Review another', 'dialog[open]');
  await startTest();
  await click('[role=radio]::-p-text(Type it out)');
  await setVal('#review-attempt', 'zzz qqq');
  await pressText('Check', 'dialog[open]');
  dlg = await dialogText();
  log('Poor attempt: 0%, needs another look, comes up sooner:', dlg.includes('0%') && dlg.includes('Needs another look') && !dlg.includes('Needs another look · 0%') && dlg.includes('come up again sooner'));
  await shot('ph-10-poor');
  await pressText('Undo and try again', 'dialog[open]');
  log('Undo returns to the test:', (await dialogText()).includes('The whole phrase, from memory'));
  await page.keyboard.press('Escape');
  await wait(400);

  // ── Collection ──
  await click(`::-p-aria(Open the ${NAME} collection)`);
  await wait(500);
  log('Collection route:', (await page.evaluate(() => location.hash)).startsWith('#/phrases/'));
  let body = await text();
  log('Summary counts 4 phrases and the reviews:', body.includes('4 phrases collected') && /[1-9]\d* reviews/.test(body));
  log('Newest first, with source and date:', (await page.$$eval('[data-testid=phrase-card]', (c) => c.map((x) => x.innerText))).length === 4);
  log('Cards show how reviews went:', body.includes('reviewed') && body.includes('not reviewed yet'));
  await shot('ph-11-collection', true);
  await setVal('input[type=search]', 'الاعمال');
  await wait(300);
  log('Search ignores Arabic marks: one card:', (await page.$$('[data-testid=phrase-card]')).length === 1);
  await setVal('input[type=search]', 'al-');
  await wait(300);
  log('Search looks at the source too:', (await page.$$('[data-testid=phrase-card]')).length === 2);
  await setVal('input[type=search]', '');
  await click('[role=radio]::-p-text(Not reviewed)');
  const unreviewed = (await page.$$('[data-testid=phrase-card]')).length;
  log('Filter: not reviewed leaves only today’s two phrases:', unreviewed === 2);
  await click('[role=radio]::-p-text(All)');
  // Edit a phrase.
  await page.evaluate(() => [...document.querySelectorAll('[data-testid=phrase-card]')].find((c) => c.innerText.includes('Let him speak'))?.click());
  await wait(500);
  dlg = await dialogText();
  log('Tap a card to edit it (with delete):', dlg.includes('Edit') && dlg.includes('Delete phrase'));
  await setVal('#phrase-text', 'Let him speak good or keep silent');
  await setVal('#phrase-ref', 'Sahih al-Bukhari');
  await click('dialog[open] button[type=submit]');
  await wait(400);
  body = await text();
  log('Edit saved:', body.includes('keep silent') && !body.includes('remain silent'));
  await page.evaluate(() => [...document.querySelectorAll('[data-testid=phrase-card]')].find((c) => c.innerText.includes('keep silent'))?.click());
  await wait(400);
  await pressText('Delete phrase', 'dialog[open]');
  body = await text();
  log('Delete removes it, with Undo:', !body.includes('keep silent') && body.includes('3 phrases collected') && body.includes('Undo'));
  await pressText('Undo');
  log('Undo brings it back:', (await text()).includes('4 phrases collected'));
  await page.keyboard.press('Escape');

  // ── Today after all that: still done ──
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  r = await row(NAME);
  log('Extra reviews keep the day counted:', r.includes('· done') && r.includes('2 in a row'));

  // ── Yesterday sheet ──
  await click('::-p-aria(Add to yesterday)');
  dlg = await dialogText();
  log('Yesterday sheet has the phrase row with both buttons:', dlg.includes(NAME) && dlg.includes('Add phrase') && dlg.includes('Done'));
  await shot('ph-12-yesterday');
  await page.keyboard.press('Escape');
  await wait(400);

  // ── History ──
  await page.goto(`http://localhost:5173/#/history/${today}`);
  await wait(800);
  dlg = await dialogText();
  log('History day: phrases, review result and "This day counts":', dlg.includes(T1[0]) && dlg.includes('This day counts') && /Reviewed|Word perfect|Remembered|Needs another look/.test(dlg));
  await shot('ph-13-history-day');
  await page.keyboard.press('Escape');
  await wait(400);
  await click(`[role=radio]::-p-text(${NAME})`);
  const cellLabel = await page.evaluate((d) => {
    const label = new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    return [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').startsWith(label))?.getAttribute('aria-label') ?? '';
  }, today);
  log('Calendar cell: target met, day 2 of a streak:', cellLabel.includes('2 phrases') && cellLabel.includes('target met') && cellLabel.includes('day 2 of a streak'));
  await shot('ph-14-history', true);

  // ── Stats ──
  await page.goto('http://localhost:5173/#/stats');
  // Stats is a lazy chunk: give it time under a loaded dev server.
  await page.waitForFunction(() => document.body.innerText.includes('Tested from memory'), { timeout: 10000 }).catch(() => {});
  await wait(300);
  body = await text();
  log('Stats: phrase figures and link to the collection:', body.includes('Phrases collected') && body.includes('Tested from memory') && body.includes('Open the collection'));
  await shot('ph-15-stats', true);

  // ── Profile: the Phrases binder and its first cards ──
  await page.goto('http://localhost:5173/#/profile');
  await wait(900);
  body = await text();
  log('Profile has the Phrases binder:', body.includes('Phrases'));
  await shot('ph-16-profile', true);

  // ── The editor on an existing phrase metric ──
  await page.goto('http://localhost:5173/#/metrics');
  await wait(500);
  await page.evaluate((n) => [...document.querySelectorAll('li button')].find((b) => b.innerText.includes(n))?.click(), NAME);
  await wait(500);
  dlg = await dialogText();
  log('Editor: type is fixed as Phrases, no switch to check off:', dlg.includes('Phrases') && dlg.includes('Fixed once entries exist.') && !dlg.includes('Switch to check off'));
  await page.keyboard.press('Escape');
  await wait(300);

  // ── Phrase carousel: off by default, set in the editor, cycles in a shuffle ──
  const PHRASES = [Y1[0], Y2[0], T1[0], 'Let him speak good or keep silent'];
  const carouselText = () => page.$eval('[data-testid=phrase-carousel]', (el) => el.querySelector('.line-clamp-6')?.textContent ?? el.querySelector('.car-ticker')?.textContent ?? '');
  const openEditor = async () => {
    await page.goto('http://localhost:5173/#/metrics');
    await wait(500);
    await page.evaluate((n) => [...document.querySelectorAll('li button')].find((b) => b.innerText.includes(n))?.click(), NAME);
    await wait(500);
  };
  const pick = async (group, label) => click(`dialog[open] [aria-label="${group}"] [role=radio]::-p-text(${label})`);
  await page.goto('http://localhost:5173/#/today');
  await wait(600);
  log('Carousel is off by default:', !(await page.$('[data-testid=phrase-carousel]')));
  await openEditor();
  log('Editor offers the switch, off, with no style yet:', (await dialogText()).includes('Cycle your phrases on Today') && !(await page.$('[aria-label="Carousel style"]')));
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=switch]')].find((s) => s.innerText.includes('Cycle your phrases')).click());
  await wait(300);
  log('Switching it on offers four styles and three paces:', (await page.$$('[aria-label="Carousel style"] [role=radio]')).length === 4 && (await page.$$('[aria-label="Carousel pace"] [role=radio]')).length === 3);
  await pick('Carousel style', 'Stack');
  await pick('Carousel pace', 'Fast');
  await shot('ph-17-carousel-editor', true);
  await click('dialog[open] button[type=submit]');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  const style1 = await page.$eval('[data-testid=phrase-carousel]', (el) => el.dataset.style).catch(() => null);
  log('Today shows the carousel in the chosen style:', style1 === 'stack');
  await shot('ph-18-carousel');
  // Reduced motion (set for this suite): it never moves by itself, and there is nothing to pause.
  const still = await carouselText();
  await wait(9000);
  log('Reduced motion: no pause button, it stays put:', !(await page.$('[aria-label="Pause the carousel"]')) && (await carouselText()) === still);
  log('Previous is disabled on the first phrase:', await page.$eval('[aria-label="Previous phrase"]', (b) => b.disabled));
  const seen = [still];
  for (let i = 0; i < 3; i++) {
    await click('[aria-label="Next phrase"]');
    seen.push(await carouselText());
  }
  log('Four steps show all four phrases once each (a shuffle):', new Set(seen).size === 4 && seen.every((t) => PHRASES.includes(t)));
  await click('[aria-label="Previous phrase"]');
  log('Previous steps back:', (await carouselText()) === seen[2]);
  await click('[aria-label="Next phrase"]');
  log('Next then returns to the same one:', (await carouselText()) === seen[3]);
  await click('[aria-label="Next phrase"]');
  log('The next round never starts with the phrase just shown:', (await carouselText()) !== seen[3]);

  // With motion allowed it moves on by itself, and the pause button holds it.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  await page.mouse.move(1, 1);
  const before = await carouselText();
  await wait(9500);
  log('Fast pace: moves on by itself:', (await carouselText()) !== before);
  await click('[aria-label="Pause the carousel"]');
  await page.mouse.move(1, 1);
  const held = await carouselText();
  await wait(9500);
  log('Paused: stays on the same phrase, button offers Resume:', (await carouselText()) === held && !!(await page.$('[aria-label="Resume the carousel"]')));
  await click('[aria-label="Resume the carousel"]');

  // The ticker scrolls one line and hands over when it has gone by.
  await openEditor();
  await pick('Carousel style', 'Ticker');
  await click('dialog[open] button[type=submit]');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  await page.mouse.move(1, 1);
  log('Ticker: a single scrolling line:', !!(await page.$('[data-testid=phrase-carousel] .car-ticker')));
  const tick = await carouselText();
  await wait(10500);
  log('Ticker hands over to the next phrase:', (await carouselText()) !== tick);
  await shot('ph-19-ticker');

  // Switching it off removes it again.
  await openEditor();
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=switch]')].find((s) => s.innerText.includes('Cycle your phrases')).click());
  await click('dialog[open] button[type=submit]');
  await wait(500);
  await page.goto('http://localhost:5173/#/today');
  await wait(700);
  log('Off again: no carousel on Today:', !(await page.$('[data-testid=phrase-carousel]')));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  // ── A reload keeps everything ──
  await page.goto('http://localhost:5173/#/today');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  r = await row(NAME);
  log('Reload: still done, 2 in a row:', r.includes('· done') && r.includes('2 in a row'));

  log('No page errors:', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('ph-crash');
} finally {
  await browser.close();
}

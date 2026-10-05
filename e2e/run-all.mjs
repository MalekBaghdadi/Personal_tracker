// Runs every browser test against the local Auth emulator, then reports.
//
//   npm run e2e                 # all suites
//   npm run e2e -- goals core   # just these (file names without .mjs)
//
// Needs Java (for the emulator) and Google Chrome. Set CHROME_PATH if Chrome
// isn't at the default Windows location. Only the Auth emulator runs:
// Firestore is unreachable on purpose, so every test exercises the offline
// path (the Firestore emulator jar wouldn't download on the dev machine).
// Screenshots land in e2e/shots/ (git-ignored).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(here + 'shots', { recursive: true });

const DEV_SUITES = ['core', 'history-all', 'subtract-toggle', 'subtract-clamp', 'calendar', 'goals', 'session-note', 'extras', 'yesterday', 'day-start'];
const PREVIEW_SUITES = ['offline']; // needs the production build + service worker
const only = process.argv.slice(2);
const pick = (list) => (only.length ? list.filter((s) => only.includes(s)) : list);

const procs = [];
function start(cmd) {
  const p = spawn(cmd, { cwd: root, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
  procs.push(p);
  return p;
}
function stopAll() {
  for (const p of procs) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' });
      else process.kill(-p.pid);
    } catch { /* already gone */ }
  }
  procs.length = 0;
}
process.on('SIGINT', () => { stopAll(); process.exit(130); });

async function waitFor(url, label, seconds = 90) {
  for (let i = 0; i < seconds; i++) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error(`${label} didn't come up at ${url}`);
}

function runSuite(name) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [here + name + '.mjs'], { cwd: here });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const failed =
        code !== 0 ||
        /FAILED:/.test(out) ||
        /(Page errors|Errors|Console errors): \[/.test(out) ||
        out.split('\n').some((l) => l.startsWith('•') && /(:|\|) false\b/.test(l));
      resolve({ name, failed, out });
    });
  });
}

const results = [];
try {
  const dev = pick(DEV_SUITES);
  const preview = pick(PREVIEW_SUITES);

  console.log('Starting the Auth emulator…');
  start('npx firebase emulators:start --project demo-logbook --only auth');
  await waitFor('http://127.0.0.1:9099', 'Auth emulator');

  if (dev.length) {
    console.log('Starting the dev server (emulator mode)…');
    start('npx vite --mode emulators --port 5173 --strictPort');
    await waitFor('http://localhost:5173', 'Dev server');
    for (const s of dev) {
      process.stdout.write(`  ${s} … `);
      const r = await runSuite(s);
      results.push(r);
      console.log(r.failed ? 'FAIL' : 'ok');
    }
  }

  if (preview.length) {
    console.log('Building in emulator mode and serving the production bundle…');
    execSync('npx vite build --mode emulators', { cwd: root, stdio: 'ignore' });
    start('npx vite preview --mode emulators --port 4173 --strictPort');
    await waitFor('http://localhost:4173', 'Preview server');
    for (const s of preview) {
      process.stdout.write(`  ${s} … `);
      const r = await runSuite(s);
      results.push(r);
      console.log(r.failed ? 'FAIL' : 'ok');
    }
    // Never leave an emulator-wired bundle in dist/ (npm run deploy rebuilds anyway).
    execSync('npx vite build', { cwd: root, stdio: 'ignore' });
  }
} catch (e) {
  console.error('\nSetup failed:', e.message);
  process.exitCode = 1;
} finally {
  stopAll();
}

for (const r of results) {
  console.log(`\n── ${r.name} ${r.failed ? '(FAILED)' : ''}\n${r.out.trim()}`);
}
const failed = results.filter((r) => r.failed).length;
console.log(`\n${results.length - failed} of ${results.length} suites passed.`);
if (failed) process.exitCode = 1;

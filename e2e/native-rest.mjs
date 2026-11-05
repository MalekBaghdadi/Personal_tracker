// The Android app's lock-screen Stop (android/.../LogbookRest.java) against the Auth and
// Firestore emulators, on a plain JVM:
//
//   npm run test:native
//
// Needs Java (as the emulators do). Checks that a stop saved from the lock screen passes the
// security rules and leaves exactly what stopTimer() in src/lib/repo.ts leaves: an entry the app's
// entries query sees, no state/timer, and the state/timerClosed marker. And that a timer stopped
// or replaced elsewhere is never logged twice, a bad session says so, and no network retries.
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const root = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = 'demo-logbook';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const JSON_JAR = 'org/json/json/20260814/json-20260814.jar';

// ── Compile LogbookRest.java (it uses org.json, built into Android) ──────────
const work = join(tmpdir(), 'logbook-native-rest');
mkdirSync(join(work, 'classes'), { recursive: true });
const jar = join(work, 'json.jar');
if (!existsSync(jar)) {
  let ok = false;
  for (const base of ['https://repo.maven.apache.org/maven2/', 'https://maven-central.storage-download.googleapis.com/maven2/']) {
    const res = await fetch(base + JSON_JAR).catch(() => null);
    if (res?.ok) {
      writeFileSync(jar, Buffer.from(await res.arrayBuffer()));
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error('Could not download org.json');
}
const sep = process.platform === 'win32' ? ';' : ':';
const javac = spawnSync('javac', [
  '-d', join(work, 'classes'), '-cp', jar,
  join(root, 'android/app/src/main/java/com/malekbaghdadi/logbook/LogbookRest.java'),
  join(root, 'e2e/native/RestCli.java'),
], { encoding: 'utf8' });
if (javac.status !== 0) throw new Error('javac failed:\n' + javac.stderr);
const cp = [join(work, 'classes'), jar].join(sep);

function saveStop({ uid, refreshToken, entryId, metricId, startedAt, localDate, seconds, log = true, fsBase = FS }) {
  const r = spawnSync('java', ['-cp', cp, 'RestCli', `${AUTH}/securetoken.googleapis.com`, fsBase, PROJECT, 'demo-key', uid, refreshToken, entryId, metricId, startedAt, localDate, String(seconds), String(log)], { encoding: 'utf8' });
  return r.stdout.trim().split('\n').pop();
}

// ── Emulators ───────────────────────────────────────────────────────────────
const emu = spawn(`npx firebase emulators:start --project ${PROJECT} --only auth,firestore`, { cwd: root, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
const stop = () => {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${emu.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-emu.pid);
  } catch { /* already gone */ }
};
process.on('SIGINT', () => { stop(); process.exit(130); });

let failed = 0;
function check(label, ok, detail = '') {
  if (!ok) failed++;
  console.log('•', label + ':', ok, detail ? `- ${detail}` : '');
}

async function signUp(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  });
  const j = await res.json();
  return { uid: j.localId, refreshToken: j.refreshToken };
}

try {
  for (const url of [AUTH, FS]) {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { await fetch(url); up = true; } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    if (!up) throw new Error(`emulator didn't come up at ${url}`);
  }
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules, host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

  const me = await signUp('lock@example.com');
  const db = env.authenticatedContext(me.uid).firestore();
  const startedAt = '2026-11-05T09:00:00.000Z';
  // What startTimer() writes.
  const startTimer = (at = startedAt, metricId = 'm1') => setDoc(doc(db, `users/${me.uid}/state/timer`), { metricId, startedAt: at, deviceId: 'phone', updatedAt: at });
  const base = { uid: me.uid, refreshToken: me.refreshToken, metricId: 'm1', startedAt, localDate: '2026-11-05' };

  // 1. The normal case: logged, timer gone, marker set, in one commit.
  await startTimer();
  check('saves a stop', saveStop({ ...base, entryId: 'entry-1', seconds: 5400 }) === 'SAVED');
  const entry = (await getDoc(doc(db, `users/${me.uid}/entries/entry-1`))).data();
  // The same fields and types as buildEntry() in src/lib/repo.ts.
  const keys = ['id', 'metricId', 'localDate', 'value', 'source', 'note', 'occurredAt', 'createdAt', 'updatedAt', 'deletedAt'];
  check('entry has buildEntry’s fields', JSON.stringify(Object.keys(entry ?? {}).sort()) === JSON.stringify([...keys].sort()), JSON.stringify(entry));
  check('entry values', entry?.id === 'entry-1' && entry.metricId === 'm1' && entry.value === 5400 && Number.isInteger(entry.value)
    && entry.source === 'timer' && entry.note === null && entry.deletedAt === null && entry.localDate === '2026-11-05'
    && entry.occurredAt === startedAt && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.createdAt) && entry.createdAt === entry.updatedAt);
  const listed = await getDocs(query(collection(db, `users/${me.uid}/entries`), where('deletedAt', '==', null)));
  check('the app’s entries query sees it', listed.docs.some((d) => d.id === 'entry-1'));
  check('timer is gone', !(await getDoc(doc(db, `users/${me.uid}/state/timer`))).exists());
  const closed = (await getDoc(doc(db, `users/${me.uid}/state/timerClosed`))).data();
  check('timerClosed marker', closed?.startedAt === startedAt && typeof closed.closedAt === 'string');

  // 2. Already stopped on another device: nothing logged.
  check('no timer: gone', saveStop({ ...base, entryId: 'entry-2', seconds: 60 }) === 'GONE');
  check('…and nothing logged', !(await getDoc(doc(db, `users/${me.uid}/entries/entry-2`))).exists());

  // 3. A later timer replaced it: that one is left running.
  await startTimer('2026-11-05T11:00:00.000Z');
  check('another timer: gone', saveStop({ ...base, entryId: 'entry-3', seconds: 60 }) === 'GONE');
  check('…the other timer still runs', (await getDoc(doc(db, `users/${me.uid}/state/timer`))).data()?.startedAt === '2026-11-05T11:00:00.000Z');
  // Same start, different metric: not ours either.
  await startTimer(startedAt, 'm2');
  check('same start, other metric: gone', saveStop({ ...base, entryId: 'entry-3b', seconds: 60 }) === 'GONE');

  // 4. Over 12 hours: stopped, nothing logged (the app asks first).
  await startTimer();
  check('held stop saves', saveStop({ ...base, entryId: 'entry-4', seconds: 13 * 3600, log: false }) === 'SAVED');
  check('…without an entry', !(await getDoc(doc(db, `users/${me.uid}/entries/entry-4`))).exists());
  check('…and the timer is gone', !(await getDoc(doc(db, `users/${me.uid}/state/timer`))).exists());

  // 5. Under a second: stopped, nothing logged (as stopTimer with 0 seconds).
  await startTimer();
  check('zero seconds saves', saveStop({ ...base, entryId: 'entry-5', seconds: 0 }) === 'SAVED');
  check('…without an entry', !(await getDoc(doc(db, `users/${me.uid}/entries/entry-5`))).exists());

  // 6. Session problems never write.
  await startTimer();
  check('bad refresh token: auth', saveStop({ ...base, refreshToken: 'not-a-token', entryId: 'entry-6', seconds: 60 }) === 'AUTH');
  const other = await signUp('other@example.com');
  check('token for another account: auth', saveStop({ ...base, refreshToken: other.refreshToken, entryId: 'entry-6', seconds: 60 }) === 'AUTH');
  check('…timer untouched', (await getDoc(doc(db, `users/${me.uid}/state/timer`))).exists());

  // 7. The rules still apply: another account's timer can't be stopped.
  const otherDb = env.authenticatedContext(other.uid).firestore();
  await setDoc(doc(otherDb, `users/${other.uid}/state/timer`), { metricId: 'm1', startedAt, deviceId: 'x', updatedAt: startedAt });
  // (Session uid = other's, token = mine: refused before any write.)
  check('someone else’s timer: refused', saveStop({ ...base, uid: other.uid, entryId: 'entry-7', seconds: 60 }) === 'AUTH');
  check('…their timer untouched', (await getDoc(doc(otherDb, `users/${other.uid}/state/timer`))).exists());

  // 8. No network: retry later, nothing written.
  check('unreachable: retry', saveStop({ ...base, entryId: 'entry-8', seconds: 60, fsBase: 'http://127.0.0.1:9' }) === 'RETRY');

  await env.cleanup();
} catch (e) {
  failed++;
  console.error(e);
} finally {
  stop();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll native REST checks passed');
process.exit(failed ? 1 : 0);

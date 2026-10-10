// Starts the Firestore emulator, runs e2e/rules.mjs against it, and stops it.
// (`firebase emulators:exec` leaves the Java process running on Windows.)
//
//   npm run test:rules
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const emu = spawn('npx firebase emulators:start --project demo-logbook --only firestore', { cwd: root, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
const stop = () => {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${emu.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-emu.pid);
  } catch { /* already gone */ }
};
process.on('SIGINT', () => { stop(); process.exit(130); });

let code = 1;
try {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { await fetch('http://127.0.0.1:8080'); up = true; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  if (!up) throw new Error('Firestore emulator didn’t come up on 8080');
  code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [fileURLToPath(new URL('./rules.mjs', import.meta.url))], { cwd: root, stdio: ['ignore', 'inherit', 'ignore'] });
    p.on('close', resolve);
  });
} catch (e) {
  console.error(e.message);
} finally {
  stop();
}
process.exitCode = code;

// Lists every file of the built web app (dist/) with its size and SHA-256 in dist/app-bundle.json.
// The Android app downloads newer web versions from the live site with it, and checks every file
// (android/.../BundleUpdater.java). Runs at the end of `npm run build`, so every deploy has one.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const OUT = 'app-bundle.json';

// The native API this web code needs (src/lib/native.ts): an older APK won't switch to it.
const match = /export const NATIVE_API = (\d+);/.exec(readFileSync('src/lib/native.ts', 'utf8'));
if (!match) throw new Error('NATIVE_API not found in src/lib/native.ts');
const minNative = Number(match[1]);

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(DIST)
  .map((full) => relative(DIST, full).split(sep).join('/'))
  .filter((path) => path !== OUT && !path.split('/').some((part) => part.startsWith('.')))
  .sort()
  .map((path) => {
    const buf = readFileSync(join(DIST, path));
    return { path, size: buf.length, sha256: sha(buf) };
  });

const version = sha(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).slice(0, 16);
// builtAt orders versions: an APK built from newer code than the live site must not switch back.
const builtAt = new Date().toISOString();
writeFileSync(join(DIST, OUT), JSON.stringify({ version, builtAt, minNative, files }, null, 1) + '\n');
console.log(`${OUT}: version ${version}, ${files.length} files, needs native API ${minNative}`);

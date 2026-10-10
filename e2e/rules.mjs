// Security rules, against the Firestore emulator:
//
//   npm run test:rules
//
// (runs this file under `firebase emulators:exec --only firestore`). A and B
// pair up; C is a stranger; ADMIN is Malek's account.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const rules = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-logbook', firestore: { rules, host: '127.0.0.1', port: 8080 } });
const ADMIN = 'mRRUx09pGmNZcOlLoBH5KWF9lxh1';
const as = (uid) => env.authenticatedContext(uid).firestore();
const A = as('A');
const B = as('B');
const C = as('C');
const anon = env.unauthenticatedContext().firestore();

let failed = 0;
async function check(label, p) {
  try {
    await p;
    console.log('•', label + ':', true);
  } catch (e) {
    failed++;
    console.log('•', label + ':', false, '-', e.message.split('\n')[0]);
  }
}

const invite = (code, fromUid) => ({ code, fromUid, fromName: fromUid, weekStartsOn: 1, createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-17T10:00:00Z' });
const pair = (id, members) => ({ id, members, names: Object.fromEntries(members.map((m) => [m, m])), weekStartsOn: 1, createdAt: '2026-10-10T10:00:00Z', endedAt: null });

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/A/metrics/m1'), { name: 'Studying' });
  });

  // ── Existing rules still hold ──
  await check('Owner reads own data', assertSucceeds(getDoc(doc(A, 'users/A/metrics/m1'))));
  await check('Another user can’t read it', assertFails(getDoc(doc(B, 'users/A/metrics/m1'))));
  await check('Admin can read it', assertSucceeds(getDoc(doc(as(ADMIN), 'users/A/metrics/m1'))));
  await check('Admin can’t write it', assertFails(setDoc(doc(as(ADMIN), 'users/A/metrics/m2'), { name: 'x' })));

  // ── Invites ──
  await check('A creates an invite', assertSucceeds(setDoc(doc(A, 'invites/AAAAAA'), invite('AAAAAA', 'A'))));
  await check('Can’t create an invite as someone else', assertFails(setDoc(doc(C, 'invites/CCCCCC'), invite('CCCCCC', 'A'))));
  await check('Can’t add extra fields to an invite', assertFails(setDoc(doc(A, 'invites/AAAAA2'), { ...invite('AAAAA2', 'A'), members: ['A', 'C'] })));
  await check('Code must match the doc id', assertFails(setDoc(doc(A, 'invites/AAAAA3'), invite('ZZZZZZ', 'A'))));
  await check('Can’t overwrite an existing invite', assertFails(setDoc(doc(C, 'invites/AAAAAA'), invite('AAAAAA', 'C'))));
  await check('B can look up a code', assertSucceeds(getDoc(doc(B, 'invites/AAAAAA'))));
  await check('Looking up a missing code is allowed', assertSucceeds(getDoc(doc(B, 'invites/NOSUCH'))));
  await check('Signed out can’t look up a code', assertFails(getDoc(doc(anon, 'invites/AAAAAA'))));
  await check('B can’t list invites', assertFails(getDocs(collection(B, 'invites'))));
  await check('A lists own invites', assertSucceeds(getDocs(query(collection(A, 'invites'), where('fromUid', '==', 'A')))));
  await check('B can’t delete A’s invite on its own', assertFails(deleteDoc(doc(B, 'invites/AAAAAA'))));

  // ── Pairing ──
  await check('Can’t pair without an invite', assertFails(setDoc(doc(B, 'pairs/NOPEEE'), pair('NOPEEE', ['A', 'B']))));
  await check('Can’t pair leaving the inviter out', assertFails(setDoc(doc(B, 'pairs/AAAAAA'), pair('AAAAAA', ['C', 'B']))));
  await check('Can’t pair others', assertFails(setDoc(doc(C, 'pairs/AAAAAA'), pair('AAAAAA', ['A', 'B']))));
  await check('Inviter can’t use their own code', assertFails(setDoc(doc(A, 'pairs/AAAAAA'), pair('AAAAAA', ['A', 'A']))));
  await check('B joins: pair created and invite removed in one batch', assertSucceeds((() => {
    const b = writeBatch(B);
    b.set(doc(B, 'pairs/AAAAAA'), pair('AAAAAA', ['A', 'B']));
    b.delete(doc(B, 'invites/AAAAAA'));
    return b.commit();
  })()));
  await check('Invite is gone', assertSucceeds(getDoc(doc(A, 'invites/AAAAAA')).then((s) => { if (s.exists()) throw new Error('still there'); })));
  await check('Can’t make a new invite with a used code', assertFails(setDoc(doc(C, 'invites/AAAAAA'), invite('AAAAAA', 'C'))));
  await check('A finds the pair by query', assertSucceeds(getDocs(query(collection(A, 'pairs'), where('members', 'array-contains', 'A')))));
  await check('B reads the pair', assertSucceeds(getDoc(doc(B, 'pairs/AAAAAA'))));
  await check('C can’t read the pair', assertFails(getDoc(doc(C, 'pairs/AAAAAA'))));
  await check('C can’t list all pairs', assertFails(getDocs(collection(C, 'pairs'))));
  await check('A renames themselves', assertSucceeds(updateDoc(doc(A, 'pairs/AAAAAA'), { 'names.A': 'Malek' })));
  await check('A can’t rename B', assertFails(updateDoc(doc(A, 'pairs/AAAAAA'), { 'names.B': 'Loser' })));
  await check('Can’t set an empty name', assertFails(updateDoc(doc(A, 'pairs/AAAAAA'), { 'names.A': '' })));
  await check('Can’t set a name over 30 characters', assertFails(updateDoc(doc(A, 'pairs/AAAAAA'), { 'names.A': 'x'.repeat(31) })));
  await check('C can’t rename anyone', assertFails(updateDoc(doc(C, 'pairs/AAAAAA'), { 'names.C': 'C' })));
  await check('Members can’t be changed', assertFails(updateDoc(doc(A, 'pairs/AAAAAA'), { members: ['A', 'C'] })));
  await check('Pairing never opens users/', assertFails(getDoc(doc(B, 'users/A/metrics/m1'))));

  // ── Links, challenges, scores ──
  const link = { id: 'l1', metrics: { A: 'm1' }, type: 'duration', proposedBy: 'A', createdAt: 'x', acceptedAt: null, startDate: null, endedAt: null };
  await check('A proposes a link', assertSucceeds(setDoc(doc(A, 'pairs/AAAAAA/links/l1'), link)));
  await check('Can’t propose as the other member', assertFails(setDoc(doc(A, 'pairs/AAAAAA/links/l2'), { ...link, id: 'l2', proposedBy: 'B' })));
  await check('B accepts it', assertSucceeds(updateDoc(doc(B, 'pairs/AAAAAA/links/l1'), { 'metrics.B': 'x', acceptedAt: 'y', startDate: '2026-10-05' })));
  await check('C can’t read links', assertFails(getDoc(doc(C, 'pairs/AAAAAA/links/l1'))));
  await check('C can’t add a link', assertFails(setDoc(doc(C, 'pairs/AAAAAA/links/l3'), { ...link, id: 'l3', proposedBy: 'C' })));
  const ch = { id: 'c1', linkId: 'l1', kind: 'most_total', amount: null, startDate: '2026-10-05', endDate: '2026-10-11', createdBy: 'B', createdAt: 'x', acceptedAt: null, declinedAt: null, cancelledAt: null };
  await check('B starts a challenge', assertSucceeds(setDoc(doc(B, 'pairs/AAAAAA/challenges/c1'), ch)));
  await check('Can’t start one as the other member', assertFails(setDoc(doc(B, 'pairs/AAAAAA/challenges/c2'), { ...ch, id: 'c2', createdBy: 'A' })));
  await check('A accepts it', assertSucceeds(updateDoc(doc(A, 'pairs/AAAAAA/challenges/c1'), { acceptedAt: 'z' })));
  await check('C can’t read challenges', assertFails(getDoc(doc(C, 'pairs/AAAAAA/challenges/c1'))));
  const score = { uid: 'A', asOf: '2026-10-10', updatedAt: 'x', metrics: {} };
  await check('A publishes its score', assertSucceeds(setDoc(doc(A, 'pairs/AAAAAA/scores/A'), score)));
  await check('A can’t write B’s score', assertFails(setDoc(doc(A, 'pairs/AAAAAA/scores/B'), { ...score, uid: 'B' })));
  await check('B reads A’s score', assertSucceeds(getDoc(doc(B, 'pairs/AAAAAA/scores/A'))));
  await check('C can’t read scores', assertFails(getDoc(doc(C, 'pairs/AAAAAA/scores/A'))));
  await check('C can’t write a score there', assertFails(setDoc(doc(C, 'pairs/AAAAAA/scores/C'), { ...score, uid: 'C' })));

  // ── Unlinking ──
  await check('B unlinks', assertSucceeds(updateDoc(doc(B, 'pairs/AAAAAA'), { endedAt: '2026-10-11T00:00:00Z' })));
  await check('After unlinking, no more publishing', assertFails(setDoc(doc(A, 'pairs/AAAAAA/scores/A'), score)));
  await check('After unlinking, no new links', assertFails(setDoc(doc(A, 'pairs/AAAAAA/links/l4'), { ...link, id: 'l4' })));
  await check('History still readable by members', assertSucceeds(getDoc(doc(A, 'pairs/AAAAAA/scores/A'))));

  // Inviter cancelling their own invite.
  await setDoc(doc(A, 'invites/BBBBBB'), invite('BBBBBB', 'A'));
  await check('Inviter cancels own invite', assertSucceeds(deleteDoc(doc(A, 'invites/BBBBBB'))));
} catch (e) {
  failed++;
  console.log('FAILED:', e.message);
} finally {
  await env.cleanup();
}
console.log(failed ? `\n${failed} failed.` : '\nAll rules checks passed.');
process.exitCode = failed ? 1 : 0;

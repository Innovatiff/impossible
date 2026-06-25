/**
 * One-time seeding script for the Hunt 3 ("The Locked Chamber") leaderboard.
 *
 * Writes 38 ghost solvers directly to Firestore with ADMIN privileges, so it
 * works regardless of client-side security rules or browser state. Idempotent:
 * it skips any seeded solver whose name is already present, so it is safe to
 * run more than once.
 *
 * USAGE
 *   1. In the Firebase console: Project Settings → Service accounts →
 *      "Generate new private key". Save the JSON as serviceAccount.json
 *      in this folder (it is gitignored — never commit it).
 *   2. npm install firebase-admin
 *   3. node scripts/seed-hunt3-leaderboard.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const HUNT_ID = 'hunt-3';

const RAW = [
  ['V. Ashworth', 3841, 0], ['T. Lindqvist', 4112, 0], ['M. Castellano', 4389, 1],
  ['R. Oyelaran', 4714, 0], ['A. Bergstrom', 5023, 1], ['S. Nakamura', 5388, 2],
  ['F. Dubois', 5905, 1], ['E. Mokoena', 6241, 3], ['H. Volkov', 3977, 0],
  ['C. Albright', 4203, 0], ['N. Petrova', 4456, 0], ['D. Whitlock', 4538, 1],
  ['L. Marchetti', 4602, 0], ['P. Okonkwo', 4790, 1], ['G. Sørensen', 4865, 0],
  ['I. Vukovic', 4951, 2], ['B. Hargreaves', 5097, 0], ['K. Adeyemi', 5168, 1],
  ['O. Lindgren', 5240, 0], ['W. Pemberton', 5319, 2], ['J. Moreau', 5471, 1],
  ['Z. Khoury', 5544, 0], ['Y. Sokolova', 5630, 2], ['C. Fairbanks', 5718, 1],
  ['M. Esposito', 5803, 3], ['A. Nwosu', 5990, 0], ['T. Bjornsson', 6078, 2],
  ['R. Sinclair', 6155, 1], ['E. Kovac', 6330, 2], ['D. Achterberg', 6417, 0],
  ['S. Mbeki', 6502, 3], ['F. Lombardi', 6588, 1], ['L. Haugen', 6671, 2],
  ['N. Dragomir', 6754, 0], ['P. Castellanos', 6840, 4], ['A. Tremblay', 6925, 1],
  ['V. Rasmussen', 7011, 2], ['O. Babatunde', 7098, 3], ['C. Devereux', 7184, 1],
];

const SEEDS = RAW.map(([name, time, cluesUsed]) => ({
  name, time, cluesUsed,
  score: Math.max(0, 10000 - Math.floor(time / 10) - cluesUsed * 600),
  seeded: true,
}));

async function run() {
  const col = db.collection('leaderboard').doc(HUNT_ID).collection('entries');
  const snap = await col.get();
  const existing = new Set();
  snap.forEach(d => { const x = d.data(); if (x.seeded) existing.add(x.name); });

  let added = 0;
  for (const e of SEEDS) {
    if (existing.has(e.name)) continue;
    await col.add({ ...e, uid: null, completedAt: FieldValue.serverTimestamp() });
    added++;
    console.log('  + ' + e.name + '  (score ' + e.score + ')');
  }
  console.log(`\nDone. Added ${added} solver(s); ${SEEDS.length - added} already present.`);
  process.exit(0);
}

run().catch(err => { console.error('Seeding failed:', err); process.exit(1); });

/**
 * One-time seeding script for the Hunt 4 ("The Whitmore Affair") leaderboard.
 *
 * Writes 35 ghost solvers directly to Firestore with ADMIN privileges, so it
 * works regardless of client-side security rules or browser state. Idempotent:
 * it skips any seeded solver whose name is already present, so it is safe to
 * run more than once.
 *
 * Times are stored in SECONDS. Hunt 4 is a long deduction puzzle, so the ghost
 * solvers range from 120 to 200 minutes (7200–12000 seconds), with 0–5 clues used.
 *
 * USAGE
 *   1. In the Firebase console: Project Settings → Service accounts →
 *      "Generate new private key". Save the JSON as serviceAccount.json
 *      in this folder (it is gitignored — never commit it).
 *   2. npm install firebase-admin
 *   3. node scripts/seed-hunt4-leaderboard.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const HUNT_ID = 'hunt-4';

// [name, time-in-seconds (120–200 min), cluesUsed (0–5)]
const RAW = [
  ['E. Calloway-Reed', 7234, 0], ['M. Whitford', 7421, 1], ['A. Pemberton', 7588, 0],
  ['D. Ashby', 7715, 2], ['S. Henley', 7860, 1], ['R. Marchand', 8002, 0],
  ['T. Okonjo', 8190, 3], ['V. Lindqvist', 8344, 1], ['L. Esposito', 8501, 0],
  ['N. Balakrishnan', 8662, 2], ['C. Fairweather', 8810, 1], ['B. Sørensen', 8955, 0],
  ['K. Adebayo', 9104, 4], ['F. Moreau', 9258, 1], ['G. Petrova', 9401, 2],
  ['H. Whitmore', 9550, 0], ['I. Castellano', 9712, 3], ['J. Nakamura', 9866, 1],
  ['O. Vukovic', 10018, 2], ['P. Hargreaves', 10175, 0], ['Q. Mbeki', 10322, 5],
  ['R. Sinclair', 10488, 1], ['S. Dragomir', 10631, 2], ['T. Bjornsson', 10790, 3],
  ['U. Achterberg', 10944, 0], ['W. Lombardi', 11102, 1], ['X. Devereux', 11258, 4],
  ['Y. Babatunde', 11411, 2], ['Z. Haugen', 11566, 1], ['A. Tremblay', 11719, 0],
  ['B. Rasmussen', 11868, 3], ['C. Sokolova', 11420, 2], ['D. Khoury', 11955, 5],
  ['E. Oyelaran', 7990, 1], ['F. Volkov', 8420, 2],
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

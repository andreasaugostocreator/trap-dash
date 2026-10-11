// Prints the difficulty rating of every level, and the threat of each kind of trap. Usage: node tools/rate.mjs [-v]
import { LEVELS } from '../src/levels.js';
import { rateLevel } from '../src/rating.js';
const verbose = process.argv.includes('-v');
for (const L of LEVELS) {
  const r = rateLevel(L);
  console.log(`${'★'.repeat(r.stars).padEnd(3, '☆')}  ${L.name.padEnd(16)} score ${String(r.score).padStart(5)}  traps ${r.trapScore} (${r.traps.length})  combos ${r.combos}  platforming ${r.platform}`);
  if (verbose) for (const t of r.traps) console.log(`       ${t.kind.padEnd(9)} x${String(t.x).padEnd(4)} margin ${String(t.margin).padStart(5)}  threat ${t.threat}${t.jumpable ? ' (jumpable)' : ''}${t.lethal ? '' : ' (not deadly)'}`);
}

// Checks every level can be finished with the real physics (traps idle, no gadgets). Usage: node tools/solve.mjs [levelId]
import { LEVELS } from '../src/levels.js';
import { solve } from '../src/solver.js';
const only = process.argv[2];
let bad = 0;
for (const lv of LEVELS) {
  if (only && lv.id !== only) continue;
  const t = Date.now(), r = solve(lv);
  console.log(`${lv.id.padEnd(10)} ${r.ok ? 'OK ' : 'FAIL'} expanded ${r.expanded}${r.ok ? `, about ${r.time.toFixed(1)}s of play` : ` closest tile ${r.best.x},${r.best.y}`} (${Date.now() - t}ms)`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);

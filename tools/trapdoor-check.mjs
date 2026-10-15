// Does every trapdoor matter? For each group of trapdoor tiles, open it for good and ask the solver whether the level
// can still be finished. If it can, the runner can simply jump over it: that trapdoor is "skippable".
// Usage: node tools/trapdoor-check.mjs [levelId]
import { LEVELS } from '../src/levels.js';
import { solve } from '../src/solver.js';
const only = process.argv[2];
let skippable = 0, total = 0;
for (const lv of LEVELS) {
  if (only && lv.id !== only) continue;
  const rows = lv.map, groups = [];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'T' && r[x - 1] !== 'T') { let x1 = x; while (r[x1 + 1] === 'T') x1++; groups.push({ y, x0: x, x1 }); } });
  const out = [];
  for (const g of groups) {
    const map = rows.map((r, y) => y === g.y ? r.slice(0, g.x0) + '.'.repeat(g.x1 - g.x0 + 1) + r.slice(g.x1 + 1) : r);
    const r = solve({ ...lv, map }, 120000);
    total++; if (r.ok) skippable++;
    out.push(`${g.x0}-${g.x1}@${g.y} (${g.x1 - g.x0 + 1} wide) ${r.ok ? 'SKIPPABLE' : 'needed'}`);
  }
  if (groups.length) console.log(lv.id.padEnd(10), out.join(' | '));
}
console.log(`${skippable} of ${total} trapdoors can be jumped over`);

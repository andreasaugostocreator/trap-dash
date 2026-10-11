// Checks every level can be finished with the real physics (traps idle), by a greedy search over
// short input chunks. Usage: node tools/solve.mjs [levelId]
import { World } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { DT } from '../src/config.js';

const CHUNK = 6;
const ACTIONS = [];
for (const dir of [-1, 0, 1]) for (const jump of [0, 1, 2]) ACTIONS.push({ dir, jump }); // 0 none, 1 press+hold, 2 keep holding

function solve(level) {
  const w = new World(level);
  const goal = { x: w.goal.x, y: w.goal.y };
  const key = p => [Math.round(p.x / 3), Math.round(p.y / 3), Math.round(p.vx / 45), Math.round(p.vy / 70), p.onGround ? 1 : 0].join(',');
  const h = p => Math.hypot(p.x - goal.x, (p.y - goal.y) * 1.3);
  const seen = new Set();
  let open = [{ p: { ...w.player }, f: h(w.player), path: [] }];
  let expanded = 0, best = null;
  while (open.length && expanded < 400000) {
    // pop best
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const n = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    expanded++;
    if (!best || n.f - n.path.length * 2 < best.d) best = { d: n.f - n.path.length * 2, x: (n.p.x / 16).toFixed(1), y: (n.p.y / 16).toFixed(1) };
    for (const a of ACTIONS) {
      if (a.jump === 2 && n.p.vy >= 0) continue;
      w.player = { ...n.p, cp: { ...n.p.cp } };
      let ok = true;
      for (let i = 0; i < CHUNK; i++) {
        w.step(DT, { left: a.dir < 0, right: a.dir > 0, jump: a.jump > 0, jumpPressed: a.jump === 1 && i === 0 });
        if (w.player.dead) { ok = false; break; }
        if (w.player.finished) return { ok: true, expanded, steps: (n.path.length + 1) * CHUNK };
      }
      w.events.length = 0;
      if (!ok) continue;
      const k = key(w.player);
      if (seen.has(k)) continue;
      seen.add(k);
      if (open.length > 200000) continue;
      open.push({ p: { ...w.player }, f: h(w.player) + n.path.length * 2, path: { length: n.path.length + 1 } });
    }
  }
  return { ok: false, expanded, best };
}

const only = process.argv[2];
let bad = 0;
for (const lv of LEVELS) {
  if (only && lv.id !== only) continue;
  const t = Date.now(), r = solve(lv);
  console.log(`${lv.id.padEnd(10)} ${r.ok ? 'OK ' : 'FAIL'} expanded ${r.expanded}${r.ok ? `, about ${(r.steps * DT).toFixed(1)}s of play` : ''} (${Date.now() - t}ms)${r.best ? ' closest tile ' + r.best.x + ',' + r.best.y : ''}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);

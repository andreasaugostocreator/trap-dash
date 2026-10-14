// The pop-up wall: how much does it cost a sprinting runner, depending on when the trapper fires it?
// Reports time lost vs no wall, and whether the runner got shoved. Also a shove into a pit behind (a combo).
import { World } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { DT, TILE } from '../src/config.js';
const L = LEVELS.find(l => l.id === 'windy');
function sprint(fireAt, jumpAt) {   // fireAt / jumpAt: tiles before the wall (null = never); the runner jumps again when it can
  const w = new World(L), t = w.traps.find(q => q.kind === 'wall'), p = w.player, tx = t.x0 * TILE;
  p.x = tx - 8 * TILE; p.y = (t.y + 1) * TILE - 13; p.vx = 132;
  let fired = fireAt === null, shoved = false, jumped = false;
  for (let i = 0; i < 600; i++) {
    if (!fired && p.x + 10 >= tx - fireAt * TILE) fired = w.trigger(t.id, 0);
    const jump = jumpAt !== null && !jumped && p.x + 10 >= tx - jumpAt * TILE;
    if (jump) jumped = true;
    w.step(DT, { right: true, jumpPressed: jump || (p.vx <= 1 && p.onGround && p.x < tx), jump: true });
    if (p.stun > 0) shoved = true;
    if (p.x > tx + 2 * TILE) return { t: i * DT, shoved };
    if (p.dead) return { t: Infinity, shoved };
  }
  return { t: Infinity, shoved };
}
console.log('level', L.id, 'wall height', new World(L).traps.find(q => q.kind === 'wall').tall, 'tiles');
const base = sprint(null, null).t;
for (const jumpAt of [null, 1.5]) {
  const row = [];
  for (let d = 4; d >= 0; d -= 0.5) { const r = sprint(d, jumpAt); row.push(`${d}:${(r.t - base).toFixed(2)}${r.shoved ? '*' : ''}`); }
  console.log(jumpAt === null ? 'runner just runs  ' : 'runner jumps early', 'fire at N tiles → seconds lost (* = shoved):', row.join(' '));
}

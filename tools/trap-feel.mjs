// How catchable are the crusher and the flame? Simulates a runner sprinting past and the trapper firing at
// different moments, and reports which firing moments catch them. Also checks hold-to-burn timing.
import { World } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { TRAPS, DT, TILE } from '../src/config.js';
const L = LEVELS.find(l => l.id === 'hills'), FL = LEVELS.find(l => l.id === 'meadow');   // meadow: flames on flat floor
function sprint(kind, fireAtTiles, hold = 0) {
  const w = new World(kind === 'flame' ? FL : L), t = w.traps.find(q => q.kind === kind), p = w.player;
  const tx = t.x0 * TILE;
  p.x = tx - (kind === 'flame' ? 3.5 : 8) * TILE; p.y = 14 * TILE - 13; p.vx = 132;   // meadow has a pit 4 tiles before its first flame
  let fired = false, held = 0;
  for (let i = 0; i < 180; i++) {
    if (!fired && p.x >= tx - fireAtTiles * TILE) { fired = w.trigger(t.id, 0, hold > 0); }
    if (fired && hold && (held += DT) >= hold) w.release(t.id);
    w.step(DT, { right: true });
    if (p.dead) return 'CAUGHT';
  }
  return 'safe';
}
for (const [kind, hold] of [['crusher', 0], ['flame', 0.01], ['flame', 1.2]]) {
  const row = [];
  for (let d = kind === 'flame' ? 3 : 4; d >= -1; d -= 0.5) row.push(`${d}:${sprint(kind, d, hold) === 'CAUGHT' ? 'X' : '.'}`);
  console.log((kind + (kind === 'flame' ? (hold > 0.5 ? ' held' : ' tap') : '')).padEnd(11), 'fire when the runner is N tiles away (X = caught):', row.join(' '));
}
// The old flame problem: the runner waits, the trapper fires, the runner runs through right after.
for (const hold of [0.01, 1.2]) {
  const w = new World(FL), t = w.traps.find(q => q.kind === 'flame'), p = w.player;
  p.x = t.x0 * TILE - 2 * TILE; p.y = 14 * TILE - 13;
  w.trigger(t.id, 0, true); let held = 0, ran = false, caught = false;
  for (let i = 0; i < 200; i++) {
    if ((held += DT) >= hold) w.release(t.id);
    const go = t.t > 0.36 || t.state === 'idle';   // the runner goes the moment a tap-length burst would be over
    w.step(DT, { right: go }); if (p.dead) { caught = true; break; }
  }
  console.log(`runner waits out ${hold > 0.5 ? 'a long held burn' : 'a tap'} and goes after 0.36 s: ${caught ? 'CAUGHT' : 'safe'}`);
}
const w = new World(FL), f = w.traps.find(q => q.kind === 'flame');
w.trigger(f.id, 0, true); let n = 0;
while (f.state !== 'idle' && n < 400) { if (n === 90) w.release(f.id); w.stepTraps(DT); n++; }
console.log(`flame held 1.5 s then released: burned until ${(n * DT).toFixed(2)} s, cooldown ${f.cd.toFixed(2)} s`);
const w2 = new World(FL), f2 = w2.traps.find(q => q.kind === 'flame');
w2.trigger(f2.id, 0, false); n = 0;
while (f2.state !== 'idle' && n < 400) { w2.stepTraps(DT); n++; }
console.log(`flame tapped: burned until ${(n * DT).toFixed(2)} s, cooldown ${f2.cd.toFixed(2)} s`);

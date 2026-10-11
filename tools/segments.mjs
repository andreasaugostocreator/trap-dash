// Every generator segment on its own, at every tier and a few floor heights: can the solver get through? Usage: node tools/segments.mjs
import { SEGMENTS } from '../src/gen.js';
import { solve } from '../src/solver.js';
const H = 18, rnd = () => 0.3;
let bad = 0;
for (const s of SEGMENTS) for (const tier of s.tiers) for (const f0 of [15, 13, 11]) {
  const g = Array.from({ length: H }, () => Array(80).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < 80 && y < H) g[y][x] = c; };
  const grid = { set, rect: (x0, y0, x1, y1, c = '#') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); } };
  grid.ground = (x0, x1, top) => grid.rect(x0, top, x1, H - 1); grid.row = (x0, x1, y, c) => grid.rect(x0, y, x1, y, c);
  grid.rect(0, 0, 0, H - 1); grid.ground(1, 6, f0); set(3, f0 - 1, 'S');
  const res = s.make(grid, rnd, 7, f0, tier);
  if (!res) continue;
  const [x, f] = res; grid.ground(x, x + 5, f); set(x + 3, f - 1, 'G'); grid.rect(x + 6, 0, x + 6, H - 1);
  const map = g.map(r => r.slice(0, x + 7).join(''));
  const out = solve({ id: 't', name: 't', map }, 80000);
  if (!out.ok) { bad++; console.log(`${s.id} tier ${tier} floor ${f0}: FAIL near ${out.best.x},${out.best.y}`); console.log(map.join('\n')); }
}
console.log(bad ? `${bad} failing` : 'all segments passable');

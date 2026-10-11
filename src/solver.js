// Can this level be finished? A greedy best-first search over short input chunks using the real physics,
// with every trap idle and no gadgets. Used by the level generator and tools/solve.mjs.
import { World } from './sim.js';
import { DT } from './config.js';

const CHUNK = 6;
const ACTIONS = [];
for (const dir of [-1, 0, 1]) for (const jump of [0, 1, 2]) ACTIONS.push({ dir, jump });   // jump: 0 none, 1 press+hold, 2 keep holding

export function solve(level, maxExpand = 400000) {
  const w = new World(level);
  for (const id in w.gad.runner) w.gad.runner[id].n = 0;   // no gadgets at all
  const goal = { x: w.goal.x, y: w.goal.y };
  const key = p => [Math.round(p.x / 3), Math.round(p.y / 3), Math.round(p.vx / 45), Math.round(p.vy / 70), p.onGround ? 1 : 0].join(',');
  const h = p => Math.hypot(p.x - goal.x, (p.y - goal.y) * 1.3);
  const seen = new Set();
  // a binary heap on f
  const heap = [];
  const push = n => { heap.push(n); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j].f <= heap[i].f) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a].f < heap[m].f) m = a; if (b < heap.length && heap[b].f < heap[m].f) m = b; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  push({ p: { ...w.player }, f: h(w.player), d: 0 });
  let expanded = 0, best = null;
  while (heap.length && expanded < maxExpand) {
    const n = pop();
    expanded++;
    const hd = n.f - n.d * 2;
    if (!best || hd < best.d) best = { d: hd, x: +(n.p.x / 16).toFixed(1), y: +(n.p.y / 16).toFixed(1) };
    for (const a of ACTIONS) {
      if (a.jump === 2 && n.p.vy >= 0) continue;
      w.player = { ...n.p, cp: { ...n.p.cp } };
      let ok = true;
      for (let i = 0; i < CHUNK; i++) {
        w.step(DT, { left: a.dir < 0, right: a.dir > 0, jump: a.jump > 0, jumpPressed: a.jump === 1 && i === 0 });
        if (w.player.dead) { ok = false; break; }
        if (w.player.finished) return { ok: true, expanded, time: (n.d + 1) * CHUNK * DT };
      }
      w.events.length = 0;
      if (!ok) continue;
      const k = key(w.player);
      if (seen.has(k)) continue;
      seen.add(k);
      push({ p: { ...w.player }, f: h(w.player) + (n.d + 1) * 2, d: n.d + 1 });
    }
  }
  return { ok: false, expanded, best };
}

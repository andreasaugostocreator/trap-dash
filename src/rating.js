// How hard is a level? Each trap gets a threat score from 0 (harmless) to 1 (you will need to outsmart it),
// then the level adds up its traps, its platforming and how far apart the checkpoints are. See DESIGN.md.
import { TILE, PHYS, TRAPS, TRAP_LOCK } from './config.js';
import { World, SPIKE, CEILSPIKE } from './sim.js';

const V = PHYS.maxRun;            // runner speed, px/s
const REACT = 0.25;               // human reaction time to a telegraph, s
const TURN = 0.1;                 // time to stop before running back, s
const JUMP_SPAN = 4.6 * TILE;     // how far a full running jump carries, px
const JUMP_CLEAR = 0.06;          // time to get a few pixels off the floor, s

// Worst-case time to get out of a strip of width L when you may run on or turn back.
const runEscape = L => (L + TURN * V) / (2 * V);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function trapThreat(world, t, cpDist) {
  const C = TRAPS[t.kind], w = (t.x1 - t.x0 + 1) * TILE, L = w + PHYS.w;
  const out = { kind: t.kind, x: t.x0 };
  let window = C.warn, escape = runEscape(L), lethal = true, exposure = L / V, jumpable = false;
  if (t.kind === 'spikes' || t.kind === 'trapdoor') {
    jumpable = w + PHYS.w <= JUMP_SPAN;            // a short strip can be jumped over entirely
    if (t.kind === 'spikes') escape = JUMP_CLEAR;  // spikes are low: a hop gets you out
  }
  if (t.kind === 'crusher') window += Math.sqrt(2 * Math.max(TILE, t.drop) / C.fallG);
  if (C.family === 'emitter') { window += 24 / C.shot.speed; escape = 0.12; exposure = 6 * TILE / V; }
  if (t.kind === 'fan') {   // pushes up: only deadly if something sharp waits above it
    lethal = false;
    for (let x = t.x0; x <= t.x1; x++) for (let y = t.y - 1; y >= t.y - C.reach - 1; y--) if (world.tile(x, y) === CEILSPIKE) lethal = true;
    window += 0.25;
  }
  if (t.kind === 'wall') lethal = false;
  const margin = window - escape - REACT;
  let threat = clamp(0.5 - margin * 2.5, 0.15, 0.9);
  if (jumpable) threat = Math.min(threat, 0.2 + 0.3 * Math.max(0, (w + PHYS.w) / JUMP_SPAN - 0.75) / 0.25);
  const baitEase = clamp((C.cd - exposure) / C.cd, 0, 1);   // long cooldown vs. time in danger: easy to bait
  threat *= 1 - 0.35 * baitEase;
  if (!lethal) threat *= 0.35;
  const penalty = PHYS.respawn + cpDist / V;                 // seconds lost when it gets you
  threat *= 0.7 + 0.3 * Math.min(1, penalty / 6);
  return Object.assign(out, { margin: +margin.toFixed(2), threat: +threat.toFixed(2), lethal, jumpable });
}

export function rateLevel(level) {
  const world = level instanceof World ? level : new World(level);
  const cps = [world.start.x, ...world.checkpoints.map(c => c.x)].sort((a, b) => a - b);
  const cpBefore = x => cps.filter(c => c <= x).pop() ?? world.start.x;
  const traps = world.traps.map(t => trapThreat(world, t, Math.abs(t.x0 * TILE - cpBefore(t.x0 * TILE))));
  const trapScore = traps.reduce((s, t) => s + t.threat, 0);
  // Combos: deadly traps close enough to be chained right after the trapper's lock-out.
  let combos = 0;
  const lethal = traps.filter(t => t.lethal).sort((a, b) => a.x - b.x);
  for (let i = 1; i < lethal.length; i++) if (lethal[i].x - lethal[i - 1].x <= Math.ceil(TRAP_LOCK * V / TILE) + 3) combos++;
  // Platforming: deadly pits (no floor all the way down), measured against the longest jump, and static spikes.
  let pits = 0, spikes = 0, run = 0;
  const groundAt = x => { for (let y = 0; y < world.h; y++) if (world.tile(x, y) !== 0) return true; return false; };
  for (let x = 0; x <= world.w; x++) {
    if (x < world.w && !groundAt(x)) { run++; continue; }
    if (run) pits += Math.pow(run * TILE / JUMP_SPAN, 2);
    run = 0;
  }
  for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] === SPIKE || world.tiles[i] === CEILSPIKE) spikes++;
  const vertical = world.h > 24 ? 1.5 : 0;                   // climbing: a slip costs a long fall
  const gaps = cps.slice(1).map((c, i) => c - cps[i]).concat([world.goal.x - cps[cps.length - 1]]);
  const longest = Math.max(...gaps) / TILE;                  // longest stretch without a checkpoint, in tiles
  const platform = pits + spikes * 0.08 + vertical + Math.max(0, longest - 40) * 0.03;
  const score = trapScore + combos * 0.3 + platform;
  const stars = score < STAR2 ? 1 : score < STAR3 ? 2 : 3;
  return { score: +score.toFixed(2), stars, trapScore: +trapScore.toFixed(2), combos, platform: +platform.toFixed(2), traps };
}
export const STAR2 = 4.5, STAR3 = 7.5;

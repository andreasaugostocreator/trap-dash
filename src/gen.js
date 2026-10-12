// Random levels. A level is a string of hand-designed segments (a gap, a crusher hall, a fan corridor...),
// each with a tier 1-3. The generator picks segments to suit the requested star rating, adds checkpoints for pacing,
// then keeps the level only if the rater agrees on the stars and the solver can finish it.
import { rateLevel } from './rating.js';
import { solve } from './solver.js';

const H = 18;
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Grid {
  constructor(w) { this.w = w; this.g = Array.from({ length: H }, () => Array(w).fill('.')); }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < H) this.g[y][x] = c; }
  rect(x0, y0, x1, y1, c = '#') { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  ground(x0, x1, top) { this.rect(x0, top, x1, H - 1); }
  row(x0, x1, y, c) { this.rect(x0, y, x1, y, c); }
}

// Each segment: (grid, rng, x, floor, tier) -> [nextX, nextFloor]. floor = the row of the top ground tile.
// kinds: the traps it uses (a level keeps to at most 6 kinds so the trap bar fits).
const pick = (r, a) => a[Math.floor(r() * a.length)];
export const SEGMENTS = [
  { id: 'flat', kinds: [], tiers: [1], make: (g, r, x, f) => { const n = 4 + Math.floor(r() * 3); g.ground(x, x + n - 1, f); return [x + n, f]; } },
  { id: 'step', kinds: [], tiers: [1, 2], make: (g, r, x, f, tier) => {
    const df = pick(r, tier > 1 ? [-2, -1, 1, 2] : [-1, 1]), f2 = Math.max(9, Math.min(15, f + df));
    g.ground(x, x + 2, f); g.ground(x + 3, x + 6, f2); return [x + 7, f2]; } },
  { id: 'gap', kinds: [], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    const gap = tier + 1, f2 = Math.min(15, f + (r() < 0.4 ? 1 : 0));
    g.ground(x, x + 2, f); g.ground(x + 3 + gap, x + 5 + gap, f2); return [x + 6 + gap, f2]; } },
  { id: 'jag', kinds: [], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {   // static spikes to hop
    const n = Math.min(3, tier); g.ground(x, x + 7, f); g.row(x + 3, x + 2 + n, f - 1, '^'); return [x + 8, f]; } },
  { id: 'hop', kinds: [], tiers: [2, 3], make: (g, r, x, f) => {   // one-way platforms over a pit
    g.ground(x, x + 1, f); g.row(x + 4, x + 5, f - 1, '='); g.row(x + 8, x + 9, f - 2, '=');
    g.ground(x + 12, x + 14, f - 1); return [x + 15, f - 1]; } },
  { id: 'spring', kinds: [], tiers: [1, 2], make: (g, r, x, f) => {
    if (f < 9) return null;
    g.ground(x, x + 5, f); g.set(x + 3, f, 'B'); g.ground(x + 6, x + 7, f - 6); g.ground(x + 8, x + 12, f); return [x + 13, f]; } },
  { id: 'spikes', kinds: ['spikes'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    g.ground(x, x + 9, f); g.row(x + 3, x + 3 + tier, f - 1, 'P'); return [x + 10, f]; } },
  { id: 'trapdoor', kinds: ['trapdoor'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    const w = tier > 1 ? 4 : 3;
    g.ground(x, x + 2, f); g.row(x + 3, x + 2 + w, f, 'T'); g.ground(x + 3 + w, x + 5 + w, f); return [x + 6 + w, f]; } },
  { id: 'crusher', kinds: ['crusher'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    const n = tier === 3 ? 2 : 1, w = 8 + n * 3;
    g.ground(x, x + w - 1, f); g.rect(x + 2, Math.max(0, f - 9), x + w - 3, f - 6);
    for (let i = 0; i < n; i++) g.row(x + 3 + i * 4, x + 4 + i * 4, f - 5, 'X');
    return [x + w, f]; } },
  { id: 'flame', kinds: ['flame'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    g.ground(x, x + 4 + tier * 3, f); for (let i = 0; i < tier; i++) g.set(x + 3 + i * 3, f, 'F'); return [x + 5 + tier * 3, f]; } },
  { id: 'cannon', kinds: ['cannon'], tiers: [1, 2], make: (g, r, x, f) => {
    g.ground(x, x + 11, f); g.set(x + 11, f - 1, '<'); return [x + 12, f]; } },
  { id: 'arrows', kinds: ['arrows'], tiers: [2, 3], make: (g, r, x, f) => {
    g.ground(x, x + 11, f); g.set(x + 11, f - 1, '{'); return [x + 12, f]; } },
  { id: 'wall', kinds: ['wall'], tiers: [1, 2], make: (g, r, x, f) => {
    g.ground(x, x + 7, f); g.set(x + 4, f - 1, 'U'); return [x + 8, f]; } },
  { id: 'fan', kinds: ['fan'], tiers: [2, 3], make: (g, r, x, f) => {   // fans under ceiling spikes: don't get blown up
    if (f < 10) return null;
    g.ground(x, x + 10, f); g.rect(x + 2, f - 9, x + 8, f - 6); g.row(x + 2, x + 8, f - 5, 'v'); g.row(x + 4, x + 6, f, 'W'); return [x + 11, f]; } },
  // ---- the newer traps
  { id: 'saw', kinds: ['saw'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {   // a blade runs along the floor and back
    const n = 3 + tier; g.ground(x, x + n + 3, f); g.row(x + 2, x + 1 + n, f - 1, 'Z'); return [x + n + 4, f]; } },
  { id: 'laser', kinds: ['laser'], tiers: [1, 2], make: (g, r, x, f, tier) => {   // a beam along the floor: hop it
    const n = 8 + tier * 2; g.ground(x, x + n, f); g.set(x, f - 1, '#'); g.set(x + n, f - 1, 'k'); return [x + n + 1, f]; } },
  { id: 'bombs', kinds: ['dropper'], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {   // a low room with bombs in the ceiling
    const n = 6 + tier * 3, c = f - 7; if (c < 1) return null;
    g.ground(x, x + n, f); g.rect(x + 1, Math.max(0, c - 2), x + n - 1, c);
    for (let i = 0; i < tier; i++) g.set(x + 3 + i * 3, c, 'D'); return [x + n + 1, f]; } },
  { id: 'belt', kinds: ['conveyor'], tiers: [1], make: (g, r, x, f) => {
    g.ground(x, x + 9, f); g.row(x + 2, x + 7, f, 'Q'); return [x + 10, f]; } },
  { id: 'ice', kinds: ['ice'], tiers: [1], make: (g, r, x, f) => {   // slippery floor, then spikes you must not slide into
    g.ground(x, x + 10, f); g.row(x + 1, x + 6, f, 'I'); g.row(x + 7, x + 7, f - 1, '^'); return [x + 11, f]; } },
  // ---- combos: a trap placed where the terrain has already taken your options away
  { id: 'beltGap', kinds: ['conveyor'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // the run-up runs backwards
    const gap = tier; g.ground(x, x + 5, f); g.row(x + 1, x + 5, f, 'Q'); g.ground(x + 6 + gap, x + 9 + gap, f); return [x + 10 + gap, f]; } },
  { id: 'iceGap', kinds: ['ice'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // can't stop at the edge
    const gap = tier; g.ground(x, x + 6, f); g.row(x + 1, x + 6, f, 'I'); g.ground(x + 7 + gap, x + 10 + gap, f); return [x + 11 + gap, f]; } },
  { id: 'gapCrusher', kinds: ['crusher'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // it waits over the landing
    if (f < 11) return null;
    const lx = x + 3 + tier; g.ground(x, x + 2, f); g.ground(lx, lx + 5, f);
    g.rect(lx, Math.max(0, f - 10), lx + 4, f - 7); g.row(lx + 1, lx + 2, f - 6, 'X'); return [lx + 6, f]; } },
  { id: 'gapArrows', kinds: ['arrows'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // shoots across the gap at jump height
    const gap = tier + 1; g.ground(x, x + 3, f); g.rect(x + 1, 0, x + 1, f - 4); g.set(x + 1, f - 3, '}');
    g.ground(x + 4 + gap, x + 8 + gap, f); return [x + 9 + gap, f]; } },
  { id: 'doorLane', kinds: ['trapdoor'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // too low to jump the doors
    const w = 3 + tier; g.ground(x, x + 2, f); g.row(x + 3, x + 2 + w, f, 'T'); g.ground(x + 3 + w, x + 5 + w, f);
    g.rect(x + 2, Math.max(0, f - 5), x + 3 + w, f - 3); return [x + 6 + w, f]; } },
  { id: 'sawBridge', kinds: ['saw'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // a thin bridge, nowhere to step aside
    const n = 4 + tier; g.ground(x, x + 1, f); g.row(x + 2, x + 2 + n, f, '#'); g.row(x + 2, x + 2 + n, f - 1, 'Z');
    g.ground(x + 3 + n, x + 5 + n, f); return [x + 6 + n, f]; } },
  { id: 'laserJump', kinds: ['laser'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // the beam is at jump height, over spikes
    const n = 9; g.ground(x, x + n + 2, f); g.set(x, f - 2, '#'); g.row(x + 4, x + 3 + tier, f - 1, '^');
    g.set(x + n, f - 1, '#'); g.set(x + n, f - 2, 'k'); return [x + n + 3, f]; } },
  { id: 'flameHop', kinds: ['flame'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // flames on the only platforms over a pit
    g.ground(x, x + 1, f); g.ground(x + 4, x + 5, f); g.set(x + 4 + (tier > 2 ? 1 : 0), f, 'F');
    g.ground(x + 8, x + 9, f); if (tier > 2) g.set(x + 8, f, 'F'); g.ground(x + 12, x + 14, f); return [x + 15, f]; } },
  { id: 'bombGap', kinds: ['dropper'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // a bomb over the take-off
    const c = f - 7; if (c < 1) return null;
    g.ground(x, x + 4, f); g.rect(x, Math.max(0, c - 2), x + 4, c); g.set(x + 3, c, 'D');
    g.ground(x + 5 + tier, x + 8 + tier, f); return [x + 9 + tier, f]; } },
  { id: 'fanGap', kinds: ['fan'], tiers: [2, 3], combo: true, make: (g, r, x, f, tier) => {   // a fan in the pit throws you into ceiling spikes
    if (f < 11) return null;
    const gap = tier + 1; g.ground(x, x + 2, f); g.rect(x + 3, f + 2, x + 2 + gap, H - 1); g.row(x + 3, x + 2 + gap, f + 2, 'W');
    g.rect(x + 2, f - 9, x + 3 + gap, f - 7); g.row(x + 2, x + 3 + gap, f - 6, 'v'); g.ground(x + 3 + gap, x + 6 + gap, f); return [x + 7 + gap, f]; } },
  // ---- moving things: a platform shuttling over a pit, a lift, a crumbling bridge, a rope swing
  { id: 'mover', kinds: [], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    const gap = 5 + tier; g.ground(x, x + 2, f); g.row(x + 3, x + 4, f, 'M'); g.ground(x + 3 + gap, x + 5 + gap, f); return [x + 6 + gap, f]; } },
  { id: 'lift', kinds: [], tiers: [2, 3], make: (g, r, x, f) => {
    if (f < 11) return null;
    g.ground(x, x + 2, f); g.row(x + 3, x + 4, f, 'N'); g.ground(x + 5, x + 9, f - 5); return [x + 10, f - 5]; } },
  { id: 'crumble', kinds: [], tiers: [1, 2, 3], make: (g, r, x, f, tier) => {
    const n = 4 + tier; g.ground(x, x + 1, f); g.row(x + 2, x + 1 + n, f, 'L'); g.ground(x + 2 + n, x + 4 + n, f); return [x + 5 + n, f]; } },
  { id: 'rope', kinds: [], tiers: [2, 3], make: (g, r, x, f) => {
    if (f < 10) return null;
    g.ground(x, x + 2, f); g.rect(x + 4, Math.max(0, f - 11), x + 6, f - 9); g.set(x + 5, f - 9, 'R'); g.ground(x + 10, x + 13, f); return [x + 14, f]; } },
  { id: 'stairs', kinds: [], tiers: [2, 3], make: (g, r, x, f) => {   // climb over gaps
    if (f < 13) return null;
    for (let i = 0; i < 3; i++) g.ground(x + i * 4, x + i * 4 + 1, f - 2 * i);
    return [x + 10, f - 4]; } },
];
const TRAP_KINDS = ['spikes', 'trapdoor', 'crusher', 'flame', 'cannon', 'arrows', 'wall', 'fan', 'saw', 'laser', 'dropper', 'conveyor', 'ice'];
const PLAN = {   // per star rating: how many segments, how tiers are drawn, checkpoint spacing, how many trap kinds
  1: { n: 9, tiers: [1, 1, 1, 2], cp: 3, kinds: 4 },
  2: { n: 12, tiers: [1, 2, 2, 2, 3], cp: 3, kinds: 5 },
  3: { n: 15, tiers: [2, 2, 3, 3, 3], cp: 5, kinds: 6 },
};
const THEMES = ['day', 'sunset', 'night', 'dusk'];
const ADJ = ['Breezy', 'Crooked', 'Sneaky', 'Rusty', 'Windy', 'Mossy', 'Dizzy', 'Wobbly', 'Shady', 'Spiky'];
const NOUN = ['Ridge', 'Gulch', 'Trail', 'Hollow', 'Yard', 'Pass', 'Bluff', 'Run', 'Canyon', 'Alley'];

export function buildRandom(seed, stars) {
  const r = mulberry(seed), P = PLAN[stars];
  const kinds = TRAP_KINDS.filter(k => stars > 1 || k !== 'arrows').sort(() => r() - 0.5).slice(0, P.kinds);
  const g = new Grid(400);
  g.rect(0, 0, 0, H - 1);
  let f = 14, x = 1;
  g.ground(x, x + 5, f); g.set(x + 2, f - 1, 'S'); x += 6;
  let last = '';
  const used = new Set();
  for (let i = 0; i < P.n; i++) {
    const j = i % P.cp;   // place in the section: a breather after each checkpoint, building up to a combo at the end
    if (i && j === 0) { g.ground(x, x + 3, f); g.set(x + 1, f - 1, 'C'); x += 4; }
    let tier = pick(r, P.tiers);
    if (j === 0) tier = 1;
    const finale = j === P.cp - 1 && stars > 1;
    if (finale) tier = Math.min(3, tier + 1);
    const fits = s => s.id !== last && s.tiers.includes(Math.min(tier, Math.max(...s.tiers))) && s.kinds.every(k => kinds.includes(k));
    const options = SEGMENTS.filter(fits);
    const combos = options.filter(s => s.combo), trapOpts = options.filter(s => s.kinds.length), terrain = options.filter(s => !s.kinds.length);
    const fresh = list => { const f = list.filter(s => s.kinds.some(k => !used.has(k))); return f.length && r() < 0.75 ? f : list; };   // spread over the level's kinds
    const seg = pick(r, finale && combos.length ? fresh(combos) : r() < 0.55 && trapOpts.length ? fresh(trapOpts) : terrain.length ? terrain : options);
    for (const k of seg.kinds) used.add(k);
    if (seg.kinds.length && r() < 0.4) { const f2 = Math.max(9, Math.min(15, f + pick(r, [-2, -1, 1, 2]))); g.ground(x, x + 1, f); g.ground(x + 2, x + 3, f2); x += 4; f = f2; }   // vary the height between rooms
    const res = seg.make(g, r, x, f, Math.min(tier, Math.max(...seg.tiers)));
    if (!res) { i--; last = seg.id; continue; }
    [x, f] = res; last = seg.id;
  }
  g.ground(x, x + 9, f); g.set(x + 6, f - 1, 'G'); g.rect(x + 10, 0, x + 10, H - 1);
  const w = x + 11;
  const map = g.g.map(row => row.slice(0, w).join(''));
  return { id: `gen-${stars}-${seed}`, name: `${pick(r, ADJ)} ${pick(r, NOUN)}`, theme: pick(r, THEMES), map, seed, random: true };
}

// Tries seeds from `seed` on until a level rates `stars` and can be finished. Deterministic for a given seed.
export function generate(seed, stars, maxTries = 40) {
  let fallback = null;
  for (let i = 0; i < maxTries; i++) {
    const level = buildRandom(seed + i * 7919, stars);
    const rating = rateLevel(level);
    if (rating.stars !== stars && fallback) continue;
    if (!solve(level, 60000).ok) continue;
    level.stars = rating.stars; level.score = rating.score;
    if (rating.stars === stars) return level;
    fallback = level;
  }
  return fallback;
}

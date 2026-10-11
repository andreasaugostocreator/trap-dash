// Which gadgets each side gets on a level. Always four each, picked from the level itself so the same level
// always deals the same hand (online, both devices agree without sending anything):
//   runner:  2 for moving (getting over things) + 2 for staying alive (dealing with what's thrown at them)
//   trapper: 2 aimed (placed on the map) + 2 curses (they change how the runner moves)
// Each candidate scores from what the level contains, plus a little level-specific noise for variety.
import { TILE } from './config.js';

export const POOLS = {
  runner: { move: ['dash', 'blink', 'haste', 'feather', 'boots', 'glider'], save: ['shield', 'phase', 'jam', 'slowmo', 'flag', 'decoy', 'magnet', 'peek'] },
  trapper: { aim: ['bolt', 'glue', 'mine', 'bat'], curse: ['gust', 'hex', 'frost', 'fog', 'anvil', 'moon', 'rewind', 'squash'] },
};

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// What the level is like, in numbers.
export function levelFeatures(world) {
  const kinds = new Set(world.traps.map(t => t.kind));
  const count = k => world.traps.filter(t => t.kind === k).length;
  let pits = 0, run = 0;
  for (let x = 0; x <= world.w; x++) {
    let ground = false;
    if (x < world.w) for (let y = 0; y < world.h; y++) if (world.tile(x, y) !== 0) { ground = true; break; }
    if (x < world.w && !ground) { run++; continue; }
    if (run) pits++;
    run = 0;
  }
  const cps = [world.start.x, ...world.checkpoints.map(c => c.x), world.goal ? world.goal.x : world.w * TILE].sort((a, b) => a - b);
  let longest = 0; for (let i = 1; i < cps.length; i++) longest = Math.max(longest, (cps[i] - cps[i - 1]) / TILE);
  return {
    kinds, pits, vertical: world.h > 24, longest,
    projectiles: count('cannon') + count('arrows') + count('laser') + count('dropper'),
    zones: count('spikes') + count('flame') + count('crusher') + count('saw'),
    pushers: count('fan') + count('conveyor') + count('wall'),
    floors: count('trapdoor') + count('ice') + count('conveyor'),
    density: world.traps.length / Math.max(1, world.w / 20),
  };
}

const WEIGHTS = {
  // runner, moving
  dash:    f => 1 + f.zones * 0.08,
  blink:   f => 0.8 + f.pushers * 0.15 + (f.kinds.has('wall') ? 0.6 : 0),
  haste:   f => 0.8 + f.zones * 0.06 + (f.kinds.has('conveyor') ? 0.5 : 0),
  feather: f => 0.9 + f.pits * 0.12,
  boots:   f => 0.7 + f.pits * 0.1 + (f.vertical ? 0.8 : 0),
  glider:  f => 0.5 + f.pits * 0.08 + (f.vertical ? 1.2 : 0),
  // runner, surviving
  shield:  f => 1 + f.density * 0.1,
  phase:   f => 0.5 + f.projectiles * 0.18,
  jam:     f => 0.8 + f.density * 0.12,
  slowmo:  f => 0.6 + f.zones * 0.08 + f.projectiles * 0.06,
  flag:    f => 0.4 + Math.max(0, f.longest - 30) * 0.04,
  decoy:   f => 0.7 + f.projectiles * 0.05,
  magnet:  f => 0.3 + f.pushers * 0.3,
  peek:    f => 0.6 + f.density * 0.08,
  // trapper, aimed
  bolt:    f => 1.1,
  glue:    f => 0.8 + f.zones * 0.05 + f.floors * 0.1,
  mine:    f => 0.7 + f.pits * 0.08,
  bat:     f => 0.8 + (f.vertical ? 0.5 : 0),
  // trapper, curses
  gust:    f => 0.8 + f.pits * 0.1,
  hex:     f => 0.9 + f.projectiles * 0.04,
  frost:   f => 0.6 + f.pits * 0.08 + (f.kinds.has('ice') ? -0.4 : 0.2),
  fog:     f => 0.8 + f.density * 0.06,
  anvil:   f => 0.6 + f.pits * 0.1 + (f.vertical ? 0.8 : 0),
  moon:    f => 0.7 + f.projectiles * 0.06,
  rewind:  f => 0.5 + Math.min(1, f.longest / 60),
  squash:  f => 0.7 + f.zones * 0.05,
};

export function chooseLoadout(level, world) {
  const f = levelFeatures(world), seed = hash((level.id || '') + level.map.join(''));
  const noise = id => ((hash(id + ':' + seed) % 1000) / 1000 - 0.5) * 1.2;
  const best = (ids, n) => ids.map(id => ({ id, s: WEIGHTS[id](f) + noise(id) })).sort((a, b) => b.s - a.s).slice(0, n).map(o => o.id);
  return {
    runner: [...best(POOLS.runner.move, 2), ...best(POOLS.runner.save, 2)],
    trapper: [...best(POOLS.trapper.aim, 2), ...best(POOLS.trapper.curse, 2)],
  };
}

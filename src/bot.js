// Practice mode trapper: fires a trap when the runner is about to be where it hurts, with a human-ish delay.
import { TILE, PHYS, TRAPS } from './config.js';

export class Bot {
  constructor(skill = 0.5) { this.skill = skill; this.wait = 0; }
  think(world, dt) {
    this.wait -= dt;
    const p = world.player;
    if (p.dead || p.finished || this.wait > 0 || world.lock > 0) return;
    const cx = p.x + PHYS.w / 2, cy = p.y + PHYS.h / 2;
    for (const t of world.traps) {
      if (t.state !== 'idle' || t.cd > 0) continue;
      const C = TRAPS[t.kind], lead = C.warn + 0.05;
      const fx = cx + p.vx * lead, fy = cy + p.vy * lead * 0.5;
      const x0 = t.x0 * TILE, x1 = (t.x1 + 1) * TILE, y = t.y * TILE;
      let hit = false;
      if (t.kind === 'spikes') hit = fx > x0 - 4 && fx < x1 + 4 && Math.abs(fy - (y + 8)) < 14;
      if (t.kind === 'trapdoor') hit = fx > x0 && fx < x1 && fy < y && y - fy < 24;
      if (t.kind === 'flame') hit = fx > x0 - 4 && fx < x1 + 4 && fy < y && y - fy < t.reach * TILE;
      if (t.kind === 'crusher') { const fall = Math.sqrt(2 * Math.max(0, t.drop) / C.fallG); const gx = cx + p.vx * (C.warn + fall * 0.8); hit = gx > x0 && gx < x1 && cy > y && cy - y < t.drop + TILE * 1.5; }
      if (t.kind === 'cannon') { const dx = (cx - (x0 + 8)) * t.dir; hit = dx > 20 && dx < 220 && Math.abs(cy - (y + 8)) < 10; }
      if (hit && Math.random() < dt * (3 + this.skill * 8)) {
        world.trigger(t.id);
        this.wait = 0.5 + Math.random() * (1.4 - this.skill);
        return;
      }
    }
  }
}

// Practice mode trapper: fires a trap when the runner is about to be where it hurts, with a human-ish delay,
// and now and then throws a gadget.
import { TILE, PHYS, TRAPS, GADGETS } from './config.js';

export class Bot {
  constructor(skill = 0.5) { this.skill = skill; this.wait = 0; this.gadWait = 4; this.burn = null; }
  think(world, dt) {
    this.wait -= dt; this.gadWait -= dt;
    if (this.burn && (this.burn.t -= dt) <= 0) { world.release(this.burn.id); this.burn = null; }
    const p = world.player;
    if (p.dead || p.finished) return;
    const cx = p.x + PHYS.w / 2, cy = p.y + PHYS.h / 2;
    if (this.gadWait <= 0) this.gadget(world, cx, cy);
    if (this.wait > 0 || world.lock > 0) return;
    for (const t of world.traps) {
      if (t.state !== 'idle' || t.cd > 0) continue;
      const C = TRAPS[t.kind], lead = C.warn + 0.05;
      const fx = cx + p.vx * lead, fy = cy + p.vy * lead * 0.5;
      const x0 = t.x0 * TILE, x1 = (t.x1 + 1) * TILE, y = t.y * TILE;
      let hit = false;
      if (t.kind === 'spikes') hit = fx > x0 - 4 && fx < x1 + 4 && Math.abs(fy - (y + 8)) < 14;
      if (t.kind === 'trapdoor') hit = fx > x0 && fx < x1 && fy < y && y - fy < 24;
      if (t.kind === 'flame') hit = fx > x0 - 4 && fx < x1 + 4 && fy < y && y - fy < t.reach * TILE;
      if (t.kind === 'fan') hit = fx > x0 - 4 && fx < x1 + 4 && fy < y && y - fy < t.reach * TILE && !p.onGround;
      if (t.kind === 'wall') hit = Math.abs(fx - (x0 + 8)) < 20 && Math.abs(fy - y) < 20 && Math.sign(x0 + 8 - cx) === Math.sign(p.vx);
      if (t.kind === 'crusher') { const fall = Math.sqrt(2 * Math.max(0, t.drop) / C.fallG); const gx = cx + p.vx * (C.warn + fall * 0.8); hit = gx > x0 && gx < x1 && cy > y && cy - y < t.drop + TILE * 1.5; }
      if (t.kind === 'saw') hit = fx > x0 && fx < x1 + 4 && Math.abs(fy - (y + 8)) < 16;
      if (t.kind === 'laser') { const dx = (cx - (x0 + 8)) * t.dir; hit = dx > 10 && Math.abs(t.end - t.x0) * TILE > dx && Math.abs(fy - (y + 8)) < 10; }
      if (t.kind === 'dropper') { const gx = cx + p.vx * (C.warn + 0.2); hit = Math.abs(gx - (x0 + 8)) < 14 && cy > y; }
      if (t.kind === 'conveyor' || t.kind === 'ice') hit = fx > x0 && fx < x1 && fy < y && y - fy < 20 && p.onGround;
      if (t.kind === 'cannon' || t.kind === 'arrows') { const dx = (cx - (x0 + 8)) * t.dir; hit = dx > 20 && dx < C.shot.speed * 1.2 && Math.abs(cy - (y + 8)) < 10; }
      if (hit && Math.random() < dt * (3 + this.skill * 8)) {
        const burns = !!TRAPS[t.kind].hold;
        if (world.trigger(t.id, 0, burns) && burns) this.burn = { id: t.id, t: 0.4 + Math.random() * 1.2 };
        this.wait = 0.5 + Math.random() * (1.4 - this.skill);
        return;
      }
    }
  }
  gadget(world, cx, cy) {
    const p = world.player;
    this.gadWait = 3 + Math.random() * 5;
    const ready = world.loadout.trapper.filter(id => { const g = world.gad.trapper[id]; return g.n !== 0 && !(g.cd > 0); });
    if (!ready.length) return;
    const id = ready[Math.floor(Math.random() * ready.length)], def = GADGETS.trapper[id];
    if (id === 'gust' && !p.onGround) return;
    if (id === 'hex' && Math.abs(p.vx) < 60) return;
    const lead = (def.warn || 0.3) * (0.6 + Math.random() * 0.6);
    if (id === 'bolt') world.useGadget('trapper', id, cx + p.vx * lead, cy);
    else if (def.aim) world.useGadget('trapper', id, cx + (p.face || 1) * (40 + Math.random() * 30), cy);
    else world.useGadget('trapper', id);
  }
}

// The game world: tiles, the runner and the traps. Pure logic, no drawing, so it also runs in Node (tools/solve.mjs).
// Only the runner's device steps the world; the trapper's device mirrors it from snapshots (see snapshot/applySnap).
import { TILE, PHYS, TRAPS, TRAP_LOCK } from './config.js';

export const EMPTY = 0, SOLID = 1, ONEWAY = 2, SPIKE = 3, SPRING = 4, DOOR = 5, CANNON = 6, NOZZLE = 7;
const STATES = ['idle', 'warn', 'active', 'recover'];
const GROUPED = { P: 'spikes', T: 'trapdoor', X: 'crusher', F: 'flame' };

export class World {
  constructor(level) {
    this.level = level;
    const rows = level.map;
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.trapAt = new Int16Array(this.w * this.h).fill(-1);
    this.traps = []; this.checkpoints = []; this.balls = []; this.events = [];
    this.lock = 0; this.time = 0;
    const ch = (x, y) => (rows[y] && rows[y][x]) || '.';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = ch(x, y), i = y * this.w + x;
      this.tiles[i] = { '#': SOLID, '=': ONEWAY, '^': SPIKE, B: SPRING, T: DOOR, '<': CANNON, '>': CANNON, F: NOZZLE }[c] || EMPTY;
      if (c === 'S') this.start = { x: x * TILE + (TILE - PHYS.w) / 2, y: (y + 1) * TILE - PHYS.h };
      if (c === 'G') this.goal = { x: x * TILE, y: y * TILE };
      if (c === 'C') this.checkpoints.push({ x: x * TILE, y: y * TILE, on: false });
      if (c === '<' || c === '>') this.addTrap('cannon', x, x, y, { dir: c === '<' ? -1 : 1 });
      const kind = GROUPED[c];
      if (kind && ch(x - 1, y) !== c) { let x1 = x; while (ch(x1 + 1, y) === c) x1++; this.addTrap(kind, x, x1, y); }
    }
    for (const t of this.traps) {
      for (let x = t.x0; x <= t.x1; x++) this.trapAt[t.y * this.w + x] = t.id;
      if (t.kind === 'crusher') {           // falls until it meets the first solid tile under any of its columns
        let fy = this.h;
        for (let x = t.x0; x <= t.x1; x++) for (let y = t.y + 1; y < this.h; y++) if (this.solidAt(x, y)) { fy = Math.min(fy, y); break; }
        t.drop = (fy - t.y - 1) * TILE;
      }
      if (t.kind === 'flame') {
        let n = 0; while (n < TRAPS.flame.reach && !this.solidAt(t.x0, t.y - 1 - n)) n++;
        t.reach = n;
      }
    }
    this.player = { x: this.start.x, y: this.start.y, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, buffer: 0,
      dead: false, deadT: 0, finished: false, deaths: 0, cp: { ...this.start }, best: this.start.x, airT: 0, wasJump: false };
  }

  addTrap(kind, x0, x1, y, extra = {}) {
    this.traps.push({ id: this.traps.length, kind, x0, x1, y, state: 'idle', t: 0, cd: 0, oy: 0, vy: 0, ...extra });
  }

  tile(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? (y >= this.h || y < 0 ? EMPTY : SOLID) : this.tiles[y * this.w + x]; }
  solidAt(x, y) {
    const t = this.tile(x, y);
    if (t === DOOR) { const tr = this.traps[this.trapAt[y * this.w + x]]; return !(tr.state === 'active' || (tr.state === 'recover')); }
    return t === SOLID || t === CANNON || t === NOZZLE || t === SPRING;
  }

  // Rectangles that hurt right now, in world pixels.
  dangers() {
    const out = [];
    for (const t of this.traps) {
      const x = t.x0 * TILE, w = (t.x1 - t.x0 + 1) * TILE, y = t.y * TILE;
      if (t.kind === 'spikes' && t.state === 'active') out.push({ x: x + 1, y: y + 7, w: w - 2, h: 9 });
      if (t.kind === 'crusher' && (t.state === 'active' || (t.state === 'recover' && t.t < 0.06))) out.push({ x: x + 1, y: y + t.oy + 2, w: w - 2, h: TILE - 2 });
      if (t.kind === 'flame' && t.state === 'active' && t.reach) out.push({ x: x + 3, y: y - t.reach * TILE + 2, w: w - 6, h: t.reach * TILE - 2 });
    }
    for (const b of this.balls) out.push({ x: b.x - 4, y: b.y - 4, w: 8, h: 8 });
    return out;
  }

  trigger(id) {
    const t = this.traps[id];
    if (!t || t.state !== 'idle' || t.cd > 0 || this.lock > 0 || this.player.finished) return false;
    t.state = 'warn'; t.t = 0; t.cd = TRAPS[t.kind].cd; this.lock = TRAP_LOCK;
    this.emit('warn', (t.x0 + t.x1 + 1) * TILE / 2, t.y * TILE, t.kind);
    return true;
  }

  emit(k, x, y, extra) { this.events.push(extra === undefined ? [k, Math.round(x), Math.round(y)] : [k, Math.round(x), Math.round(y), extra]); }

  stepTraps(dt) {
    this.lock = Math.max(0, this.lock - dt);
    const p = this.player;
    for (const t of this.traps) {
      const C = TRAPS[t.kind], cx = (t.x0 + t.x1 + 1) * TILE / 2;
      t.cd = Math.max(0, t.cd - dt); t.t += dt;
      if (t.state === 'warn' && t.t >= C.warn) {
        t.state = 'active'; t.t = 0;
        if (t.kind === 'cannon') {
          this.balls.push({ x: t.x0 * TILE + 8 + t.dir * 9, y: t.y * TILE + 8, vx: t.dir * C.speed });
          t.state = 'idle';
        }
        this.emit('fire', cx, t.y * TILE, t.kind);
      } else if (t.state === 'active') {
        if (t.kind === 'crusher') {
          t.vy += C.fallG * dt; t.oy += t.vy * dt;
          if (t.oy >= t.drop) { t.oy = t.drop; t.vy = 0; t.state = 'recover'; t.t = 0; this.emit('thud', cx, t.y * TILE + t.oy + TILE, 'crusher'); }
        } else if (t.t >= C.active) {
          if (t.kind === 'trapdoor') {
            const r = { x: t.x0 * TILE, y: t.y * TILE, w: (t.x1 - t.x0 + 1) * TILE, h: TILE };
            if (!p.dead && overlap(p.x, p.y, PHYS.w, PHYS.h, r)) continue;  // wait until the runner is out of the hole
          }
          t.state = t.kind === 'spikes' ? 'recover' : 'idle'; t.t = 0;
          if (t.kind === 'trapdoor') this.emit('close', cx, t.y * TILE);
        }
      } else if (t.state === 'recover') {
        if (t.kind === 'spikes' && t.t >= 0.15) { t.state = 'idle'; t.t = 0; }
        if (t.kind === 'crusher' && t.t >= C.rest) { t.oy = Math.max(0, t.oy - C.rise * dt); if (t.oy === 0) { t.state = 'idle'; t.t = 0; } }
      }
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.x += b.vx * dt;
      const tx = Math.floor((b.x + Math.sign(b.vx) * 4) / TILE), ty = Math.floor(b.y / TILE);
      if (this.solidAt(tx, ty) || b.x < -20 || b.x > this.w * TILE + 20) { this.emit('poof', b.x, b.y); this.balls.splice(i, 1); }
    }
  }

  // input: { left, right, jump (held), jumpPressed (this frame) }
  step(dt, input) {
    this.stepTraps(dt);
    const p = this.player;
    if (p.finished) { p.vx *= 0.8; this.movePlayer(dt); return; }
    this.time += dt;
    if (p.dead) {
      p.deadT -= dt;
      if (p.deadT <= 0) { Object.assign(p, { dead: false, x: p.cp.x, y: p.cp.y, vx: 0, vy: 0, buffer: 0 }); this.emit('spawn', p.x + 5, p.y + 6); }
      return;
    }
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) {
      p.face = dir;
      const a = p.onGround ? PHYS.accelGround : PHYS.accelAir;
      if (Math.sign(p.vx) !== dir && p.vx !== 0) p.vx += dir * a * 1.6 * dt;   // snappy turnaround
      else p.vx += dir * a * dt;
      p.vx = Math.max(-PHYS.maxRun, Math.min(PHYS.maxRun, p.vx));
    } else {
      const f = (p.onGround ? PHYS.friction : PHYS.friction * 0.45) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;
    p.buffer = input.jumpPressed ? PHYS.buffer : p.buffer - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -PHYS.jumpV; p.buffer = 0; p.coyote = 0; p.onGround = false; p.wasJump = true;
      this.emit('jump', p.x + 5, p.y + PHYS.h);
    }
    if (p.vy >= 0) p.sprung = false;
    let g = p.vy < 0 && !p.sprung && !(input.jump && p.wasJump) ? PHYS.gravityCut : PHYS.gravity;
    if (p.vy >= 0) g = PHYS.fallGravity;
    if (Math.abs(p.vy) < 50 && input.jump && p.wasJump) g *= PHYS.apexGravity;
    p.vy = Math.min(PHYS.maxFall, p.vy + g * dt);
    const wasGround = p.onGround, fallV = p.vy;
    this.movePlayer(dt);
    if (p.onGround && !wasGround) { p.wasJump = false; if (fallV > 160) this.emit('land', p.x + 5, p.y + PHYS.h, Math.min(1, fallV / PHYS.maxFall)); }
    p.airT = p.onGround ? 0 : p.airT + dt;
    p.best = Math.max(p.best, p.x);

    // Springs, checkpoints, goal, death.
    const cx = p.x + PHYS.w / 2, feet = p.y + PHYS.h;
    const below = this.tile(Math.floor(cx / TILE), Math.floor((feet + 1) / TILE));
    if (p.onGround && below === SPRING) {
      p.vy = -PHYS.springV; p.onGround = false; p.wasJump = false; p.sprung = true;
      this.emit('spring', Math.floor(cx / TILE) * TILE + 8, Math.floor((feet + 1) / TILE) * TILE);
    }
    for (const c of this.checkpoints) if (!c.on && overlap(p.x, p.y, PHYS.w, PHYS.h, { x: c.x, y: c.y - 16, w: 16, h: 32 })) {
      for (const o of this.checkpoints) if (o.x < c.x) o.on = true;
      c.on = true; p.cp = { x: c.x + 3, y: c.y + TILE - PHYS.h }; this.emit('cp', c.x + 8, c.y);
    }
    if (this.goal && overlap(p.x, p.y, PHYS.w, PHYS.h, { x: this.goal.x + 2, y: this.goal.y - 24, w: 12, h: 40 })) {
      p.finished = true; this.emit('goal', this.goal.x + 8, this.goal.y); return;
    }
    if (p.y > this.h * TILE + 8) return this.kill('fall');
    const hb = { x: p.x + 1, y: p.y + 2, w: PHYS.w - 2, h: PHYS.h - 2 };
    for (let ty = Math.floor(hb.y / TILE); ty <= Math.floor((hb.y + hb.h) / TILE); ty++)
      for (let tx = Math.floor(hb.x / TILE); tx <= Math.floor((hb.x + hb.w) / TILE); tx++)
        if (this.tile(tx, ty) === SPIKE && overlap(hb.x, hb.y, hb.w, hb.h, { x: tx * TILE + 2, y: ty * TILE + 9, w: 12, h: 7 })) return this.kill('spike');
    for (const d of this.dangers()) if (overlap(hb.x, hb.y, hb.w, hb.h, d)) return this.kill('trap');
  }

  kill(why) {
    const p = this.player;
    p.dead = true; p.deadT = PHYS.respawn; p.deaths++;
    this.emit('die', p.x + 5, p.y + 6, why);
  }

  movePlayer(dt) {
    const p = this.player, W = PHYS.w, H = PHYS.h;
    // Horizontal
    p.x += p.vx * dt;
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + H - 0.01) / TILE);
    if (p.vx > 0) { const tx = Math.floor((p.x + W) / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = tx * TILE - W; p.vx = 0; break; } }
    else if (p.vx < 0) { const tx = Math.floor(p.x / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = (tx + 1) * TILE; p.vx = 0; break; } }
    // Vertical
    const prevBottom = p.y + H;
    p.y += p.vy * dt;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + W - 0.01) / TILE);
    p.onGround = false;
    if (p.vy >= 0) {
      const ty = Math.floor((p.y + H) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tile(tx, ty);
        if (this.solidAt(tx, ty) || (t === ONEWAY && prevBottom <= ty * TILE + 0.5)) { p.y = ty * TILE - H; p.vy = 0; p.onGround = true; break; }
      }
    } else {
      const ty = Math.floor(p.y / TILE);
      for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) { p.y = (ty + 1) * TILE; p.vy = 0; this.emit('bonk', p.x + 5, p.y); break; }
    }
  }

  // ---- Networking: the runner's device sends this ~30 times a second, the trapper's device applies it.
  snapshot() {
    const p = this.player, r = v => Math.round(v * 10) / 10;
    const ev = this.events; this.events = [];
    return {
      t: 'snap', tm: r(this.time), d: p.deaths, lk: r(this.lock),
      p: [r(p.x), r(p.y), r(p.vx), r(p.vy), p.face, (p.onGround ? 1 : 0) | (p.dead ? 2 : 0) | (p.finished ? 4 : 0)],
      tr: this.traps.map(t => [STATES.indexOf(t.state), r(t.t), r(t.cd), r(t.oy)]),
      b: this.balls.map(b => [r(b.x), r(b.y), b.vx]),
      cp: this.checkpoints.map(c => c.on ? 1 : 0).join(''),
      ev,
    };
  }
  applySnap(s) {
    const p = this.player;
    this.time = s.tm; p.deaths = s.d; this.lock = s.lk;
    [p.x, p.y, p.vx, p.vy, p.face] = s.p;
    p.onGround = !!(s.p[5] & 1); p.dead = !!(s.p[5] & 2); p.finished = !!(s.p[5] & 4);
    s.tr.forEach((a, i) => { const t = this.traps[i]; if (!t) return; t.state = STATES[a[0]]; t.t = a[1]; t.cd = a[2]; t.oy = a[3]; });
    this.balls = s.b.map(([x, y, vx]) => ({ x, y, vx }));
    [...s.cp].forEach((c, i) => { if (this.checkpoints[i]) this.checkpoints[i].on = c === '1'; });
  }
}

export function overlap(x, y, w, h, r) { return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y; }

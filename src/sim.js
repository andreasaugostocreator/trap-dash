// The game world: tiles, the runner, traps, gadgets. Pure logic, no drawing, so it also runs in Node (tools/).
// Only the runner's device steps the world; the trapper's device mirrors it from snapshots (see snapshot/applySnap).
import { TILE, PHYS, TRAPS, TRAP_LOCK, GADGETS } from './config.js';

export const EMPTY = 0, SOLID = 1, ONEWAY = 2, SPIKE = 3, SPRING = 4, DOOR = 5, CANNON = 6, NOZZLE = 7, TURRET = 8, FAN = 9, WALL = 10, CEILSPIKE = 11;
const STATES = ['idle', 'warn', 'active', 'recover'];
const GROUPED = { P: 'spikes', T: 'trapdoor', X: 'crusher', F: 'flame', W: 'fan' };
const TILE_OF = { '#': SOLID, '=': ONEWAY, '^': SPIKE, B: SPRING, T: DOOR, '<': CANNON, '>': CANNON, F: NOZZLE, '{': TURRET, '}': TURRET, W: FAN, U: WALL, v: CEILSPIKE };
const r1 = v => Math.round(v * 10) / 10;

export class World {
  constructor(level) {
    this.level = level;
    const rows = level.map;
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.trapAt = new Int16Array(this.w * this.h).fill(-1);
    this.traps = []; this.checkpoints = []; this.shots = []; this.events = []; this.fx = [];
    this.lock = 0; this.time = 0; this.jam = 0;
    const ch = (x, y) => (rows[y] && rows[y][x]) || '.';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = ch(x, y), i = y * this.w + x;
      this.tiles[i] = TILE_OF[c] || EMPTY;
      if (c === 'S') this.start = { x: x * TILE + (TILE - PHYS.w) / 2, y: (y + 1) * TILE - PHYS.h };
      if (c === 'G') this.goal = { x: x * TILE, y: y * TILE };
      if (c === 'C') this.checkpoints.push({ x: x * TILE, y: y * TILE, on: false });
      if (c === '<' || c === '>') this.addTrap('cannon', x, x, y, { dir: c === '<' ? -1 : 1 });
      if (c === '{' || c === '}') this.addTrap('arrows', x, x, y, { dir: c === '{' ? -1 : 1 });
      if (c === 'U') { this.addTrap('wall', x, x, y); if (y > 0) this.tiles[i - this.w] = WALL; }
      const kind = GROUPED[c];
      if (kind && ch(x - 1, y) !== c) { let x1 = x; while (ch(x1 + 1, y) === c) x1++; this.addTrap(kind, x, x1, y); }
    }
    for (const t of this.traps) {
      for (let x = t.x0; x <= t.x1; x++) this.trapAt[t.y * this.w + x] = t.id;
      if (t.kind === 'wall' && t.y > 0) this.trapAt[(t.y - 1) * this.w + t.x0] = t.id;
      if (t.kind === 'crusher') {           // falls until it meets the first solid tile under any of its columns
        let fy = this.h;
        for (let x = t.x0; x <= t.x1; x++) for (let y = t.y + 1; y < this.h; y++) if (this.solidAt(x, y)) { fy = Math.min(fy, y); break; }
        t.drop = (fy - t.y - 1) * TILE;
      }
      if (t.kind === 'flame' || t.kind === 'fan') {   // reaches upward until something solid
        let n = 0; while (n < TRAPS[t.kind].reach && !this.solidAt(t.x0, t.y - 1 - n)) n++;
        t.reach = n;
      }
    }
    this.player = { x: this.start.x, y: this.start.y, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, buffer: 0,
      dead: false, deadT: 0, finished: false, deaths: 0, cp: { ...this.start }, best: this.start.x, airT: 0, wasJump: false,
      stun: 0, rev: 0, shield: 0, inv: 0, dash: 0, gust: 0, gustDir: 0, slow: false, lifted: false };
    this.gad = {};
    for (const side of ['trapper', 'runner']) {
      this.gad[side] = {};
      for (const [id, g] of Object.entries(GADGETS[side])) this.gad[side][id] = { n: g.charges, cd: 0 };
    }
  }

  addTrap(kind, x0, x1, y, extra = {}) {
    this.traps.push({ id: this.traps.length, kind, x0, x1, y, state: 'idle', t: 0, cd: 0, oy: 0, vy: 0, ...extra });
  }

  tile(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? (y >= this.h || y < 0 ? EMPTY : SOLID) : this.tiles[y * this.w + x]; }
  solidAt(x, y) {
    const t = this.tile(x, y);
    if (t === DOOR) { const tr = this.traps[this.trapAt[y * this.w + x]]; return !(tr.state === 'active' || tr.state === 'recover'); }
    if (t === WALL) { const tr = this.traps[this.trapAt[y * this.w + x]]; return tr.state === 'active' && !tr.pass; }
    return t === SOLID || t === CANNON || t === NOZZLE || t === SPRING || t === TURRET || t === FAN;
  }

  // Rectangles that hurt right now, in world pixels. (Zones and projectiles; force and floor traps don't hurt.)
  dangers() {
    const out = [];
    for (const t of this.traps) {
      const x = t.x0 * TILE, w = (t.x1 - t.x0 + 1) * TILE, y = t.y * TILE;
      if (t.kind === 'spikes' && t.state === 'active') out.push({ x: x + 1, y: y + 7, w: w - 2, h: 9 });
      if (t.kind === 'crusher' && (t.state === 'active' || (t.state === 'recover' && t.t < TRAPS.crusher.impact))) out.push({ x, y: y + t.oy + 1, w, h: TILE - 1 });
      if (t.kind === 'flame' && t.state === 'active' && t.reach) out.push({ x: x + 3, y: y - t.reach * TILE + 2, w: w - 6, h: t.reach * TILE - 2 });
    }
    for (const s of this.shots) out.push({ x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h });
    return out;
  }
  fanZones() {
    const out = [];
    for (const t of this.traps) if (t.kind === 'fan' && t.state === 'active' && t.reach)
      out.push({ x: t.x0 * TILE + 1, y: (t.y - t.reach) * TILE, w: (t.x1 - t.x0 + 1) * TILE - 2, h: t.reach * TILE });
    return out;
  }

  // lead: seconds the order spent on the network; the trap skips that much of its warning (at most 60%).
  // hold: for traps that act while held (the flame), keep going until release(); otherwise a short burst.
  trigger(id, lead = 0, hold = false) {
    const t = this.traps[id];
    if (!t || t.state !== 'idle' || t.cd > 0 || this.lock > 0 || this.jam > 0 || this.player.finished) return false;
    const C = TRAPS[t.kind];
    t.state = 'warn'; t.t = Math.min(lead, C.warn * 0.6); t.cd = C.hold ? 99 : C.cd; this.lock = TRAP_LOCK;
    if (C.hold) t.holding = hold;
    this.emit('warn', (t.x0 + t.x1 + 1) * TILE / 2, t.y * TILE, t.kind);
    return true;
  }

  release(id) { const t = this.traps[id]; if (t) t.holding = false; }
  // Ends a held burn and sets its cooldown from how long it burned.
  endBurn(t) {
    const C = TRAPS[t.kind];
    t.cd = C.cdBase + C.cdPerSec * t.t; t.state = 'idle'; t.t = 0; t.holding = false;
  }

  emit(k, x, y, extra) { this.events.push(extra === undefined ? [k, Math.round(x), Math.round(y)] : [k, Math.round(x), Math.round(y), extra]); }

  stepTraps(dt) {
    this.lock = Math.max(0, this.lock - dt); this.jam = Math.max(0, this.jam - dt);
    const p = this.player, P = { x: p.x, y: p.y, w: PHYS.w, h: PHYS.h };
    for (const t of this.traps) {
      const C = TRAPS[t.kind], cx = (t.x0 + t.x1 + 1) * TILE / 2;
      t.cd = Math.max(0, t.cd - dt); t.t += dt;
      if (t.state === 'warn' && t.t >= C.warn) {
        t.state = 'active'; t.t = 0;
        if (C.family === 'emitter') {
          this.shots.push({ kind: t.kind, x: t.x0 * TILE + 8 + t.dir * 9, y: t.y * TILE + 8, vx: t.dir * C.shot.speed, w: C.shot.w, h: C.shot.h });
          t.state = 'idle';
        }
        if (t.kind === 'wall') {   // if the runner stands where the wall comes up, it bumps them up instead of trapping them
          t.pass = overlap(P.x, P.y, P.w, P.h, { x: t.x0 * TILE, y: (t.y - 1) * TILE, w: TILE, h: 2 * TILE });
          if (t.pass && !p.dead) { p.vy = -330; p.onGround = false; }
        }
        this.emit('fire', cx, t.y * TILE, t.kind);
      } else if (t.state === 'active') {
        if (t.kind === 'crusher') {   // slams: starts fast and speeds up
          if (t.vy < C.slam) t.vy = C.slam;
          t.vy += C.fallG * dt; t.oy += t.vy * dt;
          if (t.oy >= t.drop) { t.oy = t.drop; t.vy = 0; t.state = 'recover'; t.t = 0; this.emit('thud', cx, t.y * TILE + t.oy + TILE, 'crusher'); }
        } else if (C.hold) {
          if (t.t >= C.tank || (!t.holding && t.t >= C.minBurn)) this.endBurn(t);
        } else if (t.t >= C.active) {
          if (t.kind === 'trapdoor' && !p.dead && overlap(P.x, P.y, P.w, P.h, { x: t.x0 * TILE, y: t.y * TILE, w: (t.x1 - t.x0 + 1) * TILE, h: TILE })) continue;  // wait until the runner is out of the hole
          t.state = t.kind === 'spikes' ? 'recover' : 'idle'; t.t = 0; t.pass = false;
          if (t.kind === 'trapdoor' || t.kind === 'wall') this.emit('close', cx, t.y * TILE);
        }
      } else if (t.state === 'recover') {
        if (t.kind === 'spikes' && t.t >= 0.15) { t.state = 'idle'; t.t = 0; }
        if (t.kind === 'crusher' && t.t >= C.rest) { t.oy = Math.max(0, t.oy - C.rise * dt); if (t.oy === 0) { t.state = 'idle'; t.t = 0; } }
      }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      const tx = Math.floor((s.x + Math.sign(s.vx) * s.w / 2) / TILE), ty = Math.floor(s.y / TILE);
      if (this.solidAt(tx, ty) || s.x < -20 || s.x > this.w * TILE + 20) { this.emit('poof', s.x, s.y, s.kind); this.shots.splice(i, 1); }
    }
    this.stepGadgets(dt);
  }

  // ---------- gadgets
  useGadget(side, id, x, y, lead = 0) {
    const def = GADGETS[side] && GADGETS[side][id], g = this.gad[side] && this.gad[side][id], p = this.player;
    if (!def || !g || def.passive || g.n === 0 || g.cd > 0 || p.finished || p.dead) return false;
    if (side === 'trapper' && this.jam > 0) return false;
    if (id === 'bolt') this.fx.push({ k: 'bolt', x: Math.round(x), t: Math.min(lead, def.warn * 0.5) });
    else if (id === 'glue') {
      const spot = this.floorBelow(x, y);
      if (!spot) return false;
      this.fx.push({ k: 'glue', x0: spot.x0, x1: spot.x1, y: spot.y, t: def.life });
    }
    else if (id === 'gust') { p.gust = def.time; p.gustDir = -p.face; }
    else if (id === 'hex') p.rev = def.time;
    else if (id === 'dash') { p.dash = def.time; p.vx = p.face * def.speed; p.vy = Math.min(p.vy, 0); }
    else if (id === 'shield') p.shield = def.time;
    else if (id === 'jam') this.jam = def.time;
    if (g.n > 0) g.n--;
    g.cd = def.cd;
    this.emit('gadget', id === 'bolt' || id === 'glue' ? x : p.x + 5, id === 'glue' ? y : p.y + 6, id);
    return true;
  }

  // The floor under a point, three tiles wide (only where there is floor). For the glue.
  floorBelow(x, y) {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.max(0, Math.floor(y / TILE)); ty < this.h; ty++) {
      if (this.solidAt(tx, ty) && !this.solidAt(tx, ty - 1)) {
        let x0 = tx, x1 = tx;
        if (this.solidAt(tx - 1, ty) && !this.solidAt(tx - 1, ty - 1)) x0--;
        if (this.solidAt(tx + 1, ty) && !this.solidAt(tx + 1, ty - 1)) x1++;
        return { x0: x0 * TILE, x1: (x1 + 1) * TILE, y: ty * TILE };
      }
    }
    return null;
  }

  stepGadgets(dt) {
    for (const side in this.gad) for (const id in this.gad[side]) { const g = this.gad[side][id]; g.cd = Math.max(0, g.cd - dt); }
    const p = this.player, B = GADGETS.trapper.bolt;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (f.k === 'bolt') {
        const before = f.t; f.t += dt;
        if (before < B.warn && f.t >= B.warn) {
          this.emit('zap', f.x, p.y);
          if (!p.dead && !p.finished && Math.abs(p.x + PHYS.w / 2 - f.x) < B.width / 2 + PHYS.w / 2) this.hit('bolt', B.stun);
        }
        if (f.t > B.warn + 0.25) this.fx.splice(i, 1);
      } else if (f.k === 'glue') { f.t -= dt; if (f.t <= 0) this.fx.splice(i, 1); }
    }
  }

  // A non-deadly hit: stuns (a shield blocks it).
  hit(why, stun) {
    const p = this.player;
    if (p.shield > 0) { p.shield = 0; p.inv = 0.5; this.emit('block', p.x + 5, p.y + 6); return; }
    p.stun = Math.max(p.stun, stun);
    this.emit('stun', p.x + 5, p.y, why);
  }

  // input: { left, right, jump (held), jumpPressed (this frame) }
  step(dt, input) {
    this.stepTraps(dt);
    const p = this.player;
    if (p.finished) { p.vx *= 0.8; this.movePlayer(dt); return; }
    this.time += dt;
    if (p.dead) {
      p.deadT -= dt;
      if (p.deadT <= 0) { Object.assign(p, { dead: false, x: p.cp.x, y: p.cp.y, vx: 0, vy: 0, buffer: 0, stun: 0, rev: 0, gust: 0, dash: 0, inv: 0.6 }); this.emit('spawn', p.x + 5, p.y + 6); }
      return;
    }
    for (const k of ['stun', 'rev', 'shield', 'inv', 'gust']) p[k] = Math.max(0, p[k] - dt);
    const stunned = p.stun > 0;
    let L = input.left, R = input.right;
    if (p.rev > 0) [L, R] = [R, L];
    if (stunned) L = R = false;
    p.slow = this.fx.some(f => f.k === 'glue' && p.onGround && p.x + PHYS.w > f.x0 && p.x < f.x1 && Math.abs(p.y + PHYS.h - f.y) < 2);
    const maxRun = PHYS.maxRun * (p.slow ? GADGETS.trapper.glue.slow : 1);
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    if (p.dash > 0) {   // a dash keeps its speed and ignores gravity for a moment
      p.dash -= dt; p.vy = Math.min(p.vy, 0);
    } else if (dir) {
      p.face = dir;
      const a = p.onGround ? PHYS.accelGround : PHYS.accelAir;
      if (Math.sign(p.vx) !== dir && p.vx !== 0) p.vx += dir * a * 1.6 * dt;   // snappy turnaround
      else p.vx += dir * a * dt;
      if (Math.abs(p.vx) > maxRun) p.vx = Math.sign(p.vx) * Math.max(maxRun, Math.abs(p.vx) - PHYS.friction * dt);
    } else if (p.onGround || !stunned) {   // stunned in the air keeps its momentum so a jump still lands
      const f = (p.onGround ? PHYS.friction : PHYS.friction * 0.45) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    if (p.gust > 0) { p.vx += p.gustDir * GADGETS.trapper.gust.push * dt * (p.onGround ? 1 : 0.35); p.vx = Math.max(-PHYS.maxRun * 1.15, Math.min(PHYS.maxRun * 1.15, p.vx)); }
    p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;
    p.buffer = input.jumpPressed && !stunned ? PHYS.buffer : p.buffer - dt;
    const jv = PHYS.jumpV * (p.slow ? 0.78 : 1);
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -jv; p.buffer = 0; p.coyote = 0; p.onGround = false; p.wasJump = true;
      this.emit('jump', p.x + 5, p.y + PHYS.h);
    } else if (input.jumpPressed && !stunned && !p.onGround && p.coyote <= 0 && this.gad.runner.feather.n > 0) {
      p.vy = -jv * 0.9; p.buffer = 0; p.wasJump = true; p.sprung = false; this.gad.runner.feather.n--;
      this.emit('airjump', p.x + 5, p.y + PHYS.h);
    }
    // fans push up
    const F = TRAPS.fan;
    p.lifted = this.fanZones().some(z => overlap(p.x, p.y, PHYS.w, PHYS.h, z));
    if (p.lifted) { p.vy = Math.max(-F.maxUp, p.vy - F.push * dt); p.sprung = true; }
    if (p.vy >= 0) p.sprung = false;
    let g = p.vy < 0 && !p.sprung && !(input.jump && p.wasJump) ? PHYS.gravityCut : PHYS.gravity;
    if (p.vy >= 0) g = PHYS.fallGravity;
    if (Math.abs(p.vy) < 50 && input.jump && p.wasJump) g *= PHYS.apexGravity;
    if (p.dash <= 0) p.vy = Math.min(PHYS.maxFall, p.vy + g * dt);
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
    if (p.inv > 0) return;
    const hb = { x: p.x + 1, y: p.y + 2, w: PHYS.w - 2, h: PHYS.h - 2 };
    for (let ty = Math.floor(hb.y / TILE); ty <= Math.floor((hb.y + hb.h) / TILE); ty++)
      for (let tx = Math.floor(hb.x / TILE); tx <= Math.floor((hb.x + hb.w) / TILE); tx++)
      {
        const tt = this.tile(tx, ty);
        if (tt === SPIKE && overlap(hb.x, hb.y, hb.w, hb.h, { x: tx * TILE + 2, y: ty * TILE + 9, w: 12, h: 7 })) return this.kill('spike');
        if (tt === CEILSPIKE && overlap(hb.x, hb.y, hb.w, hb.h, { x: tx * TILE + 2, y: ty * TILE, w: 12, h: 7 })) return this.kill('spike');
      }
    for (const d of this.dangers()) if (overlap(hb.x, hb.y, hb.w, hb.h, d)) return this.kill('trap');
  }

  kill(why) {
    const p = this.player;
    if (why !== 'fall' && p.shield > 0) {   // the shield eats one hit and bounces the runner up
      p.shield = 0; p.inv = 0.6; p.vy = -260; p.onGround = false;
      this.emit('block', p.x + 5, p.y + 6); return;
    }
    p.dead = true; p.deadT = PHYS.respawn; p.deaths++;
    this.emit('die', p.x + 5, p.y + 6, why);
  }

  movePlayer(dt) {
    const p = this.player, W = PHYS.w, H = PHYS.h;
    p.x += p.vx * dt;
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + H - 0.01) / TILE);
    if (p.vx > 0) { const tx = Math.floor((p.x + W) / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = tx * TILE - W; p.vx = 0; break; } }
    else if (p.vx < 0) { const tx = Math.floor(p.x / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = (tx + 1) * TILE; p.vx = 0; break; } }
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
    const p = this.player;
    const ev = this.events; this.events = [];
    const gad = side => Object.values(this.gad[side]).map(g => [g.n, r1(g.cd)]);
    return {
      t: 'snap', tm: r1(this.time), d: p.deaths, lk: r1(this.lock), jm: r1(this.jam),
      p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.face, (p.onGround ? 1 : 0) | (p.dead ? 2 : 0) | (p.finished ? 4 : 0) | (p.slow ? 8 : 0) | (p.lifted ? 16 : 0)],
      st: [r1(p.stun), r1(p.rev), r1(p.shield), r1(p.inv), r1(p.gust)],
      tr: this.traps.map(t => [STATES.indexOf(t.state), r1(t.t), r1(t.cd), r1(t.oy)]),
      b: this.shots.map(s => [r1(s.x), r1(s.y), s.vx, s.kind === 'arrows' ? 1 : 0]),
      fx: this.fx.map(f => f.k === 'bolt' ? [0, f.x, r1(f.t)] : [1, f.x0, f.x1, f.y, r1(f.t)]),
      g: [gad('trapper'), gad('runner')],
      cp: this.checkpoints.map(c => c.on ? 1 : 0).join(''),
      ev,
    };
  }
  applySnap(s) {
    const p = this.player;
    this.time = s.tm; p.deaths = s.d; this.lock = s.lk; this.jam = s.jm || 0;
    [p.x, p.y, p.vx, p.vy, p.face] = s.p;
    const f = s.p[5];
    p.onGround = !!(f & 1); p.dead = !!(f & 2); p.finished = !!(f & 4); p.slow = !!(f & 8); p.lifted = !!(f & 16);
    if (s.st) [p.stun, p.rev, p.shield, p.inv, p.gust] = s.st;
    s.tr.forEach((a, i) => { const t = this.traps[i]; if (!t) return; t.state = STATES[a[0]]; t.t = a[1]; t.cd = a[2]; t.oy = a[3]; });
    this.shots = s.b.map(([x, y, vx, a]) => { const k = a ? 'arrows' : 'cannon', S = TRAPS[k].shot; return { kind: k, x, y, vx, w: S.w, h: S.h }; });
    if (s.fx) this.fx = s.fx.map(a => a[0] === 0 ? { k: 'bolt', x: a[1], t: a[2] } : { k: 'glue', x0: a[1], x1: a[2], y: a[3], t: a[4] });
    if (s.g) ['trapper', 'runner'].forEach((side, j) => Object.values(this.gad[side]).forEach((g, i) => { if (s.g[j][i]) [g.n, g.cd] = s.g[j][i]; }));
    [...s.cp].forEach((c, i) => { if (this.checkpoints[i]) this.checkpoints[i].on = c === '1'; });
  }
}

export function overlap(x, y, w, h, r) { return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y; }

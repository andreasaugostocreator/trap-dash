// The game world: tiles, the runner, traps, gadgets. Pure logic, no drawing, so it also runs in Node (tools/).
// Only the runner's device steps the world; the trapper's device mirrors it from snapshots (see snapshot/applySnap).
import { TILE, PHYS, TRAPS, TRAP_LOCK, GADGETS } from './config.js';
import { chooseLoadout } from './loadout.js';

export const EMPTY = 0, SOLID = 1, ONEWAY = 2, SPIKE = 3, SPRING = 4, DOOR = 5, CANNON = 6, NOZZLE = 7, TURRET = 8, FAN = 9, WALL = 10, CEILSPIKE = 11,
  RAIL = 12, LASER = 13, DROPPER = 14, BELT = 15, ICE = 16;
const STATES = ['idle', 'warn', 'active', 'recover'];
const GROUPED = { P: 'spikes', T: 'trapdoor', X: 'crusher', F: 'flame', W: 'fan', Z: 'saw', Q: 'conveyor', I: 'ice' };
const TILE_OF = { '#': SOLID, '=': ONEWAY, '^': SPIKE, B: SPRING, T: DOOR, '<': CANNON, '>': CANNON, F: NOZZLE, '{': TURRET, '}': TURRET, W: FAN, U: WALL,
  v: CEILSPIKE, Z: RAIL, K: LASER, k: LASER, D: DROPPER, Q: BELT, I: ICE };
const SOLIDS = new Set([SOLID, CANNON, NOZZLE, SPRING, TURRET, FAN, LASER, DROPPER, BELT, ICE]);
const r1 = v => Math.round(v * 10) / 10;
// Runner status timers (seconds left). Most come from gadgets.
const STATUS = ['stun', 'rev', 'shield', 'inv', 'gust', 'frost', 'fog', 'heavy', 'moon', 'squash', 'glide', 'boots', 'haste', 'phase', 'anchor', 'radar'];

export class World {
  constructor(level) {
    this.level = level;
    const rows = level.map;
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.trapAt = new Int16Array(this.w * this.h).fill(-1);
    this.traps = []; this.checkpoints = []; this.shots = []; this.events = []; this.fx = [];
    this.lock = 0; this.time = 0; this.jam = 0; this.slowmo = 0; this.decoy = null; this.trail = [];
    const ch = (x, y) => (rows[y] && rows[y][x]) || '.';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = ch(x, y), i = y * this.w + x;
      this.tiles[i] = TILE_OF[c] || EMPTY;
      if (c === 'S') this.start = { x: x * TILE + (TILE - PHYS.w) / 2, y: (y + 1) * TILE - PHYS.h };
      if (c === 'G') this.goal = { x: x * TILE, y: y * TILE };
      if (c === 'C') this.checkpoints.push({ x: x * TILE, y: y * TILE, on: false });
      if (c === '<' || c === '>') this.addTrap('cannon', x, x, y, { dir: c === '<' ? -1 : 1 });
      if (c === '{' || c === '}') this.addTrap('arrows', x, x, y, { dir: c === '{' ? -1 : 1 });
      if (c === 'K' || c === 'k') this.addTrap('laser', x, x, y, { dir: c === 'k' ? -1 : 1 });
      if (c === 'D') this.addTrap('dropper', x, x, y);
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
      if (t.kind === 'laser') {   // the beam runs until a wall
        let x = t.x0 + t.dir; while (x >= 0 && x < this.w && !this.solidAt(x, t.y)) x += t.dir;
        t.end = x;
      }
      if (t.kind === 'saw') t.len = (t.x1 - t.x0) * TILE;
    }
    this.player = { x: this.start.x, y: this.start.y, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, buffer: 0,
      dead: false, deadT: 0, finished: false, deaths: 0, cp: { ...this.start }, best: this.start.x, airT: 0, wasJump: false,
      gustDir: 0, slow: false, lifted: false, icy: false, carry: 0, dash: 0 };
    for (const k of STATUS) this.player[k] = 0;
    // Gadgets: the level decides which four each side gets.
    this.loadout = level.loadout || chooseLoadout(level, this);
    this.gad = {};
    for (const side of ['trapper', 'runner']) {
      this.gad[side] = {};
      for (const id of this.loadout[side]) this.gad[side][id] = { n: GADGETS[side][id].charges, cd: 0 };
    }
  }

  addTrap(kind, x0, x1, y, extra = {}) {
    this.traps.push({ id: this.traps.length, kind, x0, x1, y, state: 'idle', t: 0, cd: 0, oy: 0, vy: 0, ...extra });
  }

  tile(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? (y >= this.h || y < 0 ? EMPTY : SOLID) : this.tiles[y * this.w + x]; }
  trapOn(x, y) { const i = this.trapAt[y * this.w + x]; return i >= 0 ? this.traps[i] : null; }
  solidAt(x, y) {
    const t = this.tile(x, y);
    if (t === DOOR) { const tr = this.trapOn(x, y); return !(tr.state === 'active' || tr.state === 'recover'); }
    if (t === WALL) { const tr = this.trapOn(x, y); return tr.state === 'active' && !tr.pass; }
    return SOLIDS.has(t);
  }

  sawPos(t) {   // blade centre along the rail while it runs
    const C = TRAPS.saw, d = t.state === 'active' ? t.t * C.speed : 0, L = t.len;
    const along = d <= L ? d : Math.max(0, 2 * L - d);
    return { x: t.x0 * TILE + 8 + along, y: t.y * TILE + 9 };
  }

  // Rectangles that hurt right now, in world pixels. (Zones, beams, projectiles, blasts.)
  dangers(projectilesToo = true) {
    const out = [];
    for (const t of this.traps) {
      const x = t.x0 * TILE, w = (t.x1 - t.x0 + 1) * TILE, y = t.y * TILE;
      if (t.kind === 'spikes' && t.state === 'active') out.push({ x: x + 1, y: y + 7, w: w - 2, h: 9 });
      if (t.kind === 'crusher' && (t.state === 'active' || (t.state === 'recover' && t.t < TRAPS.crusher.impact))) out.push({ x, y: y + t.oy + 1, w, h: TILE - 1 });
      if (t.kind === 'flame' && t.state === 'active' && t.reach) out.push({ x: x + 3, y: y - t.reach * TILE + 2, w: w - 6, h: t.reach * TILE - 2 });
      if (t.kind === 'saw' && t.state === 'active') { const b = this.sawPos(t); out.push({ x: b.x - 6, y: b.y - 6, w: 12, h: 12 }); }
      if (t.kind === 'laser' && t.state === 'active' && projectilesToo) {
        const a = t.dir > 0 ? (t.x0 + 1) * TILE : (t.end + 1) * TILE, b = t.dir > 0 ? t.end * TILE : t.x0 * TILE;
        out.push({ x: Math.min(a, b), y: y + 6, w: Math.abs(b - a), h: 4 });
      }
    }
    if (projectilesToo) for (const s of this.shots) out.push({ x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h });
    for (const f of this.fx) if (f.k === 'boom') { const r = TRAPS.dropper.blast; out.push({ x: f.x - r, y: f.y - r, w: 2 * r, h: r + 4 }); }
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
    if (!t || t.state !== 'idle' || t.cd > 0 || (this.lock > 0 && !this.chained(t)) || this.jam > 0 || this.player.finished) return false;
    const C = TRAPS[t.kind], chained = this.chained(t);
    t.state = 'warn'; t.t = Math.min(lead, C.warn * 0.6); t.cd = C.hold ? 99 : C.cd; this.lock = TRAP_LOCK;
    if (chained) t.t = Math.max(t.t, C.warn - C.chainWarn);
    if (C.chain) { this.chainKind = t.kind; this.chainT = C.chain; }
    if (C.hold) t.holding = hold;
    this.emit('warn', (t.x0 + t.x1 + 1) * TILE / 2, t.y * TILE, t.kind);
    return true;
  }
  // Flames chain: right after one fires, the next one along needs no lock and almost no warning, so a row can't be outrun.
  chained(t) { return !!TRAPS[t.kind].chain && this.chainKind === t.kind && this.chainT > 0; }
  release(id) { const t = this.traps[id]; if (t) t.holding = false; }
  endBurn(t) { const C = TRAPS[t.kind]; t.cd = C.cdBase + C.cdPerSec * t.t; t.state = 'idle'; t.t = 0; t.holding = false; }

  emit(k, x, y, extra) { this.events.push(extra === undefined ? [k, Math.round(x), Math.round(y)] : [k, Math.round(x), Math.round(y), extra]); }

  stepTraps(realDt) {
    // Slow-mo (a runner gadget) slows traps, projectiles and the trapper's gadgets, not the runner.
    const dt = this.slowmo > 0 ? realDt * GADGETS.runner.slowmo.rate : realDt;
    this.slowmo = Math.max(0, this.slowmo - realDt);
    this.lock = Math.max(0, this.lock - dt); this.jam = Math.max(0, this.jam - realDt); this.chainT = Math.max(0, (this.chainT || 0) - dt);
    for (const t of this.traps) if (t.state === 'active' && TRAPS[t.kind].chain) { this.chainKind = t.kind; this.chainT = TRAPS[t.kind].chain; }
    const p = this.player, P = { x: p.x, y: p.y, w: PHYS.w, h: PHYS.h };
    for (const t of this.traps) {
      const C = TRAPS[t.kind], cx = (t.x0 + t.x1 + 1) * TILE / 2;
      t.cd = Math.max(0, t.cd - dt); t.t += dt;
      if (t.state === 'warn' && t.t >= C.warn) {
        t.state = 'active'; t.t = 0;
        if (t.kind === 'cannon' || t.kind === 'arrows') {
          this.shots.push({ kind: t.kind, x: t.x0 * TILE + 8 + t.dir * 9, y: t.y * TILE + 8, vx: t.dir * C.shot.speed, vy: 0, w: C.shot.w, h: C.shot.h });
          t.state = 'idle';
        }
        if (t.kind === 'dropper') {
          this.shots.push({ kind: 'bomb', x: t.x0 * TILE + 8, y: (t.y + 1) * TILE + 4, vx: 0, vy: 40, g: C.shot.g, w: C.shot.w, h: C.shot.h });
          t.state = 'idle';
        }
        if (t.kind === 'wall') {   // if the runner stands where the wall comes up, it bumps them up instead of trapping them
          t.pass = overlap(P.x, P.y, P.w, P.h, { x: t.x0 * TILE, y: (t.y - 1) * TILE, w: TILE, h: 2 * TILE });
          if (t.pass && !p.dead && !(p.anchor > 0)) { p.vy = -330; p.onGround = false; }
        }
        this.emit('fire', cx, t.y * TILE, t.kind);
      } else if (t.state === 'active') {
        if (t.kind === 'crusher') {   // slams: starts fast and speeds up
          if (t.vy < C.slam) t.vy = C.slam;
          t.vy += C.fallG * dt; t.oy += t.vy * dt;
          if (t.oy >= t.drop) { t.oy = t.drop; t.vy = 0; t.state = 'recover'; t.t = 0; this.emit('thud', cx, t.y * TILE + t.oy + TILE, 'crusher'); }
        } else if (t.kind === 'saw') {
          if (t.t * C.speed >= 2 * t.len) { t.state = 'idle'; t.t = 0; }
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
      if (s.g) s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += (s.vy || 0) * dt;
      const tx = Math.floor((s.x + Math.sign(s.vx) * s.w / 2) / TILE), ty = Math.floor((s.y + (s.vy > 0 ? s.h / 2 : 0)) / TILE);
      if (this.solidAt(tx, ty) || s.x < -20 || s.x > this.w * TILE + 20 || s.y > this.h * TILE + 20) {
        if (s.kind === 'bomb') { this.fx.push({ k: 'boom', x: s.x, y: ty * TILE, t: TRAPS.dropper.blastTime }); this.emit('thud', s.x, ty * TILE, 'bomb'); }
        else this.emit('poof', s.x, s.y, s.kind);
        this.shots.splice(i, 1);
      }
    }
    this.stepGadgets(dt, realDt);
  }

  // ---------- gadgets
  useGadget(side, id, x, y, lead = 0) {
    const def = GADGETS[side] && GADGETS[side][id], g = this.gad[side] && this.gad[side][id], p = this.player;
    if (!def || !g || def.passive || g.n === 0 || g.cd > 0 || p.finished || p.dead) return false;
    if (side === 'trapper' && this.jam > 0) return false;
    const px = p.x + PHYS.w / 2, py = p.y + PHYS.h / 2;
    switch (id) {
      // trapper
      case 'bolt': this.fx.push({ k: 'bolt', x: Math.round(x), t: Math.min(lead, def.warn * 0.5) }); break;
      case 'glue': case 'mine': {
        const spot = this.floorBelow(x, y, id === 'mine' ? 0 : 1);
        if (!spot) return false;
        this.fx.push(id === 'glue' ? { k: 'glue', x0: spot.x0, x1: spot.x1, y: spot.y, t: def.life } : { k: 'mine', x0: spot.x0, x1: spot.x1, y: spot.y, t: def.life });
        break;
      }
      case 'bat': this.fx.push({ k: 'bat', x: Math.round(x), y: Math.round(y), t: def.life }); break;
      case 'gust': p.gust = def.time; p.gustDir = -p.face; break;
      case 'hex': p.rev = def.time; break;
      case 'frost': p.frost = def.time; break;
      case 'fog': p.fog = def.time; break;
      case 'anvil': p.heavy = def.time; p.moon = 0; break;
      case 'moon': p.moon = def.time; p.heavy = 0; break;
      case 'squash': p.squash = def.time; break;
      case 'rewind': {   // back to where the runner was a couple of seconds ago
        const back = this.trail[0];
        if (!back) return false;
        Object.assign(p, { x: back.x, y: back.y, vx: 0, vy: 0, inv: Math.max(p.inv, 0.3) }); this.trail = [];
        break;
      }
      // runner
      case 'dash': p.dash = def.time; p.vx = p.face * def.speed; p.vy = Math.min(p.vy, 0); break;
      case 'shield': p.shield = def.time; break;
      case 'jam': this.jam = def.time; break;
      case 'blink': {   // hop forward up to three tiles, as far as there is room
        let d = 0;
        for (let step = 1; step <= def.dist * 4; step++) {
          const nx = p.x + p.face * step * TILE / 4;
          if (!this.boxFree(nx, p.y)) break;
          d = step * TILE / 4;
        }
        if (d < TILE / 2) return false;
        p.x += p.face * d; p.vy = Math.min(p.vy, 0);
        break;
      }
      case 'glider': p.glide = def.time; break;
      case 'boots': p.boots = def.time; break;
      case 'haste': p.haste = def.time; break;
      case 'slowmo': this.slowmo = def.time; break;
      case 'flag': if (!p.onGround) return false; p.cp = { x: p.x, y: p.y }; this.emit('cp', px, p.y + PHYS.h - TILE); break;
      case 'decoy': this.decoy = { x: p.x, y: p.y, vx: p.face * PHYS.maxRun, face: p.face, t: def.time }; break;
      case 'phase': p.phase = def.time; break;
      case 'magnet': p.anchor = def.time; p.gust = 0; break;
      case 'peek': p.radar = def.time; break;
      default: return false;
    }
    if (g.n > 0) g.n--;
    g.cd = def.cd;
    this.emit('gadget', def.aim ? x : px, def.aim ? y : py, id);
    return true;
  }

  boxFree(x, y) {
    for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + PHYS.h - 0.01) / TILE); ty++)
      for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + PHYS.w - 0.01) / TILE); tx++) if (this.solidAt(tx, ty)) return false;
    return true;
  }

  // The floor under a point (only where there is floor): `extra` tiles to each side. For glue and mines.
  floorBelow(x, y, extra = 1) {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.max(0, Math.floor(y / TILE)); ty < this.h; ty++) {
      if (this.solidAt(tx, ty) && !this.solidAt(tx, ty - 1)) {
        let x0 = tx, x1 = tx;
        for (let i = 0; i < extra; i++) {
          if (this.solidAt(x0 - 1, ty) && !this.solidAt(x0 - 1, ty - 1)) x0--;
          if (this.solidAt(x1 + 1, ty) && !this.solidAt(x1 + 1, ty - 1)) x1++;
        }
        return { x0: x0 * TILE, x1: (x1 + 1) * TILE, y: ty * TILE };
      }
    }
    return null;
  }

  stepGadgets(dt, realDt) {
    for (const id in this.gad.trapper) { const g = this.gad.trapper[id]; g.cd = Math.max(0, g.cd - realDt); }
    for (const id in this.gad.runner) { const g = this.gad.runner[id]; g.cd = Math.max(0, g.cd - realDt); }
    const p = this.player, T = GADGETS.trapper, cx = p.x + PHYS.w / 2, cy = p.y + PHYS.h / 2;
    const alive = !p.dead && !p.finished;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (f.k === 'bolt') {
        const before = f.t; f.t += dt;
        if (before < T.bolt.warn && f.t >= T.bolt.warn) {
          this.emit('zap', f.x, p.y);
          if (alive && !(p.phase > 0) && Math.abs(cx - f.x) < T.bolt.width / 2 + PHYS.w / 2) this.hit('bolt', T.bolt.stun);
        }
        if (f.t > T.bolt.warn + 0.25) this.fx.splice(i, 1);
      } else if (f.k === 'glue') { f.t -= dt; if (f.t <= 0) this.fx.splice(i, 1); }
      else if (f.k === 'mine') {
        f.t -= dt;
        if (alive && p.onGround && p.x + PHYS.w > f.x0 + 3 && p.x < f.x1 - 3 && Math.abs(p.y + PHYS.h - f.y) < 2) {
          this.emit('pop', (f.x0 + f.x1) / 2, f.y);
          if (!(p.anchor > 0)) { p.vy = -T.mine.pop; p.onGround = false; }
          this.hit('mine', T.mine.stun); this.fx.splice(i, 1);
        } else if (f.t <= 0) this.fx.splice(i, 1);
      } else if (f.k === 'bat') {   // flies at the runner
        f.t -= dt;
        const dx = cx - f.x, dy = cy - f.y, d = Math.hypot(dx, dy) || 1;
        f.x += dx / d * T.bat.speed * dt; f.y += dy / d * T.bat.speed * dt; f.face = Math.sign(dx) || 1;
        if (alive && d < 9 && !(p.phase > 0)) { this.hit('bat', T.bat.stun); this.emit('poof', f.x, f.y, 'bat'); this.fx.splice(i, 1); }
        else if (f.t <= 0) { this.emit('poof', f.x, f.y, 'bat'); this.fx.splice(i, 1); }
      } else if (f.k === 'boom') { f.t -= dt; if (f.t <= 0) this.fx.splice(i, 1); }
    }
    if (this.decoy) {
      const d = this.decoy; d.t -= realDt; d.x += d.vx * realDt;
      if (d.t <= 0 || !this.boxFree(d.x, d.y)) this.decoy = null;
    }
  }

  // A non-deadly hit: stuns (a shield blocks it).
  hit(why, stun) {
    const p = this.player;
    if (p.shield > 0) { p.shield = 0; p.inv = 0.5; this.emit('block', p.x + 5, p.y + 6); return; }
    p.stun = Math.max(p.stun, stun);
    this.emit('stun', p.x + 5, p.y, why);
  }

  standingOn(kind) {   // an active floor trap of this kind under the runner's feet
    const p = this.player;
    if (!p.onGround) return null;
    const ty = Math.floor((p.y + PHYS.h + 1) / TILE);
    for (const tx of [Math.floor((p.x + 1) / TILE), Math.floor((p.x + PHYS.w - 1) / TILE)]) {
      const t = this.trapOn(tx, ty);
      if (t && t.kind === kind && t.state === 'active') return t;
    }
    return null;
  }

  // input: { left, right, jump (held), jumpPressed (this frame) }
  step(dt, input) {
    this.stepTraps(dt);
    const p = this.player, G = GADGETS;
    if (p.finished) { p.vx *= 0.8; p.carry = 0; this.movePlayer(dt); return; }
    this.time += dt;
    if (p.dead) {
      p.deadT -= dt;
      if (p.deadT <= 0) {
        Object.assign(p, { dead: false, x: p.cp.x, y: p.cp.y, vx: 0, vy: 0, buffer: 0, dash: 0 });
        for (const k of STATUS) p[k] = 0;
        p.inv = 0.6; this.trail = [];
        this.emit('spawn', p.x + 5, p.y + 6);
      }
      return;
    }
    for (const k of STATUS) p[k] = Math.max(0, p[k] - dt);
    // where the runner was, for the trapper's Rewind
    this.trailT = (this.trailT || 0) + dt;
    if (this.trailT >= 0.1) { this.trailT = 0; this.trail.push({ x: p.x, y: p.y }); if (this.trail.length > G.trapper.rewind.back * 10) this.trail.shift(); }

    const stunned = p.stun > 0;
    let L = input.left, R = input.right;
    if (p.rev > 0) [L, R] = [R, L];
    if (stunned) L = R = false;
    p.slow = this.fx.some(f => f.k === 'glue' && p.onGround && p.x + PHYS.w > f.x0 && p.x < f.x1 && Math.abs(p.y + PHYS.h - f.y) < 2);
    p.icy = p.frost > 0 || !!this.standingOn('ice');
    const belt = p.anchor > 0 ? null : this.standingOn('conveyor');
    p.carry = belt ? TRAPS.conveyor.carry : 0;
    // Wind carries you like a belt does, whatever you press: running into it crawls, jumps fall short.
    if (p.gust > 0 && !(p.anchor > 0)) p.carry += p.gustDir * (p.onGround ? G.trapper.gust.wind : G.trapper.gust.windAir);
    const maxRun = PHYS.maxRun * (p.slow ? G.trapper.glue.slow : 1) * (p.haste > 0 ? G.runner.haste.speed : 1) * (p.squash > 0 ? G.trapper.squash.speed : 1);
    const grip = p.icy ? 0.3 : 1;                 // ice: weak acceleration, almost no friction
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    if (p.dash > 0) {   // a dash keeps its speed and ignores gravity for a moment
      p.dash -= dt; p.vy = Math.min(p.vy, 0);
    } else if (dir) {
      p.face = dir;
      const a = (p.onGround ? PHYS.accelGround : PHYS.accelAir) * grip;
      if (Math.sign(p.vx) !== dir && p.vx !== 0) p.vx += dir * a * 1.6 * dt;   // snappy turnaround
      else p.vx += dir * a * dt;
      if (Math.abs(p.vx) > maxRun) p.vx = Math.sign(p.vx) * Math.max(maxRun, Math.abs(p.vx) - PHYS.friction * dt);
    } else if (p.onGround || !stunned) {   // stunned in the air keeps its momentum so a jump still lands
      const f = (p.onGround ? PHYS.friction * (p.icy ? 0.06 : 1) : PHYS.friction * 0.45) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;
    p.buffer = input.jumpPressed && !stunned ? PHYS.buffer : p.buffer - dt;
    const jv = PHYS.jumpV * (p.slow ? 0.78 : 1) * (p.boots > 0 ? G.runner.boots.jump : 1) * (p.heavy > 0 ? G.trapper.anvil.jump : 1) * (p.squash > 0 ? 0.85 : 1);
    const feather = this.gad.runner.feather;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -jv; p.buffer = 0; p.coyote = 0; p.onGround = false; p.wasJump = true;
      this.emit('jump', p.x + 5, p.y + PHYS.h);
    } else if (feather && input.jumpPressed && !stunned && !p.onGround && p.coyote <= 0 && feather.n > 0) {
      p.vy = -jv * 0.9; p.buffer = 0; p.wasJump = true; p.sprung = false; feather.n--;
      this.emit('airjump', p.x + 5, p.y + PHYS.h);
    }
    // fans push up
    const F = TRAPS.fan;
    p.lifted = !(p.anchor > 0) && this.fanZones().some(z => overlap(p.x, p.y, PHYS.w, PHYS.h, z));
    if (p.lifted) { p.vy = Math.max(-F.maxUp, p.vy - F.push * dt); p.sprung = true; }
    if (p.vy >= 0) p.sprung = false;
    let g = p.vy < 0 && !p.sprung && !(input.jump && p.wasJump) ? PHYS.gravityCut : PHYS.gravity;
    if (p.vy >= 0) g = PHYS.fallGravity;
    if (Math.abs(p.vy) < 50 && input.jump && p.wasJump) g *= PHYS.apexGravity;
    if (p.heavy > 0) g *= G.trapper.anvil.grav;
    if (p.moon > 0) g *= G.trapper.moon.grav;
    if (!(p.dash > 0)) p.vy = Math.min(PHYS.maxFall * (p.moon > 0 ? 0.6 : 1), p.vy + g * dt);
    if (p.glide > 0 && input.jump && p.vy > G.runner.glider.fall) p.vy = G.runner.glider.fall;   // hold jump to float down
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
      for (let tx = Math.floor(hb.x / TILE); tx <= Math.floor((hb.x + hb.w) / TILE); tx++) {
        const tt = this.tile(tx, ty);
        if (tt === SPIKE && overlap(hb.x, hb.y, hb.w, hb.h, { x: tx * TILE + 2, y: ty * TILE + 9, w: 12, h: 7 })) return this.kill('spike');
        if (tt === CEILSPIKE && overlap(hb.x, hb.y, hb.w, hb.h, { x: tx * TILE + 2, y: ty * TILE, w: 12, h: 7 })) return this.kill('spike');
      }
    for (const d of this.dangers(!(p.phase > 0))) if (overlap(hb.x, hb.y, hb.w, hb.h, d)) return this.kill('trap');
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
    p.x += (p.vx + (p.carry || 0)) * dt;
    const vx = p.vx + (p.carry || 0);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + H - 0.01) / TILE);
    if (vx > 0) { const tx = Math.floor((p.x + W) / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = tx * TILE - W; p.vx = Math.min(p.vx, 0); break; } }
    else if (vx < 0) { const tx = Math.floor(p.x / TILE); for (let ty = y0; ty <= y1; ty++) if (this.solidAt(tx, ty)) { p.x = (tx + 1) * TILE; p.vx = Math.max(p.vx, 0); break; } }
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
    const gad = side => this.loadout[side].map(id => [this.gad[side][id].n, r1(this.gad[side][id].cd)]);
    const round = o => { const out = {}; for (const k in o) out[k] = typeof o[k] === 'number' ? r1(o[k]) : o[k]; return out; };
    return {
      t: 'snap', tm: r1(this.time), d: p.deaths, lk: r1(this.lock), jm: r1(this.jam), ck: this.chainT > 0 ? [this.chainKind, r1(this.chainT)] : 0, sm: r1(this.slowmo),
      p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.face, (p.onGround ? 1 : 0) | (p.dead ? 2 : 0) | (p.finished ? 4 : 0) | (p.slow ? 8 : 0) | (p.lifted ? 16 : 0) | (p.icy ? 32 : 0), r1(p.carry)],
      st: STATUS.map(k => r1(p[k])),
      tr: this.traps.map(t => [STATES.indexOf(t.state), r1(t.t), r1(t.cd), r1(t.oy)]),
      b: this.shots.map(round),
      fx: this.fx.map(round),
      dc: this.decoy ? round(this.decoy) : null,
      g: [gad('trapper'), gad('runner')],
      cp: this.checkpoints.map(c => c.on ? 1 : 0).join(''),
      ev,
    };
  }
  applySnap(s) {
    const p = this.player;
    this.time = s.tm; p.deaths = s.d; this.lock = s.lk; this.jam = s.jm || 0; [this.chainKind, this.chainT] = s.ck || [null, 0]; this.slowmo = s.sm || 0;
    [p.x, p.y, p.vx, p.vy, p.face] = s.p;
    const f = s.p[5];
    p.onGround = !!(f & 1); p.dead = !!(f & 2); p.finished = !!(f & 4); p.slow = !!(f & 8); p.lifted = !!(f & 16); p.icy = !!(f & 32); p.carry = s.p[6] || 0;
    if (s.st) STATUS.forEach((k, i) => { p[k] = s.st[i] || 0; });
    s.tr.forEach((a, i) => { const t = this.traps[i]; if (!t) return; t.state = STATES[a[0]]; t.t = a[1]; t.cd = a[2]; t.oy = a[3]; });
    this.shots = s.b; this.fx = s.fx || []; this.decoy = s.dc || null;
    if (s.g) ['trapper', 'runner'].forEach((side, j) => this.loadout[side].forEach((id, i) => { const g = this.gad[side][id]; if (g && s.g[j][i]) [g.n, g.cd] = s.g[j][i]; }));
    [...s.cp].forEach((c, i) => { if (this.checkpoints[i]) this.checkpoints[i].on = c === '1'; });
  }
}

export function overlap(x, y, w, h, r) { return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y; }

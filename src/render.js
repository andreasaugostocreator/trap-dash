// Everything drawn in code: backgrounds, tiles, traps, the veggie runner and particles.
import { TILE, PHYS, TRAPS } from './config.js';
import { SOLID, ONEWAY, SPIKE, SPRING, DOOR, CANNON, NOZZLE } from './sim.js';
import { THEMES } from './levels.js';

const TAU = Math.PI * 2;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
export const TRAP_ICON = { spikes: '▲', trapdoor: '▤', cannon: '●', crusher: '■', flame: '♨' };

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, s: 3 }; this.parts = []; this.shake = 0; this.t = 0; this.springT = {};
    this.squash = 0; this.lastFace = 1; this.blink = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.dpr = dpr; this.vw = w; this.vh = h;
  }

  // Follow the runner; zoom so about 15 tiles fit vertically (a little more for the trapper).
  follow(world, dt, wide, snap) {
    const p = world.player;
    let s = Math.min(this.vh / (TILE * (wide ? 17 : 15)), this.vw / (TILE * 22)) * this.dpr;
    s = Math.max(s, Math.min(this.c.height / (world.h * TILE), this.c.width / (TILE * 13)));   // tall screens: zoom in, but keep ~13 tiles across
    this.cam.s = s;
    const vw = this.c.width / s, vh = this.c.height / s;
    this.lookX = (this.lookX ?? 0) + ((p.face * 40 + p.vx * 0.25) - (this.lookX ?? 0)) * Math.min(1, dt * 3);
    let tx = p.x + PHYS.w / 2 + this.lookX - vw / 2, ty = p.y + PHYS.h / 2 - vh * 0.55;
    const W = world.w * TILE, H = world.h * TILE;
    tx = vw >= W ? (W - vw) / 2 : Math.max(0, Math.min(W - vw, tx));
    ty = vh >= H ? H - vh : Math.max(0, Math.min(H - vh, ty));
    const k = snap ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * Math.min(1, k * 0.8 + (snap ? 1 : 0));
    this.vwW = vw; this.vhW = vh;
  }

  toWorld(cx, cy) { return { x: cx * this.dpr / this.cam.s + this.cam.x, y: cy * this.dpr / this.cam.s + this.cam.y }; }

  // ---- events from the world become particles and little animations
  onEvent([k, x, y, extra], colors) {
    const P = (n, f) => { for (let i = 0; i < n; i++) this.parts.push(f(i)); };
    const dust = (n, sp = 40) => P(n, i => ({ x, y, vx: (Math.random() - 0.5) * sp * 2, vy: -Math.random() * sp * 0.6, life: 0.35 + Math.random() * 0.2, size: 2 + Math.random() * 2, color: '#ffffffcc', g: 60 }));
    if (k === 'jump') dust(5, 35);
    if (k === 'land') { dust(4 + Math.round(extra * 6), 50); this.squash = 0.25 * extra + 0.1; }
    if (k === 'die') {
      this.shake = 0.3;
      P(18, () => { const a = Math.random() * TAU, v = 60 + Math.random() * 140; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.6 + Math.random() * 0.4, size: 2 + Math.random() * 3, color: Math.random() < 0.7 ? colors.body : colors.leaf, g: 500 }; });
      P(6, () => ({ x, y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.5, size: 5, color: '#ffffffaa', g: -20 }));
    }
    if (k === 'spawn') P(10, i => { const a = i / 10 * TAU; return { x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 0.35, size: 2.5, color: '#fff', g: 0 }; });
    if (k === 'cp' || k === 'goal') P(k === 'goal' ? 50 : 22, () => ({ x, y: y - 8, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 140, life: 1 + Math.random() * 0.6, size: 2 + Math.random() * 2, color: ['#ff5d8f', '#ffd84a', '#5ab4ff', '#8fdc5a', '#b48cff'][Math.floor(Math.random() * 5)], g: 300, spin: true }));
    if (k === 'poof') P(6, () => ({ x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.35, size: 3 + Math.random() * 2, color: '#8a8a8acc', g: -30 }));
    if (k === 'thud') { this.shake = Math.max(this.shake, 0.18); dust(10, 80); }
    if (k === 'fire' && extra === 'cannon') { this.shake = Math.max(this.shake, 0.06); P(5, () => ({ x, y: y + 8, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 40, life: 0.3, size: 3, color: '#cfcfcfcc', g: -20 })); }
    if (k === 'spring') this.springT[x + ',' + y] = this.t;
  }

  draw(world, o) {
    const { ctx } = this, dt = o.dt;
    this.t += dt; this.shake = Math.max(0, this.shake - dt);
    const th = THEMES[world.level.theme] || THEMES.day;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSky(th);
    const s = this.cam.s, sh = this.shake > 0 ? this.shake * 10 : 0;
    const cx = Math.round((this.cam.x + (Math.random() - 0.5) * sh) * s) / s, cy = Math.round((this.cam.y + (Math.random() - 0.5) * sh) * s) / s;
    ctx.setTransform(s, 0, 0, s, -cx * s, -cy * s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    this.drawTiles(world, th);
    this.drawGoalAndFlags(world, th);
    for (const t of world.traps) this.drawTrap(world, t, th);
    for (const b of world.balls) this.drawBall(b, th);
    if (!world.player.dead) this.drawPlayer(world.player, o.colors, th, dt);
    this.drawParticles(dt);
    this.drawTrapButtons(world, o, th, !o.trapper);
    if (o.debug) for (const d of world.dangers()) { ctx.strokeStyle = 'red'; ctx.lineWidth = 0.5; ctx.strokeRect(d.x, d.y, d.w, d.h); }
  }

  drawSky(th) {
    const { ctx, c } = this, s = this.cam.s;
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    if (th.stars) {
      ctx.fillStyle = '#ffffffaa';
      for (let i = 0; i < 70; i++) {
        const x = ((hash(i, 1) * c.width * 1.5 - this.cam.x * s * 0.05) % c.width + c.width) % c.width, y = hash(i, 2) * c.height * 0.7;
        const r = (0.6 + hash(i, 3) * 1.2) * s * 0.4 * (0.7 + 0.3 * Math.sin(this.t * 2 + i));
        ctx.fillRect(x, y, r, r);
      }
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(c.width * 0.8 - this.cam.x * s * 0.02, c.height * 0.18, 14 * s, 0, TAU); ctx.fill();
    }
    // clouds
    ctx.fillStyle = th.cloud; ctx.globalAlpha = th.stars ? 0.35 : 0.9;
    for (let i = 0; i < 7; i++) {
      const span = c.width + 120 * s;
      const x = ((hash(i, 7) * span - this.cam.x * s * 0.15 + this.t * 6 * s * (0.5 + hash(i, 9))) % span + span) % span - 60 * s;
      const y = (hash(i, 8) * 0.4 + 0.05) * c.height - this.cam.y * s * 0.05;
      const r = (10 + hash(i, 10) * 10) * s;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x + r * 1.1, y + r * 0.2, r * 0.8, 0, TAU); ctx.arc(x - r * 1.0, y + r * 0.3, r * 0.7, 0, TAU);
      ctx.rect(x - r * 1.6, y + r * 0.3, r * 3.4, r * 0.7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // two layers of rolling hills
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.45 : 0.25, base = c.height * (layer ? 0.78 : 0.68) - this.cam.y * s * par * 0.3;
      ctx.fillStyle = th.hill[layer];
      ctx.beginPath(); ctx.moveTo(0, c.height);
      for (let x = 0; x <= c.width + 10; x += 8) {
        const wx = (x / s + this.cam.x * par) / 40;
        ctx.lineTo(x, base - (Math.sin(wx + layer * 2) * 0.5 + Math.sin(wx * 0.37 + layer) * 0.5 + 1) * 22 * s * (layer ? 0.8 : 1.2));
      }
      ctx.lineTo(c.width, c.height); ctx.fill();
    }
  }

  drawTiles(world, th) {
    const { ctx } = this;
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE) - 1), x1 = Math.min(world.w - 1, Math.ceil((this.cam.x + this.vwW) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE) - 1), y1 = Math.min(world.h - 1, Math.ceil((this.cam.y + this.vhW) / TILE) + 1);
    const ground = (x, y) => { const t = world.tile(x, y); return t === SOLID || t === NOZZLE; };
    // fill pass
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = world.tile(x, y), px = x * TILE, py = y * TILE;
      if (t === SOLID) {
        ctx.fillStyle = th.dirt; ctx.fillRect(px - 0.05, py - 0.05, TILE + 0.1, TILE + 0.1);
        ctx.fillStyle = th.dirtDark;
        for (let i = 0; i < 3; i++) { const r = hash(x * 3 + i, y); if (r < 0.6) { ctx.beginPath(); ctx.ellipse(px + 2 + hash(x, y * 5 + i) * 12, py + 3 + hash(x * 7, y + i) * 10, 1.6, 1.1, 0, 0, TAU); ctx.fill(); } }
      }
    }
    // outline + grass pass
    ctx.strokeStyle = th.line; ctx.lineWidth = 1.2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = world.tile(x, y), px = x * TILE, py = y * TILE;
      if (t === SOLID) {
        ctx.beginPath();
        if (!ground(x - 1, y) && x > 0) { ctx.moveTo(px, py); ctx.lineTo(px, py + TILE); }
        if (!ground(x + 1, y) && x < world.w - 1) { ctx.moveTo(px + TILE, py); ctx.lineTo(px + TILE, py + TILE); }
        if (!ground(x, y + 1) && y < world.h - 1) { ctx.moveTo(px, py + TILE); ctx.lineTo(px + TILE, py + TILE); }
        ctx.stroke();
        if (!ground(x, y - 1) && y > 0 && world.tile(x, y - 1) !== SPRING) {  // grass on exposed tops
          ctx.fillStyle = th.grass;
          ctx.beginPath(); ctx.moveTo(px - (ground(x - 1, y) ? 0 : 1), py - 1);
          ctx.lineTo(px + TILE + (ground(x + 1, y) ? 0 : 1), py - 1);
          ctx.lineTo(px + TILE + (ground(x + 1, y) ? 0 : 1), py + 4);
          for (let i = 4; i >= 0; i--) ctx.quadraticCurveTo(px + i * 4 + 2, py + 7 + hash(x, i) * 1.5, px + i * 4 - (i ? 0 : (ground(x - 1, y) ? 0 : 1)), py + 4);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          if (hash(x, y + 99) < 0.25) { ctx.fillStyle = hash(x, 5) < 0.5 ? '#fff' : '#ffd84a'; ctx.beginPath(); ctx.arc(px + 4 + hash(x, 6) * 8, py - 2, 1.4, 0, TAU); ctx.fill(); }
        }
      } else if (t === ONEWAY) {
        ctx.fillStyle = '#c98b4f'; ctx.fillRect(px, py, TILE, 5); ctx.strokeRect(px, py, TILE, 5);
        ctx.beginPath(); ctx.moveTo(px + 4, py + 5); ctx.lineTo(px + 6, py + 9); ctx.moveTo(px + 12, py + 5); ctx.lineTo(px + 10, py + 9); ctx.stroke();
      } else if (t === SPIKE) {
        ctx.fillStyle = '#dfe6f0';
        ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(px + i * 5.3 + 0.5, py + TILE); ctx.lineTo(px + i * 5.3 + 3, py + 8); ctx.lineTo(px + i * 5.3 + 5.5, py + TILE); }
        ctx.fill(); ctx.stroke();
      } else if (t === SPRING) {
        ctx.fillStyle = th.dirt; ctx.fillRect(px, py + 6, TILE, TILE - 6);
        const since = this.t - (this.springT[(px + 8) + ',' + py] ?? -9), comp = since < 0.25 ? Math.sin(since / 0.25 * Math.PI) : 0;
        const top = py - 3 - comp * 6 + (since < 0.08 ? 3 : 0);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = 0; i <= 4; i++) { const yy = py + 6 - (py + 6 - top) * i / 4; ctx.lineTo(px + (i % 2 ? 4 : 12), yy); }
        ctx.stroke(); ctx.strokeStyle = th.line; ctx.lineWidth = 1.2;
        ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.roundRect(px + 1, top - 3, 14, 4, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.roundRect(px + 1, py + 6, 14, 5, 1.5); ctx.fill(); ctx.stroke();
      }
    }
  }

  drawGoalAndFlags(world, th) {
    const { ctx } = this;
    ctx.strokeStyle = th.line; ctx.lineWidth = 1.2;
    for (const c of world.checkpoints) {
      const x = c.x + 5, y = c.y + TILE;
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(x, y - 22, 2, 22); ctx.strokeRect(x, y - 22, 2, 22);
      const wave = Math.sin(this.t * 6 + c.x) * 1.5;
      ctx.fillStyle = c.on ? '#5ccf5f' : '#d8d8d8';
      ctx.beginPath(); ctx.moveTo(x + 2, y - 22); ctx.quadraticCurveTo(x + 7, y - 21 + wave, x + 12, y - 18 + wave); ctx.lineTo(x + 2, y - 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (world.goal) {
      const x = world.goal.x + 4, y = world.goal.y + TILE;
      ctx.fillStyle = '#e8e8f0'; ctx.fillRect(x, y - 34, 2.5, 34); ctx.strokeRect(x, y - 34, 2.5, 34);
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(x + 1.25, y - 35, 2.5, 0, TAU); ctx.fill(); ctx.stroke();
      const wave = Math.sin(this.t * 5) * 2;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#222' : '#fff';
        ctx.fillRect(x + 2.5 + i * 4, y - 33 + j * 4 + wave * (i / 3), 4, 4);
      }
      ctx.strokeRect(x + 2.5, y - 33, 12, 8 + wave);
      ctx.fillStyle = '#b48a5a'; ctx.beginPath(); ctx.roundRect(x - 4, y - 3, 11, 3, 1); ctx.fill(); ctx.stroke();
    }
  }

  drawTrap(world, t, th) {
    const { ctx } = this, C = TRAPS[t.kind];
    const x = t.x0 * TILE, w = (t.x1 - t.x0 + 1) * TILE, y = t.y * TILE;
    const warn = t.state === 'warn', wk = warn ? t.t / C.warn : 0;
    const jig = warn ? Math.sin(this.t * 80) * 0.8 : 0;
    ctx.strokeStyle = th.line; ctx.lineWidth = 1.2;
    if (t.kind === 'spikes') {
      let h = 0;
      if (warn) h = 2 + wk * 1.5; else if (t.state === 'active') h = Math.min(1, t.t / 0.05) * 9; else if (t.state === 'recover') h = 9 * (1 - t.t / 0.15);
      ctx.fillStyle = '#6b6f80';
      for (let i = 0; i < w / 4; i++) ctx.fillRect(x + i * 4 + 1, y + TILE - 1.2, 2, 1.2);
      if (h > 0.2) {
        ctx.fillStyle = '#e9eef6';
        ctx.beginPath();
        for (let i = 0; i < w / 4; i++) { const bx = x + i * 4 + jig * 0.3; ctx.moveTo(bx, y + TILE); ctx.lineTo(bx + 2, y + TILE - h); ctx.lineTo(bx + 4, y + TILE); }
        ctx.fill(); ctx.stroke();
      }
    } else if (t.kind === 'trapdoor') {
      const open = t.state === 'active' || t.state === 'recover';
      if (!open) {
        ctx.fillStyle = warn ? '#d9a066' : '#c98b4f';
        ctx.beginPath(); ctx.rect(x + jig, y, w, 6); ctx.fill(); ctx.stroke();
        for (let i = 1; i < w / 8; i++) { ctx.beginPath(); ctx.moveTo(x + i * 8 + jig, y); ctx.lineTo(x + i * 8 + jig, y + 6); ctx.stroke(); }
        ctx.fillStyle = '#6b6f80'; ctx.fillRect(x + 1, y + 1.5, 2, 3); ctx.fillRect(x + w - 3, y + 1.5, 2, 3);
        ctx.strokeStyle = '#00000033'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x + w / 2 + jig, y); ctx.lineTo(x + w / 2 + jig, y + 6); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const sw = Math.min(1, t.t / 0.12);
        ctx.fillStyle = '#c98b4f';
        ctx.save(); ctx.translate(x, y); ctx.rotate(sw * Math.PI / 2); ctx.beginPath(); ctx.rect(0, 0, w / 2, 6); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.translate(x + w, y); ctx.rotate(-sw * Math.PI / 2); ctx.beginPath(); ctx.rect(-w / 2, 0, w / 2, 6); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    } else if (t.kind === 'cannon') {
      const recoil = t.state === 'idle' && t.cd > C.cd - 0.15 ? 2 : 0;
      ctx.fillStyle = '#5d6475'; ctx.beginPath(); ctx.roundRect(x + 1, y + 6, 14, 10, 2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(x + 8 - t.dir * recoil, y + 8); ctx.scale(t.dir, 1);
      ctx.fillStyle = '#2f3340'; ctx.beginPath(); ctx.roundRect(-5, -5, 13, 9, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = warn ? `rgba(255,${120 - wk * 100},40,1)` : '#111'; ctx.beginPath(); ctx.ellipse(8, -0.5, 1.6, 3.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(x + 8 - t.dir * 5, y + 4, 1, 0, TAU); ctx.fill();
    } else if (t.kind === 'crusher') {
      const oy = t.oy, cy = y + oy;
      ctx.strokeStyle = '#6b6f80'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 1.5]);
      ctx.beginPath(); ctx.moveTo(x + 4, y - 2); ctx.lineTo(x + 4, cy); ctx.moveTo(x + w - 4, y - 2); ctx.lineTo(x + w - 4, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = th.line;
      ctx.fillStyle = '#9aa3b5'; ctx.beginPath(); ctx.roundRect(x + 1 + jig, cy, w - 2, TILE, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7d8699'; ctx.fillRect(x + 3 + jig, cy + TILE - 4, w - 6, 2);
      // angry face
      const mad = warn || t.state === 'active', ex = x + w / 2 + jig;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex - 5, cy + 7, 2.6, mad ? 3 : 2, 0, 0, TAU); ctx.ellipse(ex + 5, cy + 7, 2.6, mad ? 3 : 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex - 4.5, cy + 7.5, 1.2, 0, TAU); ctx.arc(ex + 4.5, cy + 7.5, 1.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 8, cy + (mad ? 3 : 4)); ctx.lineTo(ex - 2.5, cy + 5); ctx.moveTo(ex + 8, cy + (mad ? 3 : 4)); ctx.lineTo(ex + 2.5, cy + 5); ctx.stroke();
    } else if (t.kind === 'flame') {
      ctx.fillStyle = '#5d6475'; ctx.fillRect(x, y, w, TILE); ctx.strokeRect(x, y, w, TILE);
      ctx.fillStyle = '#2f3340'; ctx.beginPath(); ctx.roundRect(x + 3, y - 2, w - 6, 5, 1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x + 4, y + 7, w - 8, 2);
      if (warn) for (let i = 0; i < 3; i++) { const k = (this.t * 3 + i / 3) % 1; ctx.fillStyle = `rgba(80,80,90,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + 8 + Math.sin(i * 3 + this.t * 5) * 2, y - 3 - k * 10, 2 + k * 3, 0, TAU); ctx.fill(); }
      if (t.state === 'active' && t.reach) {
        const H = t.reach * TILE, grow = Math.min(1, t.t / 0.08), fade = Math.min(1, (C.active - t.t) / 0.1);
        const hh = H * grow * fade;
        for (const [col, wid] of [['#ff5a2a', 1], ['#ff9a3c', 0.7], ['#ffe066', 0.38]]) {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + 8 - 6 * wid, y);
          for (let i = 0; i <= 6; i++) { const yy = y - hh * i / 6; ctx.lineTo(x + 8 - (6 - i * 0.6) * wid + Math.sin(this.t * 30 + i * 2) * 1.2, yy); }
          ctx.lineTo(x + 8, y - hh - 4 * wid);
          for (let i = 6; i >= 0; i--) { const yy = y - hh * i / 6; ctx.lineTo(x + 8 + (6 - i * 0.6) * wid + Math.sin(this.t * 27 + i * 3) * 1.2, yy); }
          ctx.fill();
        }
      }
    }
  }

  drawBall(b, th) {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.arc(b.x - Math.sign(b.vx) * 6, b.y, 3, 0, TAU); ctx.arc(b.x - Math.sign(b.vx) * 10, b.y, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#23262f'; ctx.strokeStyle = th.line; ctx.beginPath(); ctx.arc(b.x, b.y, 4.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff88'; ctx.beginPath(); ctx.arc(b.x - 1.3, b.y - 1.3, 1.2, 0, TAU); ctx.fill();
  }

  drawPlayer(p, col, th, dt) {
    const { ctx } = this;
    this.squash = Math.max(0, this.squash - dt * 1.5);
    const run = p.onGround && Math.abs(p.vx) > 10;
    const stretch = p.onGround ? -this.squash : Math.max(-0.15, Math.min(0.22, -p.vy / 1800));
    const sx = 1 - stretch * 0.6, sy = 1 + stretch;
    const cx = p.x + PHYS.w / 2, by = p.y + PHYS.h;
    const bob = run ? Math.abs(Math.sin(this.t * 18)) * 1.2 : Math.sin(this.t * 3) * 0.3;
    ctx.save(); ctx.translate(cx, by); ctx.scale(sx, sy);
    ctx.strokeStyle = th.line; ctx.lineWidth = 1.2;
    // feet
    const step = run ? Math.sin(this.t * 18) * 2.5 : 0;
    ctx.fillStyle = col.dark;
    if (p.onGround) { ctx.beginPath(); ctx.ellipse(-3 + step, -1, 2.3, 1.5, 0, 0, TAU); ctx.ellipse(3 - step, -1, 2.3, 1.5, 0, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(-3, -0.5, 2, 1.8, 0, 0, TAU); ctx.ellipse(3, -1.5, 2, 1.8, 0, 0, TAU); ctx.fill(); }
    ctx.translate(0, -bob);
    // leaves
    const sway = Math.sin(this.t * 4) * 0.15 - p.vx / 900;
    ctx.fillStyle = col.leaf;
    for (const [a, l] of [[-0.5, 7], [0.1, 9], [0.65, 6.5]]) {
      ctx.save(); ctx.translate(0, -13); ctx.rotate(a + sway); ctx.beginPath(); ctx.ellipse(0, -l / 2, 2.3, l / 2, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // body
    ctx.fillStyle = col.body;
    ctx.beginPath(); ctx.moveTo(0, -14.5);
    ctx.bezierCurveTo(7.5, -14.5, 9, -7, 7, -3.5); ctx.bezierCurveTo(5.5, -1, 2.5, -0.5, 0, -0.5);
    ctx.bezierCurveTo(-2.5, -0.5, -5.5, -1, -7, -3.5); ctx.bezierCurveTo(-9, -7, -7.5, -14.5, 0, -14.5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.ellipse(-3.8, -10.5, 1.4, 2.2, -0.4, 0, TAU); ctx.fill();
    // face
    this.blink -= dt; if (this.blink < -0.12) this.blink = 2 + Math.random() * 3;
    const f = p.face, eyeY = -8.5, closed = this.blink < 0;
    for (const ex of [-2.2, 2.2]) {
      const x = ex + f * 1.6;
      if (closed) { ctx.beginPath(); ctx.moveTo(x - 1.4, eyeY); ctx.lineTo(x + 1.4, eyeY); ctx.stroke(); continue; }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, eyeY, 1.7, 2.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b1320'; ctx.beginPath(); ctx.arc(x + f * 0.6, eyeY + (p.vy > 50 ? 0.6 : 0), 1, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#ff8fb066'; ctx.beginPath(); ctx.arc(-4 + f * 1.5, -5.3, 1.2, 0, TAU); ctx.arc(4 + f * 1.5, -5.3, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = '#1b1320'; ctx.lineWidth = 0.8;
    if (!p.onGround && p.vy > 120) ctx.arc(f * 1.6, -4.6, 1, 0, TAU); else ctx.arc(f * 1.6, -5.6, 1.4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(dt) {
    const { ctx } = this;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt; if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.color; ctx.globalAlpha = Math.min(1, q.life * 3);
      if (q.spin) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.life * 8); ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size / 2, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // Trapper: a round button over every trap, filling up while it cools down.
  trapButton(world, t) {
    const x = (t.x0 + t.x1 + 1) * TILE / 2;
    let y = t.y * TILE - 12;
    if (t.kind === 'crusher') y = t.y * TILE + 8;
    if (t.kind === 'trapdoor') y = t.y * TILE + 16;
    if (t.kind === 'cannon') y = t.y * TILE - 10;
    if (t.kind === 'flame') y = t.y * TILE + 9;
    return { x, y, r: 7 };
  }

  drawTrapButtons(world, o, th, mini) {
    const { ctx } = this;
    for (const t of world.traps) {
      const b = this.trapButton(world, t), C = TRAPS[t.kind];
      if (b.x < this.cam.x - 20 || b.x > this.cam.x + this.vwW + 20 || b.y < this.cam.y - 20 || b.y > this.cam.y + this.vhW + 20) continue;
      const ready = t.state === 'idle' && t.cd <= 0, hover = o.hover === t.id, pend = o.pending && o.pending[t.id] > 0;
      const blocked = ready && world.lock > 0;
      const pulse = ready && !blocked ? 1 + Math.sin(this.t * 6) * 0.06 : 1;
      if (mini) {   // the runner sees a small cooldown dial too, so they can time their dash
        if (ready) continue;
        ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#3b3f52'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9ff0a0'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - t.cd / C.cd)); ctx.closePath(); ctx.fill();
        ctx.restore(); continue;
      }
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(pulse * (hover ? 1.15 : 1), pulse * (hover ? 1.15 : 1));
      ctx.globalAlpha = ready ? 0.95 : 0.8;
      ctx.fillStyle = ready ? (blocked ? '#ffb070' : '#ff4d6d') : '#3b3f52';
      ctx.strokeStyle = '#1b1320'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      if (!ready && t.cd > 0) {
        ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, b.r - 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - t.cd / C.cd)); ctx.closePath(); ctx.fill();
      }
      if (pend) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, b.r + 2, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = '700 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ready ? TRAP_ICON[t.kind] : (t.cd > 0 ? Math.ceil(t.cd) : '…'), 0, 0.5);
      ctx.restore();
    }
  }
}

// Pixel-art renderer. The world is drawn 1:1 onto a small canvas (1 canvas pixel = 1 world pixel),
// which is then scaled up by a whole number with smoothing off, so every pixel stays crisp.
import { TILE, PHYS, TRAPS, GADGETS } from './config.js';
import { SOLID, ONEWAY, SPIKE, SPRING, NOZZLE, TURRET, FAN, CEILSPIKE } from './sim.js';
import { THEMES } from './levels.js';
import { SPR, initSprites, charFrame, mirror, drawDigits } from './sprites.js';

const TAU = Math.PI * 2;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FIRE = ['#c22b3b', '#ff5a2a', '#ff9a3c', '#ffd84a', '#fff6c8'];

export class Renderer {
  constructor(canvas) {
    initSprites();
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.lo = canvasOf(320, 180); this.l = this.lo.getContext('2d');
    this.cam = { x: 0, y: 0 }; this.k = 3; this.parts = []; this.shake = 0; this.t = 0; this.springT = {};
    this.levelCache = null; this.bgCache = {}; this.anim = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr; this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.c.width = Math.round(this.vw * dpr); this.c.height = Math.round(this.vh * dpr);
    this.c.style.width = this.vw + 'px'; this.c.style.height = this.vh + 'px';
    this.wide = null;
  }

  // Whole-number zoom so about 15 tiles fit vertically (17 for the trapper), keeping at least ~13 across.
  setZoom(wide) {
    if (this.wide === wide) return;
    this.wide = wide;
    const W = this.c.width, H = this.c.height;
    let k = Math.round(H / (TILE * (wide ? 17 : 15)));
    k = Math.max(1, Math.min(k, Math.floor(W / (TILE * 13))));
    this.k = k;
    this.lo.width = Math.ceil(W / k); this.lo.height = Math.ceil(H / k);
    this.l = this.lo.getContext('2d'); this.l.imageSmoothingEnabled = false;
    this.bgCache = {};
  }

  // raise: keep the runner higher on screen (the trapper's bar covers the bottom).
  follow(world, dt, wide, snap, raise) {
    this.setZoom(!!wide);
    const p = world.player, vw = this.lo.width, vh = this.lo.height;
    this.lookX = (this.lookX ?? 0) + ((p.face * 36 + p.vx * 0.25) - (this.lookX ?? 0)) * Math.min(1, dt * 3);
    let tx = p.x + PHYS.w / 2 + this.lookX - vw / 2, ty = p.y + PHYS.h / 2 - vh * (raise ? 0.42 : 0.55);
    const W = world.w * TILE, H = world.h * TILE;
    tx = vw >= W ? (W - vw) / 2 : Math.max(0, Math.min(W - vw, tx));
    const pad = raise ? (this.bottomPad || 0) : 0;   // room under the level for the trapper's bar
    ty = vh >= H + pad ? H + pad - vh : Math.max(0, Math.min(H + pad - vh, ty));
    const k = snap ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * (snap ? 1 : k * 0.8);
  }

  get camX() { return Math.round(this.cam.x); }
  get camY() { return Math.round(this.cam.y); }
  toWorld(cx, cy) { return { x: cx * this.dpr / this.k + this.camX, y: cy * this.dpr / this.k + this.camY }; }

  // ---------- events -> particles
  onEvent([k, x, y, extra], ch) {
    const P = (n, f) => { for (let i = 0; i < n; i++) this.parts.push(f(i)); };
    const dust = (n, sp = 40, col = '#ffffffdd') => P(n, () => ({ x, y: y - 1, vx: (Math.random() - 0.5) * sp * 2, vy: -Math.random() * sp * 0.5, life: 0.3 + Math.random() * 0.25, size: Math.random() < 0.3 ? 2 : 1, color: col, g: 40 }));
    const pal = ch.pal || {};
    if (k === 'jump') dust(5, 30);
    if (k === 'land') dust(3 + Math.round(extra * 6), 50);
    if (k === 'die') {
      this.shake = 0.3;
      const cols = [pal.A, pal.a, pal.B, ch.ui, '#ffffff'].filter(Boolean);
      P(22, () => { const a = Math.random() * TAU, v = 50 + Math.random() * 140; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, life: 0.6 + Math.random() * 0.5, size: Math.random() < 0.4 ? 2 : 1, color: cols[Math.floor(Math.random() * cols.length)], g: 480 }; });
      P(8, i => { const a = i / 8 * TAU; return { x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.3, size: 2, color: '#ffffff', g: 0 }; });
    }
    if (k === 'spawn') P(12, i => { const a = i / 12 * TAU; return { x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, vx: -Math.cos(a) * 45, vy: -Math.sin(a) * 45, life: 0.3, size: 1, color: '#ffffff', g: 0 }; });
    if (k === 'cp' || k === 'goal') P(k === 'goal' ? 60 : 24, () => ({ x, y: y - 10, vx: (Math.random() - 0.5) * 150, vy: -70 - Math.random() * 140, life: 1 + Math.random() * 0.7, size: Math.random() < 0.5 ? 2 : 1, color: ['#ff5d8f', '#ffd84a', '#5ab4ff', '#7bd65a', '#b48cff', '#ffffff'][Math.floor(Math.random() * 6)], g: 260, flicker: true }));
    if (k === 'poof') P(7, () => ({ x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.35, size: 2, color: '#9aa3b5', g: -20 }));
    if (k === 'thud') { this.shake = Math.max(this.shake, 0.18); dust(12, 80, '#d8d2c8'); }
    if (k === 'fire' && extra === 'cannon') { this.shake = Math.max(this.shake, 0.05); P(6, () => ({ x, y: y + 7, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40, life: 0.35, size: 2, color: '#c8c8d0', g: -20 })); }
    if (k === 'spring') this.springT[x + ',' + y] = this.t;
    if (k === 'airjump') P(8, i => ({ x: x + (i - 3.5) * 2, y, vx: (i - 3.5) * 12, vy: 30, life: 0.3, size: 1, color: '#ffffff', g: 0 }));
    if (k === 'zap') { this.shake = Math.max(this.shake, 0.2); this.flash = 0.12; }
    if (k === 'stun') P(10, () => ({ x, y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, life: 0.4, size: 1, color: '#ffd84a', g: 100 }));
    if (k === 'block') P(16, i => { const a = i / 16 * TAU; return { x: x + Math.cos(a) * 11, y: y + Math.sin(a) * 11, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.35, size: 1, color: '#8fe8ff', g: 0 }; });
    if (k === 'gadget' && extra === 'dash') dust(6, 40);
    if (k === 'gadget' && extra === 'jam') P(20, () => ({ x, y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.4, size: 1, color: '#6ff7ff', g: 0 }));
    if (k === 'gadget' && extra === 'glue') P(10, () => ({ x, y: y - 2, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60, life: 0.4, size: 2, color: '#56c24e', g: 300 }));
  }

  draw(world, o) {
    const dt = o.dt;
    this.t += dt; this.shake = Math.max(0, this.shake - dt);
    const th = THEMES[world.level.theme] || THEMES.day;
    const l = this.l, s = this.shake > 0 ? this.shake * 12 : 0;
    const cx = this.camX + Math.round((Math.random() - 0.5) * s), cy = this.camY + Math.round((Math.random() - 0.5) * s);
    this.drawBackground(world, th, cx, cy);
    l.save(); l.translate(-cx, -cy);
    l.drawImage(this.levelCanvas(world, th), 0, 0);
    const below = cy + this.lo.height - world.h * TILE;
    if (below > 0) {   // under the level (only the trapper's camera goes here): solid earth
      l.fillStyle = th.dirt[0]; l.fillRect(cx, world.h * TILE, this.lo.width, below);
      l.fillStyle = th.dirt[1]; for (let x = Math.floor(cx / 4) * 4; x < cx + this.lo.width; x += 4) l.fillRect(x, world.h * TILE + ((x / 4) % 3), 2, 1);
    }
    this.drawProps(world);
    for (const t of world.traps) this.drawTrap(t, th);
    this.drawGlue(world);
    for (const b of world.shots) {
      if (b.kind === 'arrows') { l.drawImage(b.vx > 0 ? SPR.arrow : mirror(SPR.arrow, 'arrowL'), Math.round(b.x) - 5, Math.round(b.y) - 1); continue; }
      l.drawImage(SPR.ball, Math.round(b.x) - 4, Math.round(b.y) - 4);
      l.fillStyle = '#ffffff88'; l.fillRect(Math.round(b.x - Math.sign(b.vx) * (7 + (Math.floor(this.t * 20) % 2) * 3)), Math.round(b.y) - 1, 2, 2);
    }
    if (!world.player.dead) this.drawPlayer(world.player, o.colors, dt);
    this.drawBolts(world);
    if (o.aim) this.drawAim(world, o.aim);
    this.drawParticles(dt);
    this.drawTrapButtons(world, o, !o.trapper);
    if (o.debug) { l.strokeStyle = 'red'; l.lineWidth = 1; for (const d of world.dangers()) l.strokeRect(Math.round(d.x) + 0.5, Math.round(d.y) + 0.5, d.w - 1, d.h - 1); }
    l.restore();
    if (this.flash > 0) { this.flash -= dt; l.fillStyle = '#ffffff55'; l.fillRect(0, 0, this.lo.width, this.lo.height); }
    const ctx = this.ctx; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.lo, 0, 0, this.lo.width * this.k, this.lo.height * this.k);
  }

  // ---------- background: dithered sky, far layer, near layer, clouds
  bg(key, make) { return this.bgCache[key] || (this.bgCache[key] = make()); }

  drawBackground(world, th, cx, cy) {
    const l = this.l, W = this.lo.width, H = this.lo.height, theme = world.level.theme;
    l.drawImage(this.bg('sky' + theme, () => {
      const c = canvasOf(W, H), x = c.getContext('2d'), n = th.sky.length;
      for (let y = 0; y < H; y++) {
        const f = y / H * (n - 1), i = Math.min(n - 2, Math.floor(f)), frac = f - i;
        for (let xx = 0; xx < W; xx++) {
          x.fillStyle = frac > (BAYER[(y % 4) * 4 + (xx % 4)] + 0.5) / 16 ? th.sky[i + 1] : th.sky[i];
          x.fillRect(xx, y, 1, 1);
        }
      }
      return c;
    }), 0, 0);
    if (th.stars) {
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(((hash(i, 1) * 900 - cx * 0.05) % W + W) % W), y = Math.floor(hash(i, 2) * H * 0.65);
        const tw = Math.sin(this.t * (1 + hash(i, 4) * 2) + i) > 0.2;
        l.fillStyle = tw ? '#ffffff' : '#8f95d6'; l.fillRect(x, y, 1, 1);
        if (hash(i, 3) > 0.88 && tw) { l.fillStyle = '#ffffff66'; l.fillRect(x - 1, y, 3, 1); l.fillRect(x, y - 1, 1, 3); }
      }
      l.drawImage(this.bg('moon', () => {
        const c = canvasOf(22, 22), x = c.getContext('2d');
        for (let j = 0; j < 22; j++) for (let i = 0; i < 22; i++) {
          const d = Math.hypot(i - 10.5, j - 10.5); if (d >= 10) continue;
          const crater = Math.hypot(i - 7, j - 8) < 2.2 || Math.hypot(i - 13, j - 13) < 1.6 || Math.hypot(i - 14, j - 6) < 1.2;
          x.fillStyle = d > 8.6 ? '#e8d9a8' : crater ? '#e3d39c' : '#fff6d0'; x.fillRect(i, j, 1, 1);
        }
        return c;
      }), Math.round(W * 0.78 - cx * 0.02), Math.round(H * 0.1));
    }
    for (let i = 0; i < 6; i++) {
      const cl = this.cloudSprite(th, i % 3), span = W + cl.width + 40;
      const x = Math.round((((hash(i, 7) * span - cx * 0.12 + this.t * (3 + hash(i, 9) * 4)) % span) + span) % span - cl.width - 20);
      l.drawImage(cl, x, Math.round(hash(i, 8) * H * 0.35 + 6 - cy * 0.04));
    }
    const bottom = world.h * TILE;
    const layer = (name, par, lift) => {
      const img = this.bg(name + theme, () => this.makeLayer(th, name));
      const y = Math.round((bottom - lift - img.height - cy) * par + (H - img.height) * (1 - par));
      const off = Math.round(((cx * par) % img.width + img.width) % img.width);
      for (let x = -off; x < W; x += img.width) l.drawImage(img, x, y);
      if (y + img.height < H) { l.fillStyle = img.bottomColor; l.fillRect(0, y + img.height, W, H - y - img.height); }
    };
    layer(th.far, 0.2, 30);
    layer(th.near, 0.45, 10);
  }

  cloudSprite(th, v) {
    return this.bg('cloud' + v + th.cloud[0], () => {
      const w = [44, 30, 58][v], h = [16, 12, 20][v], c = canvasOf(w, h), x = c.getContext('2d');
      const blobs = [[0.25, 0.65, 0.3], [0.5, 0.45, 0.42], [0.75, 0.65, 0.3], [0.38, 0.6, 0.35], [0.62, 0.62, 0.34]];
      const inside = (i, j) => j < h - 1 && blobs.some(([bx, by, r]) => Math.hypot((i - bx * w) / w * 2.2, (j - by * h) / h) < r * 1.05);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inside(i, j)) { x.fillStyle = !inside(i, j + 2) || j > h * 0.72 ? th.cloud[1] : th.cloud[0]; x.fillRect(i, j, 1, 1); }
      return c;
    });
  }

  makeLayer(th, name) {
    const W = 480, H = name === 'mountains' ? 130 : name.startsWith('clouds') ? 70 : 90;
    const c = canvasOf(W, H), x = c.getContext('2d');
    const [base, light, top] = name === 'mountains' || name === 'clouds' ? th.farCol : th.nearCol;
    const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    if (name === 'mountains') {
      const peaks = [[40, 70], [120, 22], [190, 60], [262, 12], [340, 52], [410, 30]];
      const hAt = i => { let best = H; for (const [p, py] of peaks) for (const pp of [p, p - W, p + W]) best = Math.min(best, py + Math.abs(i - pp) * 0.9); return best; };
      for (let i = 0; i < W; i++) {
        const h0 = Math.round(hAt(i)), lit = hAt(i - 1) > hAt(i);   // slopes facing left catch the light
        for (let j = h0; j < H; j++) {
          let col = base;
          if (lit && hash(i, j) > (j - h0) / 46) col = light;
          if (h0 < 36 && j < h0 + 5 + Math.round(hash(i, 1) * 3)) col = top;
          px(i, j, col);
        }
      }
    } else if (name === 'trees' || name === 'pines') {
      const ground = H - 18;
      for (let i = 0; i < W; i++) { const b = Math.round(Math.sin(i / W * TAU * 4) * 3 + Math.sin(i / W * TAU * 11) * 1.5); x.fillStyle = base; x.fillRect(i, ground - 3 + b, 1, H); px(i, ground - 3 + b, light); }
      for (let n = 0; n < 18; n++) {
        const tx = Math.floor(hash(n, 11) * W), s = 0.7 + hash(n, 12) * 0.6;
        for (const ox of [0, -W, W]) {
          const cx0 = tx + ox;
          if (name === 'trees') {
            const r = Math.round(11 * s), cyy = ground - Math.round(16 * s);
            x.fillStyle = top; x.fillRect(cx0 - 1, cyy, 3, ground - cyy + 2);
            for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
              const d = Math.hypot(i, j * 1.1) + (hash(cx0 + i, j) - 0.5) * 2.5;
              if (d < r && cx0 + i >= 0 && cx0 + i < W) px(cx0 + i, cyy + j, i + j < -r * 0.5 && d > r * 0.35 ? light : d > r - 1.3 ? top : base);
            }
          } else {
            const hh = Math.round(36 * s), w0 = Math.round(10 * s);
            for (let j = 0; j < hh; j++) {
              const half = Math.round((j / hh) * w0 + ((j % 7) > 4 ? 1 : 0));
              for (let i = -half; i <= half; i++) if (cx0 + i >= 0 && cx0 + i < W) px(cx0 + i, ground - hh + j, i < 0 && i > -half ? light : i === half ? top : base);
            }
            x.fillStyle = top; x.fillRect(cx0 - 1, ground, 3, 3);
          }
        }
      }
    } else {   // cloud banks for the sky level
      const yb = name === 'clouds' ? 34 : 44;
      for (let i = 0; i < W; i++) {
        const h0 = Math.round(yb - (Math.abs(Math.sin(i / W * TAU * 6)) * 14 + Math.abs(Math.sin(i / W * TAU * 15 + 1)) * 6));
        for (let j = h0; j < H; j++) px(i, j, j < h0 + 2 ? light : j > H - 10 && hash(i, j) < (j - H + 10) / 10 ? top : base);
      }
    }
    const d = x.getImageData(0, H - 1, 1, 1).data; c.bottomColor = `rgb(${d[0]},${d[1]},${d[2]})`;
    return c;
  }

  // ---------- static tiles, painted once per level
  levelCanvas(world, th) {
    if (this.levelCache && this.levelCache.world === world) return this.levelCache.c;
    const c = canvasOf(world.w * TILE, world.h * TILE), x = c.getContext('2d');
    const isGround = (i, j) => { const t = world.tile(i, j); return t === SOLID || t === NOZZLE || t === SPRING || t === FAN; };
    const D = th.dirt, G = th.grass, line = th.line;
    const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      const t = world.tile(tx, ty), X = tx * TILE, Y = ty * TILE;
      if (t === SOLID || t === SPRING) {
        let depth = 0; while (depth < 4 && isGround(tx, ty - depth - 1)) depth++;
        // dirt: 2x2 clumps of shade, a few specks, and a dithered fade to the darker deep soil
        for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
          const gy = depth * 16 + j, deep = gy > 22 + (BAYER[(j % 4) * 4 + (i % 4)] / 16) * 12;
          const n = hash((X + i) >> 1, (Y + j) >> 1), m = hash(X + i, Y + j);
          let col = deep ? D[1] : D[2];
          if (n < 0.1) col = deep ? D[0] : D[1];
          else if (n > 0.93 && !deep) col = D[3];
          if (m < 0.025) col = D[0];
          px(X + i, Y + j, col);
        }
        if (hash(tx, ty * 3) < 0.4) {   // pebble
          const sx = X + 2 + Math.floor(hash(tx, ty) * 10), sy = Y + 4 + Math.floor(hash(ty, tx) * 9);
          x.fillStyle = D[0]; x.fillRect(sx, sy + 1, 4, 2); x.fillStyle = D[3]; x.fillRect(sx, sy, 3, 1); x.fillRect(sx, sy + 1, 1, 1);
        }
        const L = tx > 0 && !isGround(tx - 1, ty), R = tx < world.w - 1 && !isGround(tx + 1, ty), B = ty < world.h - 1 && !isGround(tx, ty + 1);
        x.fillStyle = D[0];
        if (L) x.fillRect(X + 1, Y, 1, 16); if (R) x.fillRect(X + 14, Y, 1, 16); if (B) x.fillRect(X, Y + 14, 16, 1);
        x.fillStyle = line;
        if (L) x.fillRect(X, Y, 1, 16); if (R) x.fillRect(X + 15, Y, 1, 16); if (B) x.fillRect(X, Y + 15, 16, 1);
      } else if (t === ONEWAY) x.drawImage(SPR.oneway, X, Y);
      else if (t === SPIKE) x.drawImage(SPR.spike, X, Y);
      else if (t === CEILSPIKE) { x.save(); x.translate(X, Y + 16); x.scale(1, -1); x.drawImage(SPR.spike, 0, 0); x.restore(); }
      else if (t === NOZZLE) x.drawImage(SPR.nozzle, X, Y);
      else if (t === FAN) x.drawImage(SPR.fan, X, Y);
      else if (t === TURRET) { /* drawn with its trap */ }
    }
    // grass caps on exposed tops; blades poke a little into the tile above
    for (let ty = 1; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      if (world.tile(tx, ty) !== SOLID) continue;
      const above = world.tile(tx, ty - 1);
      if (above === SOLID || above === NOZZLE || above === SPRING || above === FAN) continue;
      const X = tx * TILE, Y = ty * TILE, L = !isGround(tx - 1, ty), R = !isGround(tx + 1, ty);
      for (let i = 0; i < 16; i++) {
        const gx = X + i, tip = hash(gx, 7) < 0.3 ? 2 : hash(gx, 8) < 0.5 ? 1 : 0, depth = 4 + Math.floor(hash(gx, 9) * 3);
        const edge = (L && i === 0) || (R && i === 15), top = Y - tip;
        px(gx, top - 1, line);
        for (let j = top; j < Y + depth; j++) {
          let col = j <= Y ? G[2] : G[1];
          if (j === top && tip) col = G[3];
          if (j === Y + depth - 1) col = G[0];
          if (j === Y + 1 && hash(gx, 3) < 0.25) col = G[2];
          px(gx, j, edge ? line : col);
        }
        if (edge) px(gx, Y + depth, line);
        if (!edge && i > 1 && i < 14 && hash(gx, 21) < 0.07) { px(gx, Y - 3, hash(gx, 22) < 0.5 ? '#ffffff' : '#ffd84a'); px(gx, Y - 2, G[0]); }
      }
    }
    this.levelCache = { world, c };
    return c;
  }

  drawProps(world) {
    const l = this.l, f = Math.floor(this.t * 4) % 2;
    for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      if (world.tile(tx, ty) !== SPRING) continue;
      const X = tx * TILE, Y = ty * TILE, since = this.t - (this.springT[(X + 8) + ',' + Y] ?? -9);
      l.drawImage(since < 0.18 ? SPR.spring1 : SPR.spring0, X, Y);
    }
    for (const c of world.checkpoints) l.drawImage(SPR[(c.on ? 'flagOn' : 'flagOff') + f], c.x + 4, c.y + TILE - 23);
    if (world.goal) l.drawImage(SPR['goal' + f], world.goal.x + 3, world.goal.y + TILE - 36);
  }

  drawTrap(t, th) {
    const l = this.l, C = TRAPS[t.kind];
    const x = t.x0 * TILE, w = (t.x1 - t.x0 + 1) * TILE, y = t.y * TILE;
    const warn = t.state === 'warn', jig = warn ? (Math.floor(this.t * 30) % 2 ? 1 : -1) : 0;
    if (t.kind === 'spikes') {
      let h = 0;
      if (warn) h = 2; else if (t.state === 'active') h = Math.min(10, Math.round(t.t / 0.04 * 10)); else if (t.state === 'recover') h = Math.round(10 * (1 - t.t / 0.15));
      for (let i = 0; i < w; i += 16) {
        if (h > 0) l.drawImage(SPR.popSpike, 0, 0, 16, h, x + i + jig, y + TILE - h - 1, 16, h);
        l.drawImage(SPR.slots, x + i, y + TILE - 2);
      }
    } else if (t.kind === 'trapdoor') {
      if (!(t.state === 'active' || t.state === 'recover')) { for (let i = 0; i < w; i += 16) l.drawImage(SPR.plank, x + i + jig, y); return; }
      const len = Math.round(w / 2 * Math.min(1, t.t / 0.1));
      for (const [hx, dir] of [[x, 1], [x + w - 6, -1]]) {
        l.fillStyle = th.line; l.fillRect(hx, y, 6, 6 + len);
        l.fillStyle = '#c98b4f'; l.fillRect(hx + 1, y + 1, 4, 4 + len);
        l.fillStyle = '#e0aa6e'; l.fillRect(hx + (dir > 0 ? 1 : 4), y + 1, 1, 4 + len);
        l.fillStyle = '#8a5a32'; for (let j = y + 8; j < y + 4 + len; j += 8) l.fillRect(hx + 1, j, 4, 1);
      }
    } else if (t.kind === 'cannon') {
      const recoil = t.state === 'idle' && t.cd > C.cd - 0.12 ? -t.dir : 0;
      l.drawImage(t.dir > 0 ? SPR.cannon : mirror(SPR.cannon, 'cannonL'), x + recoil, y);
      if (warn) { l.fillStyle = Math.floor(this.t * 20) % 2 ? '#ffd84a' : '#ff5a2a'; l.fillRect(t.dir > 0 ? x + 14 : x, y + 7, 2, 2); }
      if (t.state === 'idle' && t.cd > C.cd - 0.08) { l.fillStyle = '#fff6c8'; l.fillRect(t.dir > 0 ? x + 16 : x - 3, y + 6, 3, 4); }
    } else if (t.kind === 'crusher') {
      this.drawCrusher(t, x, w, y, warn, jig, th);
    } else if (t.kind === 'arrows') {
      const recoil = t.state === 'idle' && t.cd > C.cd - 0.1 ? -t.dir : 0;
      l.drawImage(t.dir > 0 ? SPR.turret : mirror(SPR.turret, 'turretL'), x + recoil, y);
      if (warn) { l.fillStyle = Math.floor(this.t * 30) % 2 ? '#ffd84a' : '#ffffff'; l.fillRect(t.dir > 0 ? x + 15 : x, y + 7, 1, 1); }
    } else if (t.kind === 'wall') {
      const up = t.state === 'active' ? Math.min(1, t.t / 0.08) : 0, h = Math.round(32 * up);
      if (warn) { l.fillStyle = '#9aa3b5'; for (let i = 0; i < 4; i++) l.fillRect(x + 2 + i * 4 + jig, y + 13 + (i % 2), 2, 1); }
      l.fillStyle = '#5d6475'; l.fillRect(x + 1, y + 14, 14, 2); l.fillStyle = th.line; l.fillRect(x + 1, y + 15, 14, 1);
      if (h > 0) {
        const top = y + 16 - h;
        l.fillStyle = th.line; l.fillRect(x + 1, top, 14, h);
        l.fillStyle = '#9aa3b5'; l.fillRect(x + 2, top + 1, 12, h - 2);
        l.fillStyle = '#c3c9d6'; l.fillRect(x + 2, top + 1, 12, 1);
        l.fillStyle = '#6b7285'; for (let j = top + 5; j < y + 15; j += 5) { l.fillRect(x + 2, j, 12, 1); l.fillRect(x + ((j / 5) % 2 ? 7 : 4), j - 4, 1, 4); }
        l.fillStyle = '#dfe6f0'; for (let i = x + 2; i < x + 14; i += 3) l.fillRect(i, top - 1, 2, 1);
      }
    } else if (t.kind === 'fan') {
      const spin = t.state === 'active' ? Math.floor(this.t * 30) % 2 : t.state === 'warn' ? Math.floor(this.t * 10) % 2 : 0;
      for (let i = 0; i < w; i += 16) { l.fillStyle = spin ? '#9aa3b5' : '#2f3340'; l.fillRect(x + i + 4, y + 4, 8, 1); }
      if (t.state === 'active' && t.reach && Math.random() < 0.8) this.parts.push({ x: x + 2 + Math.random() * (w - 4), y: y - 1, vx: 0, vy: -180 - Math.random() * 80, life: t.reach * TILE / 220, size: 1, color: '#ffffffaa', g: 0 });
    } else if (t.kind === 'flame') {
      if (warn) {
        for (let i = 0; i < 4; i++) { const k = (this.t * 2.5 + i / 4) % 1, s = k < 0.3 ? 1 : 2; l.fillStyle = k < 0.5 ? '#9aa3b5' : '#6b7285'; l.fillRect(x + 7 + Math.round(Math.sin(i * 3 + this.t * 6) * 2), y - 2 - Math.round(k * 12), s, s); }
        l.fillStyle = Math.floor(this.t * 16) % 2 ? '#ffd84a' : '#5d6475'; for (const ox of [3, 7, 11]) l.fillRect(x + ox, y + 3, 1, 1);
      }
      if (t.state === 'active' && t.reach) {
        const H = t.reach * TILE, hh = Math.round(H * Math.min(1, t.t / 0.08) * Math.min(1, (C.active - t.t) / 0.1)), fr = Math.floor(this.t * 20);
        for (let j = 0; j < hh + 4; j++) {
          const along = j / (hh + 4);
          const half = Math.max(0, Math.round(6 * (1 - along * 0.55) + Math.sin(j * 0.7 + fr) * 1.3 - (j > hh ? (j - hh) * 1.5 : 0)));
          for (let i = -half; i <= half; i++) {
            const e = Math.abs(i) / Math.max(1, half), n = hash(i + fr * 3, j + fr);
            l.fillStyle = FIRE[Math.max(0, Math.min(4, Math.round(4 - e * 3 - along * 1.6 + (n - 0.5) * 1.2)))];
            l.fillRect(x + 8 + i, y - 1 - j, 1, 1);
          }
        }
        if (Math.random() < 0.6) this.parts.push({ x: x + 8 + (Math.random() - 0.5) * 8, y: y - hh, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40, life: 0.3, size: 1, color: '#ffd84a', g: 0 });
      }
    }
  }

  drawCrusher(t, x, w, y, warn, jig, th) {
    const l = this.l, K = th.line, cy = y + Math.round(t.oy), X = x + jig;
    for (const cx of [x + 4, x + w - 6]) for (let j = y - 3; j < cy; j += 3) { l.fillStyle = '#5d6475'; l.fillRect(cx, j, 2, 2); l.fillStyle = '#9aa3b5'; l.fillRect(cx, j, 1, 1); }
    l.fillStyle = K; l.fillRect(X, cy, w, 16);
    l.fillStyle = '#8b93a6'; l.fillRect(X + 1, cy + 1, w - 2, 12);
    l.fillStyle = '#a7afc0'; l.fillRect(X + 1, cy + 1, w - 2, 1); l.fillRect(X + 1, cy + 1, 1, 11);
    l.fillStyle = '#6b7285'; l.fillRect(X + 1, cy + 12, w - 2, 1); l.fillRect(X + w - 2, cy + 2, 1, 10);
    for (let i = 0; i < w - 4; i += 7) { l.fillRect(X + i + 3, cy + (i % 14 ? 10 : 3), 2, 1); }
    l.fillStyle = '#dfe6f0';
    for (let i = 1; i < w - 1; i += 3) { l.fillRect(X + i, cy + 13, 2, 1); l.fillRect(X + i, cy + 14, 1, 1); }
    const mad = warn || t.state === 'active', mx = X + Math.floor(w / 2);
    for (const [ex, dir] of [[mx - 6, 1], [mx + 2, -1]]) {
      l.fillStyle = K; l.fillRect(ex, cy + 4, 4, mad ? 5 : 4);
      l.fillStyle = '#ffffff'; l.fillRect(ex + 1, cy + 5, 2, mad ? 3 : 2);
      l.fillStyle = mad ? '#e8414f' : K; l.fillRect(ex + (dir > 0 ? 2 : 1), cy + 6, 1, 1);
      l.fillStyle = K; l.fillRect(ex + (dir > 0 ? -1 : 2), cy + 2, 3, 1); l.fillRect(ex + (dir > 0 ? 2 : 0), cy + 3, 2, 1);
    }
  }

  drawPlayer(p, ch, dt) {
    let frame = 'idle', bob = 0;
    if (!p.onGround) frame = p.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(p.vx) > 12) { this.anim += Math.abs(p.vx) * dt / 9; frame = ['run0', 'run1', 'run2', 'run1'][Math.floor(this.anim) % 4]; bob = frame === 'run1' ? 1 : 0; }
    else bob = Math.floor(this.t * 2) % 2;
    const l = this.l, X = Math.round(p.x + PHYS.w / 2), Y = Math.round(p.y + PHYS.h);
    if (p.dash > 0 || Math.abs(p.vx) > PHYS.maxRun * 1.3) for (let i = 1; i <= 2; i++) { l.globalAlpha = 0.35 / i; l.drawImage(charFrame(ch, frame, p.face, bob), X - 6 - p.face * i * 6, Y - 16); l.globalAlpha = 1; }
    if (p.inv > 0 && Math.floor(this.t * 20) % 2) return;
    l.drawImage(charFrame(ch, frame, p.face, bob), X - 6, Y - 16);
    if (p.stun > 0) for (let i = 0; i < 3; i++) {   // little stars circling the head
      const a = this.t * 8 + i * TAU / 3;
      l.fillStyle = i ? '#ffd84a' : '#ffffff'; l.fillRect(X + Math.round(Math.cos(a) * 7), Y - 19 + Math.round(Math.sin(a) * 2), 2, 2);
    }
    if (p.rev > 0) {   // swapped controls: a purple double arrow over the head
      l.fillStyle = '#b48cff'; l.fillRect(X - 4, Y - 21, 9, 1); l.fillRect(X - 4, Y - 19, 9, 1);
      l.fillRect(X - 5, Y - 21, 1, 1); l.fillRect(X - 4, Y - 22, 1, 1); l.fillRect(X + 5, Y - 19, 1, 1); l.fillRect(X + 4, Y - 18, 1, 1);
    }
    if (p.shield > 0 && (p.shield > 0.6 || Math.floor(this.t * 12) % 2)) {   // bubble
      for (let a = 0; a < TAU; a += 0.12) { l.fillStyle = (a * 10 | 0) % 3 ? '#8fe8ff' : '#ffffff'; l.fillRect(X + Math.round(Math.cos(a) * 11), Y - 8 + Math.round(Math.sin(a) * 11), 1, 1); }
    }
    if (p.slow && Math.random() < 0.3) this.parts.push({ x: X + (Math.random() - 0.5) * 10, y: Y - 1, vx: 0, vy: 15, life: 0.3, size: 1, color: '#7bd65a', g: 0 });
    if (p.gust > 0 && Math.random() < 0.6) this.parts.push({ x: X - p.gustDir * 30 + (Math.random() - 0.5) * 10, y: Y - 4 - Math.random() * 14, vx: p.gustDir * 220, vy: 0, life: 0.25, size: 1, color: '#ffffffcc', g: 0 });
    if (p.lifted && Math.random() < 0.5) this.parts.push({ x: X + (Math.random() - 0.5) * 12, y: Y + 4, vx: 0, vy: -160, life: 0.2, size: 1, color: '#ffffffaa', g: 0 });
  }

  // Lightning: a cloud and a flickering column while it charges, then the bolt.
  drawBolts(world) {
    const l = this.l, B = GADGETS.trapper.bolt, top = this.camY;
    for (const f of world.fx) {
      if (f.k !== 'bolt') continue;
      let ground = world.h * TILE;
      for (let ty = Math.max(0, Math.floor(top / TILE)); ty < world.h; ty++) if (world.solidAt(Math.floor(f.x / TILE), ty)) { ground = ty * TILE; break; }
      if (f.t < B.warn) {
        l.fillStyle = '#4b5063'; for (const [ox, oy, w] of [[-10, 2, 20], [-7, 0, 14], [-12, 4, 24]]) l.fillRect(f.x + ox, top + 4 + oy, w, 3);
        if (Math.floor(this.t * 16) % 2) { l.fillStyle = '#ffd84a66'; for (let y = top + 10; y < ground; y += 4) l.fillRect(f.x - B.width / 2, y, B.width, 1); }
        l.fillStyle = '#ffd84a'; l.fillRect(f.x - B.width / 2, ground - 2, B.width, 2);
      } else {
        let x = f.x;
        for (let y = top; y < ground; y += 3) {
          const nx = f.x + Math.round(Math.sin(y * 0.7 + f.t * 40) * 3);
          l.fillStyle = '#ffffff'; l.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 2, 3);
          l.fillStyle = '#ffd84a'; l.fillRect(nx - 2, y, 1, 3); l.fillRect(nx + 2, y, 1, 3);
          x = nx;
        }
      }
    }
  }

  drawGlue(world) {
    const l = this.l;
    for (const f of world.fx) {
      if (f.k !== 'glue') continue;
      const fade = f.t < 1 && Math.floor(this.t * 10) % 2;
      l.fillStyle = fade ? '#3c7a37' : '#56c24e'; l.fillRect(f.x0, f.y - 2, f.x1 - f.x0, 3);
      l.fillStyle = '#9ff07a';
      for (let x = f.x0 + 2; x < f.x1 - 2; x += 5) { l.fillRect(x, f.y - 3 - ((x + Math.floor(this.t * 3)) % 3 === 0 ? 1 : 0), 2, 1); l.fillRect(x + 1, f.y + 1, 1, 2 + (x % 3)); }
    }
  }

  // Where the trapper is aiming a gadget.
  drawAim(world, aim) {
    const l = this.l, x = Math.round(aim.x), y = Math.round(aim.y), blink = Math.floor(this.t * 6) % 2;
    l.fillStyle = blink ? '#ffffff' : '#ffd84a';
    if (aim.id === 'bolt') { const w = GADGETS.trapper.bolt.width; for (let yy = this.camY; yy < this.camY + this.lo.height; yy += 6) { l.fillRect(x - w / 2, yy, 1, 3); l.fillRect(x + w / 2, yy, 1, 3); } }
    if (aim.id === 'glue') { const f = world.floorBelow(x, y); if (f) { l.fillRect(f.x0, f.y - 3, f.x1 - f.x0, 1); l.fillRect(f.x0, f.y - 3, 1, 3); l.fillRect(f.x1 - 1, f.y - 3, 1, 3); } }
    l.fillRect(x - 5, y, 4, 1); l.fillRect(x + 2, y, 4, 1); l.fillRect(x, y - 5, 1, 4); l.fillRect(x, y + 2, 1, 4);
  }

  drawParticles(dt) {
    const l = this.l;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt; if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.flicker && q.life < 0.4 && Math.floor(q.life * 20) % 2) continue;
      l.fillStyle = q.color; l.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
    }
  }

  // ---------- trap buttons (trapper) and cooldown dials (runner)
  trapButton(world, t) {
    const x = (t.x0 + t.x1 + 1) * TILE / 2;
    let y = t.y * TILE - 12;
    if (t.kind === 'crusher') y = t.y * TILE - 9;
    if (t.kind === 'trapdoor') y = t.y * TILE + 17;
    if (t.kind === 'cannon') y = t.y * TILE - 6;
    if (t.kind === 'flame' || t.kind === 'fan') y = t.y * TILE + 10;
    if (t.kind === 'arrows') y = t.y * TILE - 6;
    if (t.kind === 'wall') y = t.y * TILE - 20;
    return { x, y, r: 7 };
  }

  // Corner brackets around the trap each trap-bar button will fire, with its key number.
  drawTargets(o) {
    const l = this.l, on = Math.floor(this.t * 4) % 2 === 0;
    o.kinds.forEach((k, i) => {
      const t = o.targets[k]; if (!t) return;
      const ready = t.state === 'idle' && t.cd <= 0;
      let x = t.x0 * TILE - 2, y = t.y * TILE - 2, w = (t.x1 - t.x0 + 1) * TILE + 4, h = TILE + 4;
      if (t.kind === 'crusher') y += Math.round(t.oy);
      if (t.kind === 'spikes') { y += 6; h -= 6; }
      if (t.kind === 'trapdoor') h = 10;
      l.fillStyle = ready ? (on ? '#ffffff' : '#ffd84a') : '#8b93a6';
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
        l.fillRect(Math.min(cx, cx + dx * 3), cy, 4, 1); l.fillRect(cx, Math.min(cy, cy + dy * 3), 1, 4);
      }
      l.fillStyle = '#1c1424'; l.fillRect(x - 1, y - 8, 6, 7);
      drawDigits(l, i + 1, x + 1, y - 7, ready ? '#ffd84a' : '#8b93a6');
    });
  }

  dial(cx, cy, r, frac, bg, fg, ring) {
    const l = this.l;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j);
      if (d > r + 0.3) continue;
      let col = bg;
      if (d > r - 0.9) col = ring;
      else if (frac > 0) { let a = Math.atan2(i, -j); if (a < 0) a += TAU; if (a / TAU <= frac) col = fg; }
      l.fillStyle = col; l.fillRect(cx + i, cy + j, 1, 1);
    }
  }

  drawTrapButtons(world, o, mini) {
    const l = this.l, W = this.lo.width, H = this.lo.height;
    if (o.targets) this.drawTargets(o);
    for (const t of world.traps) {
      const b = this.trapButton(world, t), C = TRAPS[t.kind], bx = Math.round(b.x), by = Math.round(b.y);
      if (bx < this.camX - 12 || bx > this.camX + W + 12 || by < this.camY - 12 || by > this.camY + H + 12) continue;
      const ready = t.state === 'idle' && t.cd <= 0, frac = ready ? 0 : 1 - t.cd / C.cd;
      if (mini) { if (!ready) this.dial(bx, by, 3, frac, '#3b3f52', '#7bd65a', '#1c1424'); continue; }
      const hover = o.hover === t.id, pend = o.pending && o.pending[t.id] > 0, blocked = ready && world.lock > 0;
      const pulse = ready && !blocked && Math.floor(this.t * 3) % 2 === 0, r = hover ? 8 : 7;
      if (ready) this.dial(bx, by + 1, r, 0, '#1c1424', '#1c1424', '#1c1424');
      this.dial(bx, by, r, frac, ready ? (blocked ? '#ff9a3c' : '#e8414f') : '#3b3f52', '#8b93a6', pend || pulse ? '#ffffff' : '#1c1424');
      if (ready) { l.fillStyle = blocked ? '#ffc488' : '#ff8a96'; l.fillRect(bx - 3, by - r + 2, 3, 1); l.drawImage(SPR.icon[t.kind], bx - 3, by - 3); }
      else drawDigits(l, Math.ceil(t.cd) || 0, bx - 1, by - 2, '#ffffff');
    }
  }
}

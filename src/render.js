// Pixel-art renderer. The world is drawn 1:1 onto a small canvas (1 canvas pixel = 1 world pixel),
// which is then scaled up by a whole number with smoothing off, so every pixel stays crisp.
import { TILE, PHYS, TRAPS, GADGETS } from './config.js';
import { SOLID, ONEWAY, SPIKE, SPRING, NOZZLE, TURRET, FAN, CEILSPIKE, LASER, DROPPER, ANCHOR, ICEFLOOR } from './sim.js';
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
    const r = this.c.getBoundingClientRect();   // the canvas fills the space the control panels leave
    this.dpr = dpr; this.vw = r.width || window.innerWidth; this.vh = r.height || window.innerHeight; this.ox = r.left; this.oy = r.top;
    this.c.width = Math.round(this.vw * dpr); this.c.height = Math.round(this.vh * dpr);
    this.wide = null;
  }

  // Whole-number zoom so about 15 tiles fit vertically (17 for the trapper), keeping at least ~13 across.
  setZoom(wide) {
    if (this.wide === wide) return;
    this.wide = wide;
    const W = this.c.width, H = this.c.height;
    // Short views (phones) show fewer, bigger tiles: about one tile per 22 CSS px of height, 10 to 15 tiles.
    const tiles = Math.max(10, Math.min(15, this.vh / 22)) + (wide ? 3 : 0);
    let k = Math.round(H / (TILE * tiles));
    k = Math.max(1, Math.min(k, Math.floor(W / (TILE * 13))));
    this.k = k;
    this.lo.width = Math.ceil(W / k); this.lo.height = Math.ceil(H / k);
    this.l = this.lo.getContext('2d'); this.l.imageSmoothingEnabled = false;
    this.bgCache = {};
  }

  follow(world, dt, wide, snap) {
    this.setZoom(!!wide);
    if (!this.lo.width) return;
    const p = world.player, vw = this.lo.width, vh = this.lo.height;
    // The trapper's camera looks far ahead (toward the flag), so they see the traps coming before the runner reaches them.
    const ahead = Math.sign(world.goal.x - p.x) || p.face, up = wide && world.goal.y < p.y - 3 * TILE;
    const lead = wide ? ahead * vw * 0.27 : p.face * 36 + p.vx * 0.25;
    this.lookX = snap ? lead : (this.lookX ?? 0) + (lead - (this.lookX ?? 0)) * Math.min(1, dt * (wide ? 1.5 : 3));
    let tx = p.x + PHYS.w / 2 + this.lookX - vw / 2, ty = p.y + PHYS.h / 2 - vh * (up ? 0.7 : 0.55);
    const W = world.w * TILE, H = world.h * TILE;
    tx = vw >= W ? (W - vw) / 2 : Math.max(0, Math.min(W - vw, tx));
    ty = vh >= H ? H - vh : Math.max(0, Math.min(H - vh, ty));
    const k = snap ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * (snap ? 1 : k * 0.8);
  }

  // Point the camera at a spot (the level preview fly-over).
  pan(world, x, y, wide) {
    this.setZoom(!!wide);
    const vw = this.lo.width, vh = this.lo.height, W = world.w * TILE, H = world.h * TILE;
    let tx = x - vw / 2, ty = y - vh * 0.55;
    tx = vw >= W ? (W - vw) / 2 : Math.max(0, Math.min(W - vw, tx));
    ty = vh >= H ? H - vh : Math.max(0, Math.min(H - vh, ty));
    this.cam.x = tx; this.cam.y = ty; this.lookX = 0;
  }

  // The last run of this level, replayed as a see-through runner with its name over it.
  drawGhost(world, g) {
    const tr = g.trail, n = tr.length / 3, f = world.time * 10, i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), u = f - Math.floor(f);
    if (n < 2 || i < 0) return;
    if (tr[i * 3 + 2] & 4) return;   // it was dead here
    const x = tr[i * 3] + (tr[j * 3] - tr[i * 3]) * u, y = tr[i * 3 + 1] + (tr[j * 3 + 1] - tr[i * 3 + 1]) * u, fl = tr[i * 3 + 2];
    const moving = Math.abs(tr[j * 3] - tr[i * 3]) > 0.5, face = fl & 1 ? 1 : -1;
    const frame = !(fl & 2) ? (tr[j * 3 + 1] < tr[i * 3 + 1] ? 'jump' : 'fall') : moving ? ['run0', 'run1', 'run2', 'run1'][Math.floor(this.t * 10) % 4] : 'idle';
    if (!g.colors) g.colors = g.charObj;
    const l = this.l, X = Math.round(x + PHYS.w / 2), Y = Math.round(y + PHYS.h);
    l.globalAlpha = 0.38; l.drawImage(charFrame(g.colors, frame, face, 0), X - 6, Y - 16); l.globalAlpha = 0.75;
    l.font = '8px "Press Start 2P", monospace'; l.textAlign = 'center'; l.textBaseline = 'middle';
    l.fillStyle = '#1c1424'; l.fillText('GHOST', X + 1, Y - 21); l.fillStyle = '#ffffff'; l.fillText('GHOST', X, Y - 22);
    l.globalAlpha = 1;
  }

  get camX() { return Math.round(this.cam.x); }
  get camY() { return Math.round(this.cam.y); }
  toWorld(cx, cy) { return { x: (cx - (this.ox || 0)) * this.dpr / this.k + this.camX, y: (cy - (this.oy || 0)) * this.dpr / this.k + this.camY }; }

  // ---------- events -> particles
  onEvent([k, x, y, extra], ch) {
    const P = (n, f) => { for (let i = 0; i < n; i++) this.parts.push(f(i)); };
    const dust = (n, sp = 40, col = '#ffffffdd') => P(n, () => ({ x, y: y - 1, vx: (Math.random() - 0.5) * sp * 2, vy: -Math.random() * sp * 0.5, life: 0.3 + Math.random() * 0.25, size: Math.random() < 0.3 ? 2 : 1, color: col, g: 40 }));
    const pal = ch.pal || {};
    if (k === 'jump') { dust(5, 30); this.sq = { x: 0.78, y: 1.25 }; }
    if (k === 'land') { dust(3 + Math.round(extra * 6), 50); this.sq = { x: 1 + 0.35 * extra, y: 1 - 0.3 * extra }; }
    if (k === 'airjump') this.sq = { x: 0.8, y: 1.2 };
    if (k === 'spring') { this.sq = { x: 0.7, y: 1.35 }; this.say(x, y - 10, 'BOING!', '#7bd65a'); }
    if (k === 'cp') this.say(x, y - 30, 'CHECKPOINT!', '#7bd65a');
    if (k === 'goal') this.say(x, y - 40, 'GOAL!', '#ffd84a', 1.6);
    if (k === 'die') this.closeAt = null;
    if (k === 'die') this.say(x, y - 14, ['CAUGHT!', 'OUCH!', 'GOTCHA!', 'BONK!'][Math.floor(Math.random() * 4)], '#ff5d6a');
    if (k === 'block') this.say(x, y - 18, 'BLOCKED!', '#8fe8ff');
    if (k === 'stun') this.say(x, y - 14, 'ZAP!', '#ffd84a');
    if (k === 'pop') this.say(x, y - 10, 'POP!', '#ff9a3c');
    if (k === 'gadget' && extra && GADGETS.trapper[extra] && !GADGETS.trapper[extra].aim) this.say(x, y - 20, GADGETS.trapper[extra].name.toUpperCase() + '!', '#c58bff');
    if (k === 'die') {
      this.shake = 0.3;
      const cols = [pal.A, pal.a, pal.B, ch.ui, '#ffffff'].filter(Boolean);
      P(22, () => { const a = Math.random() * TAU, v = 50 + Math.random() * 140; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, life: 0.6 + Math.random() * 0.5, size: Math.random() < 0.4 ? 2 : 1, color: cols[Math.floor(Math.random() * cols.length)], g: 480 }; });
      P(8, i => { const a = i / 8 * TAU; return { x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.3, size: 2, color: '#ffffff', g: 0 }; });
    }
    if (k === 'spawn') P(12, i => { const a = i / 12 * TAU; return { x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, vx: -Math.cos(a) * 45, vy: -Math.sin(a) * 45, life: 0.3, size: 1, color: '#ffffff', g: 0 }; });
    if (k === 'cp' || k === 'goal') P(k === 'goal' ? 60 : 24, () => ({ x, y: y - 10, vx: (Math.random() - 0.5) * 150, vy: -70 - Math.random() * 140, life: 1 + Math.random() * 0.7, size: Math.random() < 0.5 ? 2 : 1, color: ['#ff5d8f', '#ffd84a', '#5ab4ff', '#7bd65a', '#b48cff', '#ffffff'][Math.floor(Math.random() * 6)], g: 260, flicker: true }));
    if (k === 'crumble') P(10, () => ({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40, life: 0.7, size: 2, color: Math.random() < 0.5 ? '#a89a86' : '#7d705f', g: 500 }));
    if (k === 'crack') dust(3, 20, '#c9bca6');
    if (k === 'grab') { this.sq = { x: 1.2, y: 0.85 }; P(5, () => ({ x, y: y - 6, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.25, size: 1, color: '#c99a5e', g: 100 })); }
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
    this.curWorld = world; this.levelH = world.h;
    const l = this.l, s = this.shake > 0 && this.shakeOn !== false ? this.shake * 12 : 0;
    const cx = this.camX + Math.round((Math.random() - 0.5) * s), cy = this.camY + Math.round((Math.random() - 0.5) * s);
    this.drawBackground(world, th, cx, cy);
    l.save(); l.translate(-cx, -cy);
    l.drawImage(this.levelCanvas(world, th), 0, 0);
    const below = cy + this.lo.height - world.h * TILE;
    if (below > 0) {   // under the level (only the trapper's camera goes here): solid earth
      l.fillStyle = th.dirt[0]; l.fillRect(cx, world.h * TILE, this.lo.width, below);
      l.fillStyle = th.dirt[1]; for (let x = Math.floor(cx / 4) * 4; x < cx + this.lo.width; x += 4) l.fillRect(x, world.h * TILE + ((x / 4) % 3), 2, 1);
    }
    this.drawWater(world, cx);
    this.drawPlatforms(world);
    this.drawAmbient(world, cx, cy);
    this.drawProps(world);
    for (const t of world.traps) this.drawTrap(t, th);
    this.drawGlue(world, o);
    for (const b of world.shots) {
      if (b.kind === 'bomb') { l.drawImage(SPR.bomb, Math.round(b.x) - 4, Math.round(b.y) - 4); continue; }
      if (b.kind === 'arrows') { l.drawImage(b.vx > 0 ? SPR.arrow : mirror(SPR.arrow, 'arrowL'), Math.round(b.x) - 5, Math.round(b.y) - 1); continue; }
      l.drawImage(SPR.ball, Math.round(b.x) - 4, Math.round(b.y) - 4);
      l.fillStyle = '#ffffff88'; l.fillRect(Math.round(b.x - Math.sign(b.vx) * (7 + (Math.floor(this.t * 20) % 2) * 3)), Math.round(b.y) - 1, 2, 2);
    }
    if (world.decoy) {   // the runner's decoy: the trapper can't tell it apart, the runner sees a ghost
      const d = world.decoy;
      l.globalAlpha = o.trapper ? 1 : 0.4;
      l.drawImage(charFrame(o.colors, ['run0', 'run1', 'run2', 'run1'][Math.floor(this.t * 12) % 4], d.face, 0), Math.round(d.x + PHYS.w / 2 - 6), Math.round(d.y + PHYS.h - 16));
      l.globalAlpha = 1;
    }
    if (o.ghost) this.drawGhost(world, o.ghost);
    if (!world.player.dead) this.drawPlayer(world.player, o.colors, dt);
    this.drawCreatures(world);
    this.drawBolts(world);
    if (o.aim) this.drawAim(world, o.aim);
    this.drawParticles(dt);
    this.drawAlerts(world);
    this.nearMiss(world);
    this.drawTexts(dt);
    this.drawTrapButtons(world, o, true);
    if (o.debug) { l.strokeStyle = 'red'; l.lineWidth = 1; for (const d of world.dangers()) l.strokeRect(Math.round(d.x) + 0.5, Math.round(d.y) + 0.5, d.w - 1, d.h - 1); }
    l.restore();
    if (this.flash > 0) { this.flash -= dt; l.fillStyle = '#ffffff55'; l.fillRect(0, 0, this.lo.width, this.lo.height); }
    if (world.slowmo > 0) { l.fillStyle = '#5ab4ff22'; l.fillRect(0, 0, this.lo.width, this.lo.height); }
    if (o.runnerView && world.player.fog > 0) this.drawFog(world, cx, cy);
    l.drawImage(this.bg('vignette', () => {
      const c = canvasOf(this.lo.width, this.lo.height), v = c.getContext('2d'), W = c.width, H = c.height;
      const g = v.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(28,20,36,0)'); g.addColorStop(1, 'rgba(28,20,36,0.28)'); v.fillStyle = g; v.fillRect(0, 0, W, H);
      return c;
    }), 0, 0);
    if (o.trapper) this.drawUpcoming(world, cx, cy);
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
    if (theme === 'lava') {   // stalactites hanging from the cave roof
      l.drawImage(this.bg('stalactites', () => {
        const c = canvasOf(480, 70), v = c.getContext('2d');
        for (let k = 0; k < 22; k++) { const cx0 = Math.floor(hash(k, 71) * 480), hh = 15 + Math.floor(hash(k, 72) * 50), w0 = 4 + Math.floor(hash(k, 73) * 7);
          for (let j = 0; j < hh; j++) { const half = Math.round(w0 * (1 - j / hh)); v.fillStyle = j > hh - 3 ? '#ff7a1a55' : '#2a1414'; v.fillRect(cx0 - half, j, half * 2 + 1, 1); } }
        v.fillStyle = '#2a1414'; v.fillRect(0, 0, 480, 6); return c;
      }), -Math.round((cx * 0.3) % 480), 0);
      l.drawImage(this.bg('stalactites'), 480 - Math.round((cx * 0.3) % 480), 0);
    }
    if (theme === 'day' || theme === 'sunset' || theme === 'sky' || theme === 'ice' || theme === 'pirate') {   // soft sun rays
      l.save(); l.globalAlpha = 0.07 + 0.02 * Math.sin(this.t * 0.7);
      l.fillStyle = theme === 'sunset' ? '#fff0b0' : '#ffffff';
      for (let i = 0; i < 4; i++) {
        const x0 = W * (0.1 + i * 0.22) - (cx * 0.03) % 60;
        l.beginPath(); l.moveTo(x0, 0); l.lineTo(x0 + 18 + i * 6, 0); l.lineTo(x0 + 18 + i * 6 + H * 0.6, H); l.lineTo(x0 + H * 0.6 - 10, H); l.closePath(); l.fill();
      }
      l.restore();
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
    const W = 480, H = { mountains: 130, cave: 120, cave2: 90, sea: 80, mansion: 130, palms: 90, spires: 100, deadtrees: 100 }[name] || (name.startsWith('clouds') ? 70 : 90);
    const c = canvasOf(W, H), x = c.getContext('2d');
    const [base, light, top] = ['mountains', 'clouds', 'cave', 'sea', 'mansion'].includes(name) ? th.farCol : th.nearCol;
    const R = (i, j, w, h, col) => { x.fillStyle = col; x.fillRect(i, j, w, h); };
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
      // a castle on a far peak: something to run toward
      const cxl = 120, gy = 26, wall = light, dark = base;
      const R = (i, j, w, h, col) => { x.fillStyle = col; x.fillRect(i, j, w, h); };
      R(cxl - 10, gy - 10, 20, 14, wall); R(cxl - 14, gy - 18, 6, 22, wall); R(cxl + 8, gy - 18, 6, 22, wall); R(cxl - 3, gy - 22, 6, 12, wall);
      for (const t0 of [cxl - 14, cxl + 8]) for (let k = 0; k < 3; k += 2) R(t0 + k * 2, gy - 20, 2, 2, wall);
      for (let k = 0; k < 5; k += 2) R(cxl - 10 + k * 4, gy - 12, 3, 2, wall);
      R(cxl - 2, gy - 1, 4, 5, dark); R(cxl - 12, gy - 13, 2, 3, dark); R(cxl + 10, gy - 13, 2, 3, dark); R(cxl - 1, gy - 18, 2, 3, dark);
      R(cxl, gy - 30, 1, 8, dark); R(cxl + 1, gy - 30, 5, 3, '#e8414f');
    } else if (name === 'cave' || name === 'cave2') {   // stalagmites, with a few glowing cracks
      const n = name === 'cave' ? 14 : 20, maxH = name === 'cave' ? 100 : 70;
      for (let i = 0; i < W; i++) { const h0 = H - 14 - Math.round(Math.sin(i / 37) * 5 + Math.sin(i / 13) * 3); R(i, h0, 1, H - h0, base); }
      for (let k = 0; k < n; k++) for (const ox of [0, -W, W]) {
        const cx0 = Math.floor(hash(k, 31) * W) + ox, hh = 30 + Math.floor(hash(k, 32) * (maxH - 30)), w0 = 6 + Math.floor(hash(k, 33) * 9);
        for (let j = 0; j < hh; j++) { const half = Math.round(w0 * j / hh); for (let i = -half; i <= half; i++) if (cx0 + i >= 0 && cx0 + i < W) px(cx0 + i, H - hh + j, i < -half + 2 ? light : base); }
        if (hash(k, 34) < 0.5) px(cx0, H - Math.floor(hh / 2), top);
      }
    } else if (name === 'spires') {   // ice crystal spires
      const ground = H - 10;
      R(0, ground, W, 10, base);
      for (let k = 0; k < 16; k++) for (const ox of [0, -W, W]) {
        const cx0 = Math.floor(hash(k, 41) * W) + ox, hh = 30 + Math.floor(hash(k, 42) * 60), w0 = 4 + Math.floor(hash(k, 43) * 5);
        for (let j = 0; j < hh; j++) { const half = Math.round(w0 * j / hh); for (let i = -half; i <= half; i++) if (cx0 + i >= 0 && cx0 + i < W) px(cx0 + i, ground - hh + j, i < 0 ? light : i === half ? top : base); }
      }
    } else if (name === 'sea') {   // the open sea: a horizon, islands and a ship far away
      const hz = 28;
      R(0, hz, W, H - hz, base);
      for (let j = hz; j < H; j += 3) for (let i = (j * 7) % 11; i < W; i += 11 + (j % 5)) R(i, j, 4, 1, light);
      for (const [ix, iw] of [[60, 70], [300, 50]]) for (let i = 0; i < iw; i++) { const hh = Math.round(Math.sin(i / iw * Math.PI) * 12); R(ix + i, hz - hh, 1, hh, top); }
      const sx = 190; R(sx, hz - 6, 26, 5, top); R(sx + 2, hz - 1, 22, 1, top); R(sx + 8, hz - 22, 1, 16, top); R(sx + 17, hz - 18, 1, 12, top);
      R(sx + 4, hz - 20, 8, 9, '#f4ead7'); R(sx + 13, hz - 16, 7, 7, '#f4ead7'); R(sx + 8, hz - 24, 4, 2, '#e8414f');
    } else if (name === 'palms') {   // sand dunes with palm trees
      const ground = H - 14;
      for (let i = 0; i < W; i++) { const b = Math.round(Math.sin(i / 50) * 3); R(i, ground + b, 1, H - ground - b, base); }
      for (let k = 0; k < 7; k++) for (const ox of [0, -W, W]) {
        const tx = Math.floor(hash(k, 51) * W) + ox, hh = 40 + Math.floor(hash(k, 52) * 25), lean = hash(k, 53) < 0.5 ? -1 : 1;
        for (let j = 0; j < hh; j++) R(tx + Math.round(lean * (j / hh) * (j / hh) * 10), ground - j, 3, 1, top);
        const fx = tx + lean * 10, fy = ground - hh;
        for (const [dx, dy] of [[-1, 0.3], [1, 0.3], [-1, -0.2], [1, -0.2], [0, -0.8]]) for (let d = 0; d < 16; d++) R(fx + Math.round(dx * d), fy + Math.round(dy * d + d * d * 0.03), 2, 2, light);
      }
    } else if (name === 'mansion') {   // a haunted house on the hill, a few windows lit
      const ground = H - 18;
      for (let i = 0; i < W; i++) { const b = Math.round(Math.sin(i / 60) * 4); R(i, ground + b, 1, H - ground - b, base); }
      const mx = 220;
      R(mx - 40, ground - 40, 80, 42, light); R(mx - 52, ground - 60, 16, 62, light); R(mx + 36, ground - 52, 14, 54, light); R(mx - 10, ground - 58, 20, 20, light);
      for (const [x0, w0, y0] of [[mx - 56, 24, ground - 60], [mx + 32, 22, ground - 52], [mx - 14, 28, ground - 58], [mx - 44, 88, ground - 40]]) for (let j = 0; j < w0 / 2; j++) R(x0 + j, y0 - j, w0 - 2 * j, 1, light);
      for (const [wx, wy] of [[mx - 30, ground - 30], [mx - 14, ground - 30], [mx + 18, ground - 18], [mx - 47, ground - 45], [mx + 40, ground - 38], [mx - 3, ground - 48]]) R(wx, wy, 5, 6, hash(wx, wy) < 0.6 ? top : base);
      R(mx - 4, ground - 14, 8, 16, base);
    } else if (name === 'deadtrees') {   // bare trees and tombstones
      const ground = H - 16;
      R(0, ground, W, 16, base);
      const branch = (bx, by, len, a, depth) => { for (let d = 0; d < len; d++) R(Math.round(bx + Math.cos(a) * d), Math.round(by - Math.sin(a) * d), depth > 1 ? 2 : 1, 1, base); if (depth > 0) { const ex = bx + Math.cos(a) * len, ey = by - Math.sin(a) * len; branch(ex, ey, len * 0.7, a + 0.5, depth - 1); branch(ex, ey, len * 0.65, a - 0.6, depth - 1); } };
      for (let k = 0; k < 6; k++) { const tx = Math.floor(hash(k, 61) * (W - 40)) + 20; branch(tx, ground, 26 + hash(k, 62) * 14, Math.PI / 2 + (hash(k, 63) - 0.5) * 0.3, 3); }
      for (let k = 0; k < 8; k++) { const gx = Math.floor(hash(k, 64) * W); R(gx, ground - 8, 6, 8, light); R(gx + 1, ground - 9, 4, 1, light); }
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
      if (name === 'trees') {   // a windmill on the hill
        const mx = 330, R = (i, j, w, h, col) => { x.fillStyle = col; x.fillRect(i, j, w, h); };
        for (let j = 0; j < 30; j++) R(mx - 4 - Math.floor(j / 6), ground - 30 + j, 9 + Math.floor(j / 6) * 2, 1, top);
        R(mx - 1, ground - 10, 3, 6, base);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + 0.4;
          for (let d = 2; d < 15; d++) { const bx = Math.round(mx + Math.cos(a) * d), by = Math.round(ground - 30 + Math.sin(a) * d); R(bx, by, 2, 2, d > 5 ? light : top); }
        }
        R(mx - 1, ground - 31, 3, 3, base);
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
      else if (t === DROPPER) x.drawImage(SPR.dropper, X, Y);
      else if (t === ICEFLOOR) {   // a block of solid ice: always slippery
        x.fillStyle = line; x.fillRect(X, Y, 16, 16); x.fillStyle = '#9ad7ff'; x.fillRect(X, Y + 1, 16, 14); x.fillStyle = '#dff6ff'; x.fillRect(X, Y + 1, 16, 2);
        x.fillStyle = '#ffffff'; x.fillRect(X + 3 + (tx % 3) * 3, Y + 4, 3, 1); x.fillRect(X + 2 + (tx % 3) * 3, Y + 5, 1, 1); x.fillStyle = '#6fb6e6'; x.fillRect(X + 9, Y + 9, 4, 1); x.fillRect(X, Y + 13, 16, 2);
      }
      else if (t === ANCHOR) {   // an iron block with a ring the rope hangs from
        x.fillStyle = line; x.fillRect(X, Y, 16, 16); x.fillStyle = '#5d6475'; x.fillRect(X + 1, Y + 1, 14, 14); x.fillStyle = '#8b93a6'; x.fillRect(X + 1, Y + 1, 14, 2); x.fillRect(X + 1, Y + 1, 2, 14);
        x.fillStyle = '#3b3f52'; for (const [i, j] of [[3, 3], [12, 3], [3, 12], [12, 12]]) x.fillRect(X + i, Y + j, 1, 1);
        x.fillStyle = '#c3c9d6'; x.fillRect(X + 6, Y + 14, 4, 1); x.fillRect(X + 5, Y + 15, 1, 1); x.fillRect(X + 10, Y + 15, 1, 1);
      }
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
    this.decorate(world, th, x);
    this.levelCache = { world, c };
    return c;
  }

  // Little things that make a place feel lived in: flowers, tufts, mushrooms, rocks, bushes, signposts on the grass;
  // roots, bones, gems and stones in the dirt. All deterministic from the tile position, baked into the level canvas.
  decorate(world, th, x) {
    const G = th.grass, D = th.dirt, line = th.line, theme = world.level.theme;
    const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    const rect = (i, j, w, h, col) => { x.fillStyle = col; x.fillRect(i, j, w, h); };
    const PETALS = { day: ['#ff6f91', '#ffd84a', '#8fd3ff', '#ffffff', '#c58bff'], sunset: ['#ffd84a', '#ff6f91', '#ffffff', '#ff9a3c'],
      night: ['#9ad7ff', '#c9a8ff', '#e6f3ff'], sky: ['#ffd84a', '#ff9ec4', '#8fd3ff'], dusk: ['#ffd0e8', '#ffffff', '#ffd84a'] }[theme] || ['#ffd84a'];
    const free = (tx, ty) => tx >= 0 && tx < world.w && ty >= 0 && world.tile(tx, ty) === 0 && world.trapAt[ty * world.w + tx] < 0;
    const marks = [world.start, world.goal, ...world.checkpoints].filter(Boolean).map(m => Math.floor((m.x + 5) / TILE));
    for (let ty = 1; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      if (world.tile(tx, ty) !== SOLID || !free(tx, ty - 1) || world.trapAt[ty * world.w + tx] >= 0) continue;
      if (marks.some(m => Math.abs(m - tx) <= 1)) continue;
      const X = tx * TILE, Y = ty * TILE - 2, r = hash(tx * 7 + 3, ty * 13 + 5), o = Math.floor(hash(tx, ty * 5) * 9);
      const petal = PETALS[Math.floor(hash(tx * 3, ty) * PETALS.length)];
      if (this.decorThemed(theme, X, Y, r, o, px, rect, line, free(tx, ty - 2))) continue;
      if (r < 0.2) {   // a few flowers
        for (let k = 0; k < 2 + (r < 0.08 ? 1 : 0); k++) {
          const fx = X + 2 + ((o + k * 5) % 12), h = 3 + ((o + k) % 3), col = k ? PETALS[(Math.floor(r * 50) + k) % PETALS.length] : petal;
          rect(fx, Y - h, 1, h, G[0]);
          px(fx, Y - h - 2, col); px(fx - 1, Y - h - 1, col); px(fx + 1, Y - h - 1, col); px(fx, Y - h, col); px(fx, Y - h - 1, '#ffd84a');
          if (k === 0) px(fx + 1, Y - 2, G[2]);
        }
      } else if (r < 0.32) {   // a tall tuft
        for (let k = 0; k < 5; k++) { const h = 3 + Math.floor(hash(tx + k, ty) * 5); rect(X + o + k, Y - h, 1, h, k % 2 ? G[2] : G[1]); px(X + o + k, Y - h - 1, G[3]); }
      } else if (r < 0.37) {   // a mushroom (they glow at night)
        const mx = X + 3 + o % 8, glow = theme === 'night' || theme === 'dusk', cap = glow ? '#5ad1c8' : '#e8414f';
        if (glow) { x.fillStyle = '#5ad1c833'; x.fillRect(mx - 2, Y - 9, 10, 9); }
        rect(mx + 2, Y - 3, 2, 3, '#f4ead7'); rect(mx, Y - 6, 6, 3, cap); rect(mx + 1, Y - 7, 4, 1, cap);
        rect(mx, Y - 4, 6, 1, glow ? '#2f8f8a' : '#a3202e'); px(mx + 1, Y - 6, '#ffffff'); px(mx + 4, Y - 5, '#ffffff'); px(mx + 3, Y - 7, '#ffffff');
      } else if (r < 0.42) {   // a rock
        const rx = X + 2 + o % 7;
        rect(rx, Y - 4, 7, 4, line); rect(rx + 1, Y - 5, 5, 1, line); rect(rx + 1, Y - 4, 5, 3, '#8b93a6'); rect(rx + 1, Y - 4, 3, 1, '#c3c9d6'); rect(rx + 4, Y - 2, 2, 1, '#5d6475');
      } else if (r < 0.47 && free(tx + 1, ty - 1) && world.tile(tx + 1, ty) === SOLID) {   // a berry bush
        for (let j = -9; j <= 0; j++) for (let i = 0; i < 22; i++) {
          const d = Math.hypot((i - 11) / 11, (j + 3) / 7) + (hash(X + i, j) - 0.5) * 0.15;
          if (d < 1) px(X + 4 + i, Y + j, d > 0.88 ? line : (i + j < 6 ? G[2] : G[1]));
        }
        for (let k = 0; k < 4; k++) { px(X + 9 + k * 4, Y - 4 - (k % 2) * 3, '#e8414f'); }
        px(X + 10, Y - 7, G[3]); px(X + 16, Y - 8, G[3]);
      } else if (r < 0.49 && free(tx, ty - 2) && theme !== 'sky') {   // a signpost pointing on
        rect(X + 7, Y - 11, 2, 11, '#6b4325'); rect(X + 2, Y - 14, 12, 6, line); rect(X + 3, Y - 13, 10, 4, '#c9874e');
        rect(X + 3, Y - 13, 10, 1, '#e3a86b'); rect(X + 5, Y - 11, 5, 1, line); px(X + 9, Y - 12, line); px(X + 9, Y - 10, line); px(X + 10, Y - 11, line);
      } else if (r < 0.55 && theme === 'dusk') {   // crystals
        const cx0 = X + 4 + o % 6;
        for (const [dx, h] of [[0, 6], [3, 9], [6, 5]]) { rect(cx0 + dx, Y - h, 2, h, '#f07fb4'); px(cx0 + dx, Y - h - 1, '#ffc0dc'); px(cx0 + dx, Y - h + 1, '#ffffff'); }
      }
    }
    if (theme === 'ice') for (let ty = 0; ty < world.h - 1; ty++) for (let tx = 0; tx < world.w; tx++) {   // icicles under overhangs
      if (world.tile(tx, ty) !== SOLID || world.tile(tx, ty + 1) !== 0 || hash(tx, ty * 7) > 0.45) continue;
      for (let k = 0; k < 3; k++) { const ix = tx * TILE + 2 + k * 5 + Math.floor(hash(tx + k, ty) * 2), h = 3 + Math.floor(hash(tx, ty + k) * 6); rect(ix, (ty + 1) * TILE, 2, h - 2, '#bfe9ff'); px(ix, (ty + 1) * TILE + h - 2, '#ffffff'); px(ix, (ty + 1) * TILE, '#ffffff'); }
    }
    // underground: roots under the grass, and now and then a bone, a gem or a stone deeper down
    for (let ty = 1; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      if (world.tile(tx, ty) !== SOLID) continue;
      const X = tx * TILE, Y = ty * TILE, r = hash(tx * 11 + 1, ty * 17 + 2);
      const topHere = world.tile(tx, ty - 1) !== SOLID, deep = world.tile(tx, ty - 1) === SOLID && world.tile(tx, ty - 2) === SOLID;
      if (topHere && r < 0.3) {
        let rx = X + 3 + Math.floor(hash(tx, ty) * 10);
        for (let j = 7; j < 7 + 4 + Math.floor(r * 20); j++) { px(rx, Y + j, D[0]); if (hash(rx, j) < 0.3) rx += hash(j, rx) < 0.5 ? -1 : 1; }
      } else if (deep && r < 0.02) {   // a bone
        const bx = X + 4, by = Y + 7;
        rect(bx + 1, by, 6, 2, '#e9dfc7'); rect(bx, by - 1, 2, 2, '#e9dfc7'); rect(bx, by + 1, 2, 2, '#e9dfc7'); rect(bx + 6, by - 1, 2, 2, '#e9dfc7'); rect(bx + 6, by + 1, 2, 2, '#e9dfc7'); rect(bx + 1, by + 2, 6, 1, '#b9ad94');
      } else if (deep && r < 0.035) {   // a gem
        const gx = X + 6, gy = Y + 6, col = hash(tx, ty * 9) < 0.5 ? '#5ad1ff' : '#ff7bd5';
        rect(gx, gy - 2, 3, 1, col); rect(gx - 1, gy - 1, 5, 2, col); rect(gx, gy + 1, 3, 1, col); px(gx + 2, gy + 2, col); px(gx, gy - 1, '#ffffff'); px(gx + 1, gy - 2, '#ffffff');
      } else if (deep && r < 0.07) {   // a buried stone
        const sx = X + 3 + Math.floor(hash(ty, tx) * 6), sy = Y + 5 + Math.floor(hash(tx + 1, ty) * 6);
        rect(sx, sy, 6, 3, '#6d6a78'); rect(sx + 1, sy - 1, 4, 1, '#6d6a78'); rect(sx + 1, sy - 1, 2, 1, '#9a97a6'); rect(sx, sy + 3, 6, 1, D[0]);
      }
    }
  }

  // Decorations for the newer worlds; returns true when it drew something (or decided to leave the spot bare).
  decorGlow() {}
  decorThemed(theme, X, Y, r, o, px, rect, line, tall) {
    if (theme === 'lava') {
      if (r < 0.14) { const rx = X + 2 + o % 6; rect(rx, Y - 5, 8, 5, line); rect(rx + 1, Y - 6, 6, 1, line); rect(rx + 1, Y - 5, 6, 4, '#3a2a2a'); rect(rx + 2, Y - 5, 3, 1, '#5a4040'); px(rx + 4, Y - 3, '#ff7a1a'); px(rx + 5, Y - 2, '#ffd84a'); }
      else if (r < 0.22) { const cx0 = X + 4 + o % 6; for (const [dx, h] of [[0, 5], [3, 8], [6, 4]]) { rect(cx0 + dx, Y - h, 2, h, '#ff7a1a'); px(cx0 + dx, Y - h - 1, '#ffd84a'); }  }
      else if (r < 0.26) { rect(X + 4, Y - 3, 7, 2, '#e9dfc7'); rect(X + 3, Y - 4, 2, 2, '#e9dfc7'); rect(X + 10, Y - 4, 2, 2, '#e9dfc7'); }
      return true;
    }
    if (theme === 'ice') {
      if (r < 0.2) { for (let i = 0; i < 12; i++) { const h = Math.round(Math.sin(i / 11 * Math.PI) * 4); rect(X + 2 + i, Y - h, 1, h, '#ffffff'); } px(X + 6, Y - 4, '#dff1fd'); }
      else if (r < 0.27) { const cx0 = X + 5 + o % 5; for (const [dx, h] of [[0, 6], [3, 9], [6, 5]]) { rect(cx0 + dx, Y - h, 2, h, '#9ad7ff'); px(cx0 + dx, Y - h - 1, '#ffffff'); } }
      else if (r < 0.3 && tall) {   // a snowman
        const sx = X + 4; rect(sx, Y - 7, 8, 7, line); rect(sx + 1, Y - 7, 6, 6, '#ffffff'); rect(sx + 1, Y - 13, 6, 6, line); rect(sx + 2, Y - 13, 4, 5, '#ffffff');
        px(sx + 3, Y - 11, line); px(sx + 5, Y - 11, line); px(sx + 6, Y - 10, '#ff9a3c'); rect(sx + 1, Y - 15, 6, 2, '#1c1424'); rect(sx, Y - 8, 8, 1, '#e8414f');
      }
      return true;
    }
    if (theme === 'pirate') {
      if (r < 0.1) { const bx = X + 3 + o % 5; rect(bx, Y - 10, 9, 10, line); rect(bx + 1, Y - 10, 7, 10, '#a8673a'); rect(bx + 1, Y - 8, 7, 1, '#5d6475'); rect(bx + 1, Y - 3, 7, 1, '#5d6475'); rect(bx + 2, Y - 10, 1, 10, '#c9874e'); }
      else if (r < 0.18) { const bx = X + 2 + o % 4; rect(bx, Y - 11, 11, 11, line); rect(bx + 1, Y - 10, 9, 9, '#c9874e'); rect(bx + 1, Y - 10, 9, 1, '#e3a86b'); for (let i = 0; i < 9; i++) { px(bx + 1 + i, Y - 10 + i, '#8a5a33'); px(bx + 9 - i, Y - 10 + i, '#8a5a33'); } }
      else if (r < 0.22) { const cx0 = X + 8; for (let a = 0; a < 6.3; a += 0.3) for (const rr of [2, 4]) px(Math.round(cx0 + Math.cos(a) * rr * 1.4), Math.round(Y - 3 + Math.sin(a) * rr * 0.6), '#c99a5e'); }
      else if (r < 0.28) { for (let k = 0; k < 4; k++) rect(X + o + k * 2, Y - 3 - (k % 2) * 2, 1, 3 + (k % 2) * 2, '#d9b26a'); }
      return true;
    }
    if (theme === 'haunted') {
      if (r < 0.1) { const gx = X + 4 + o % 5; rect(gx, Y - 10, 8, 10, line); rect(gx + 1, Y - 11, 6, 1, line); rect(gx + 1, Y - 10, 6, 10, '#8a8a9a'); rect(gx + 1, Y - 10, 2, 10, '#a8a8b8'); rect(gx + 3, Y - 8, 2, 5, '#5a5a6a'); rect(gx + 2, Y - 7, 4, 1, '#5a5a6a'); }
      else if (r < 0.17) {   // a jack-o'-lantern
        const pxx = X + 4 + o % 5; 
        rect(pxx, Y - 7, 9, 7, line); rect(pxx + 1, Y - 7, 7, 6, '#ff9a3c'); rect(pxx + 2, Y - 7, 2, 6, '#ffb86a'); rect(pxx + 4, Y - 9, 1, 2, '#3a7a2a');
        px(pxx + 2, Y - 5, '#ffd84a'); px(pxx + 6, Y - 5, '#ffd84a'); rect(pxx + 2, Y - 3, 5, 1, '#ffd84a');
      }
      else if (r < 0.21) { const cx0 = X + 7; rect(cx0, Y - 6, 2, 6, '#f4ead7'); px(cx0, Y - 8 - (o % 2), '#ffd84a'); px(cx0 + 1, Y - 7, '#ff9a3c'); }
      else if (r < 0.28) { for (let k = 0; k < 5; k++) { const h = 4 + (k * 3 + o) % 5; for (let j = 0; j < h; j++) px(X + 3 + k * 2 + (j % 3 === 2 ? 1 : 0), Y - j, '#5a5a6a'); } }
      return true;
    }
    return false;
  }

  // Butterflies by day, fireflies at night, birds crossing the sky. Purely decorative.
  groundTop(world, x) {
    const tx = Math.max(0, Math.min(world.w - 1, Math.floor(x / TILE)));
    if (!this.tops || this.tops.world !== world) this.tops = { world, m: new Map() };
    // the top of the ground under this column, found from the bottom up (so a cave roof doesn't count); a pit has none
    if (!this.tops.m.has(tx)) { let y = world.h - 1; if (world.tile(tx, y) !== SOLID) y = world.h; else while (y > 0 && world.tile(tx, y - 1) === SOLID) y--; this.tops.m.set(tx, y * TILE); }
    return this.tops.m.get(tx);
  }
  drawAmbient(world, cx, cy) {
    const l = this.l, W = this.lo.width, t = this.t, theme = world.level.theme, night = theme === 'night' || theme === 'dusk' || theme === 'haunted' || theme === 'lava';
    if (theme === 'ice') {   // snowfall across the view
      const H = this.lo.height;
      for (let i = 0; i < 40; i++) {
        const sx = ((hash(i, 81) * W + Math.sin(t * 0.8 + i) * 10 - cx * 0.6) % W + W) % W, sy = ((hash(i, 82) * H + t * (10 + hash(i, 83) * 14)) % H);
        l.fillStyle = i % 3 ? '#ffffff' : '#dff1fd'; l.fillRect(Math.round(cx + sx), Math.round(cy + sy), i % 5 ? 1 : 2, i % 5 ? 1 : 2);
      }
    }
    const CELL = 150;
    for (let c = Math.floor(cx / CELL) - 1; c <= Math.floor((cx + W) / CELL) + 1; c++) {
      if (c < 0 || hash(c, 77) > (night ? 0.9 : 0.55)) continue;
      for (let k = 0; k < (night ? 3 : 1); k++) {
        const ph = hash(c, k + 3) * TAU, bx = c * CELL + hash(c, k) * CELL + Math.sin(t * 0.6 + ph) * 24, gy = this.groundTop(world, bx);
        if (gy >= world.h * TILE) continue;
        const by = gy - 16 - hash(c, k + 9) * 18 + Math.sin(t * 1.7 + ph * 2) * 6;
        if (theme === 'lava') {   // embers drifting up
          const ey = gy - ((t * 18 + hash(c, k + 5) * 80) % 80), ex = bx + Math.sin(t * 2 + ph) * 4;
          l.fillStyle = '#ff7a1a55'; l.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
          l.fillStyle = hash(c, k) < 0.5 ? '#ffd84a' : '#ff9a3c'; l.fillRect(Math.round(ex), Math.round(ey), 1, 1);
        } else if (night) {   // a blinking firefly (pale wisps in the haunted manor)
          const on = Math.sin(t * 2.3 + ph * 5) > -0.2;
          if (!on) continue;
          const glow = theme === 'haunted' ? ['#b8ffd833', '#e0fff0'] : ['#d8ff7a33', '#efffb0'];
          l.fillStyle = glow[0]; l.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3);
          l.fillStyle = glow[1]; l.fillRect(Math.round(bx), Math.round(by), 1, 1);
        } else {   // a fluttering butterfly
          const up = Math.floor(t * 9 + ph) % 2, X = Math.round(bx), Y = Math.round(by);
          const col = ['#ff6f91', '#ffd84a', '#8fd3ff', '#ffffff'][Math.floor(hash(c, 5) * 4)];
          l.fillStyle = '#1c1424'; l.fillRect(X, Y, 1, 3);
          l.fillStyle = col;
          if (up) { l.fillRect(X - 2, Y - 2, 2, 2); l.fillRect(X + 1, Y - 2, 2, 2); }
          else { l.fillRect(X - 2, Y, 2, 2); l.fillRect(X + 1, Y, 2, 2); }
        }
      }
    }
    if (!night) {   // a small flock crossing the sky, in screen space
      const span = W + 120, fx = ((t * 16 + 300) % span) - 60, fy = 26 + Math.sin(t * 0.4) * 6;
      l.fillStyle = theme === 'sky' ? '#4a5a8a' : '#3a3350';
      for (const [dx, dy] of [[0, 0], [-9, 4], [-16, -3], [-24, 6]]) {
        const X = Math.round(cx + fx + dx), Y = Math.round(cy + fy + dy), f = Math.floor(t * 6 + dx) % 2;
        l.fillRect(X - 2, Y - f, 2, 1); l.fillRect(X + 1, Y - f, 2, 1); l.fillRect(X, Y + 1 - f, 1, 1);
      }
    }
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
    } else if (t.kind === 'saw') {
      l.fillStyle = '#5d6475'; l.fillRect(x, y + 14, w, 2); l.fillStyle = th.line; l.fillRect(x, y + 15, w, 1);
      const b = t.state === 'active' ? (() => { const d = t.t * TRAPS.saw.speed, L2 = (t.x1 - t.x0) * TILE; const a = d <= L2 ? d : Math.max(0, 2 * L2 - d); return { x: x + 8 + a, y: y + 9 }; })() : { x: x + 8, y: y + 9 + (warn ? 2 : 6) };
      const spin = Math.floor(this.t * 30) % 2;
      l.save(); l.beginPath(); l.rect(x - 8, y - 4, w + 16, 18); l.clip();
      l.drawImage(spin && t.state !== 'idle' ? mirror(SPR.blade, 'bladeM') : SPR.blade, Math.round(b.x) - 6, Math.round(b.y) - 6);
      l.restore();
    } else if (t.kind === 'laser') {
      l.drawImage(t.dir > 0 ? SPR.laser : mirror(SPR.laser, 'laserL'), x, y);
      const a = t.dir > 0 ? x + 16 : (t.end + 1) * TILE, b = t.dir > 0 ? t.end * TILE : x;
      if (warn && Math.floor(this.t * 20) % 2) { l.fillStyle = '#ff5d5d88'; for (let i = Math.min(a, b); i < Math.max(a, b); i += 4) l.fillRect(i, y + 7, 2, 1); }
      if (t.state === 'active') { l.fillStyle = '#ff5d5d'; l.fillRect(Math.min(a, b), y + 6, Math.abs(b - a), 4); l.fillStyle = '#fff6c8'; l.fillRect(Math.min(a, b), y + 7, Math.abs(b - a), 2); }
    } else if (t.kind === 'dropper') {
      if (warn) { l.fillStyle = Math.floor(this.t * 20) % 2 ? '#ff5a2a' : '#ffd84a'; l.fillRect(x + 6, y + 11, 4, 1); }
    } else if (t.kind === 'conveyor' || t.kind === 'ice') {
      const icy = t.kind === 'ice';
      for (let i = 0; i < w; i += 16) {
        const X = x + i + jig;
        l.fillStyle = th.line; l.fillRect(X, y, 16, 16);
        l.fillStyle = icy ? (t.state === 'active' ? '#bfe9ff' : '#8fa8c8') : '#4b5063'; l.fillRect(X + 1, y + 1, 14, 14);
        if (icy) {
          l.fillStyle = t.state === 'active' ? '#ffffff' : '#a9c0dc'; l.fillRect(X + 1, y + 1, 14, 2);
          if (t.state === 'active') { l.fillStyle = '#ffffff'; l.fillRect(X + 3 + ((Math.floor(this.t * 6) + i) % 9), y + 4, 2, 1); }
          l.fillStyle = '#6b85a8'; l.fillRect(X + 4, y + 8, 6, 1); l.fillRect(X + 9, y + 11, 4, 1);
        } else {
          const off = t.state === 'active' ? Math.floor(this.t * 40) % 6 : 0;
          l.fillStyle = '#2f3340'; l.fillRect(X + 1, y + 1, 14, 3);
          l.fillStyle = t.state === 'active' ? '#ffd84a' : '#9aa3b5';
          for (let j = 0; j < 3; j++) { const cxx = X + 2 + ((j * 6 + 16 - off) % 16); if (cxx < X + 14) { l.fillRect(cxx, y + 2, 1, 1); l.fillRect(cxx + 1, y + 1, 1, 1); l.fillRect(cxx + 1, y + 3, 1, 1); } }
          l.fillStyle = '#6b7285'; l.fillRect(X + 3, y + 8, 3, 3); l.fillRect(X + 10, y + 8, 3, 3);
        }
      }
    } else if (t.kind === 'flame') {
      if (warn) {
        for (let i = 0; i < 4; i++) { const k = (this.t * 2.5 + i / 4) % 1, s = k < 0.3 ? 1 : 2; l.fillStyle = k < 0.5 ? '#9aa3b5' : '#6b7285'; l.fillRect(x + 7 + Math.round(Math.sin(i * 3 + this.t * 6) * 2), y - 2 - Math.round(k * 12), s, s); }
        l.fillStyle = Math.floor(this.t * 16) % 2 ? '#ffd84a' : '#5d6475'; for (const ox of [3, 7, 11]) l.fillRect(x + ox, y + 3, 1, 1);
      }
      if (t.state === 'active' && t.reach) {
        const H = t.reach * TILE, low = C.tank - t.t < 0.4 && Math.floor(this.t * 16) % 2 ? 0.85 : 1, hh = Math.round(H * Math.min(1, t.t / 0.06) * low), fr = Math.floor(this.t * 20);
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

  solidBelow(x, ty) { const w = this.curWorld; return w && w.solidAt(Math.floor(x / TILE), ty); }
  drawPlayer(p, ch, dt) {
    let frame = 'idle', bob = 0;
    if (!p.onGround) frame = p.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(p.vx) > 12) { this.anim += Math.abs(p.vx) * dt / 9; frame = ['run0', 'run1', 'run2', 'run1'][Math.floor(this.anim) % 4]; bob = frame === 'run1' ? 1 : 0; }
    else bob = Math.floor(this.t * 2) % 2;
    const l = this.l, X = Math.round(p.x + PHYS.w / 2), Y = Math.round(p.y + PHYS.h);
    if (p.dash > 0 || Math.abs(p.vx) > PHYS.maxRun * 1.3) for (let i = 1; i <= 2; i++) { l.globalAlpha = 0.35 / i; l.drawImage(charFrame(ch, frame, p.face, bob), X - 6 - p.face * i * 6, Y - 16); l.globalAlpha = 1; }
    if (p.inv > 0 && Math.floor(this.t * 20) % 2) return;
    if (p.phase > 0) l.globalAlpha = 0.45 + 0.2 * Math.sin(this.t * 20);
    // squash and stretch: stretched on take-off, squashed on landing, easing back
    const sq = this.sq || (this.sq = { x: 1, y: 1 }), ease = Math.min(1, dt * 12);
    sq.x += (1 - sq.x) * ease; sq.y += (1 - sq.y) * ease;
    if (!p.onGround) {   // a soft shadow on the floor below
      let gy = Math.floor((p.y + PHYS.h) / TILE);
      while (gy < this.levelH && !this.solidBelow(X, gy)) gy++;
      const dist = gy * TILE - Y;
      if (gy < this.levelH && dist < 90) { const w = Math.max(3, 9 - Math.round(dist / 14)); l.fillStyle = 'rgba(28,20,36,0.3)'; l.fillRect(X - Math.floor(w / 2), gy * TILE - 1, w, 1); l.fillRect(X - Math.floor(w / 2) + 1, gy * TILE - 2, w - 2, 1); }
    }
    if (p.squash > 0) l.drawImage(charFrame(ch, frame, p.face, bob), X - 7, Y - 11, 14, 11);   // squashed flat
    else if (Math.abs(sq.x - 1) > 0.04) { const w = Math.round(12 * sq.x), h = Math.round(16 * sq.y); l.drawImage(charFrame(ch, frame, p.face, bob), X - Math.round(w / 2), Y - h, w, h); }
    else l.drawImage(charFrame(ch, frame, p.face, bob), X - 6, Y - 16);
    l.globalAlpha = 1;
    if (p.glide > 0 && !p.onGround && p.vy > 0) {   // umbrella
      l.fillStyle = '#e8414f'; l.fillRect(X - 7, Y - 24, 15, 2); l.fillRect(X - 5, Y - 25, 11, 1); l.fillStyle = '#ffffff'; l.fillRect(X - 3, Y - 24, 2, 2); l.fillRect(X + 2, Y - 24, 2, 2);
      l.fillStyle = '#5d6475'; l.fillRect(X, Y - 22, 1, 7);
    }
    if (p.heavy > 0) { l.fillStyle = '#3b3f52'; l.fillRect(X - 4, Y - 24, 9, 3); l.fillRect(X - 2, Y - 21, 5, 2); l.fillStyle = '#9aa3b5'; l.fillRect(X - 4, Y - 24, 9, 1); }
    if (p.moon > 0 && Math.random() < 0.3) this.parts.push({ x: X + (Math.random() - 0.5) * 12, y: Y - 6, vx: 0, vy: -20, life: 0.6, size: 1, color: '#dfe6ff', g: 0 });
    if (p.frost > 0 || p.icy) { l.fillStyle = '#bfe9ff'; for (let i = -1; i <= 1; i++) l.fillRect(X + i * 4, Y - 1 - (i === 0 ? 1 : 0), 2, 1); }
    if (p.boots > 0) { l.fillStyle = Math.floor(this.t * 10) % 2 ? '#ffd84a' : '#ff9a3c'; l.fillRect(X - 4, Y - 1, 3, 1); l.fillRect(X + 2, Y - 1, 3, 1); }
    if (p.haste > 0 && Math.abs(p.vx) > 40 && Math.random() < 0.6) this.parts.push({ x: X - p.face * 8, y: Y - 3 - Math.random() * 10, vx: -p.face * 120, vy: 0, life: 0.15, size: 1, color: '#ffffffcc', g: 0 });
    if (p.anchor > 0) { l.fillStyle = '#9aa3b5'; l.fillRect(X, Y + 1, 1, 3); l.fillRect(X - 2, Y + 3, 5, 1); }
    if (p.carry && p.onGround && Math.random() < 0.3) this.parts.push({ x: X, y: Y, vx: p.carry, vy: -10, life: 0.2, size: 1, color: '#9aa3b5', g: 0 });
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
    if (p.gust > 0) for (let n = 0; n < 2; n++) this.parts.push({ x: X - p.gustDir * (20 + Math.random() * 40), y: Y + 4 - Math.random() * 26, vx: p.gustDir * 220, vy: 0, life: 0.25, size: 1, color: '#ffffffcc', g: 0 });
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

  drawCreatures(world) {
    const l = this.l, f = Math.floor(this.t * 8) % 2;
    for (const b of world.fx) if (b.k === 'bat') { const img = SPR.bat[f]; l.drawImage(b.face < 0 ? mirror(img, 'bat' + f + 'L') : img, Math.round(b.x) - 4, Math.round(b.y) - 3); }
  }

  // Fog (a trapper gadget): the runner only sees a small circle around themselves.
  drawFog(world, cx, cy) {
    const l = this.l, p = world.player, px = Math.round(p.x + PHYS.w / 2 - cx), py = Math.round(p.y + PHYS.h / 2 - cy);
    const r = 34 + Math.sin(this.t * 3) * 2, W = this.lo.width, H = this.lo.height;
    l.fillStyle = '#0d0a14';
    for (let y = 0; y < H; y += 2) {
      const dy = y - py, half = Math.abs(dy) < r ? Math.sqrt(r * r - dy * dy) : 0;
      if (!half) { l.fillRect(0, y, W, 2); continue; }
      l.fillRect(0, y, Math.max(0, px - half), 2); l.fillRect(px + half, y, W, 2);
    }
  }

  drawGlue(world, o = {}) {
    const l = this.l;
    const p = world.player, seeMines = o.trapper || p.radar > 0;
    for (const f of world.fx) {
      if (f.k === 'mine') {   // the runner only sees a mine as a glint (or clearly with Radar)
        const mx = Math.round((f.x0 + f.x1) / 2) - 3, glint = Math.floor(this.t * 3 + f.x0) % 7 === 0;
        if (seeMines) l.drawImage(SPR.mine, mx, f.y - 4);
        else if (glint) { l.fillStyle = '#ffffffaa'; l.fillRect(mx + 3, f.y - 2, 1, 1); }
        continue;
      }
      if (f.k === 'boom') {
        const r = Math.round(22 * (1 - f.t / 0.18) + 6);
        for (let a = 0; a < TAU; a += 0.25) { l.fillStyle = Math.random() < 0.5 ? '#ffd84a' : '#ff5a2a'; l.fillRect(Math.round(f.x + Math.cos(a) * r * Math.random()), Math.round(f.y - Math.abs(Math.sin(a)) * r * Math.random()), 2, 2); }
        continue;
      }
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

  // Floating words: CHECKPOINT!, CAUGHT!, CLOSE! ... in the pixel font with a dark outline, rising and fading.
  say(x, y, text, color, life = 1.1) {
    if (!this.texts) this.texts = [];
    this.texts.push({ x, y, text, color, life, max: life });
    if (this.texts.length > 8) this.texts.shift();
  }
  drawTexts(dt) {
    const l = this.l;
    if (!this.texts || !this.texts.length) return;
    l.font = '8px "Press Start 2P", monospace'; l.textAlign = 'center'; l.textBaseline = 'middle';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const q = this.texts[i];
      q.life -= dt; if (q.life <= 0) { this.texts.splice(i, 1); continue; }
      const age = q.max - q.life, pop = age < 0.12 ? 0.6 + age / 0.12 * 0.6 : age < 0.2 ? 1.2 - (age - 0.12) / 0.08 * 0.2 : 1;
      const X = Math.round(q.x), Y = Math.round(q.y - age * 14);
      l.globalAlpha = Math.min(1, q.life / 0.3);
      l.save(); l.translate(X, Y); l.scale(pop, pop);
      l.fillStyle = '#1c1424';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [1, 2], [-1, 2]]) l.fillText(q.text, dx, dy);
      l.fillStyle = q.color; l.fillText(q.text, 0, 0);
      l.restore(); l.globalAlpha = 1;
    }
  }
  // A trap went off right next to the runner and missed: CLOSE!
  nearMiss(world) {
    const p = world.player;
    if (p.dead || p.finished) { this.closeAt = null; return; }
    this.nm = this.nm || {};
    for (const d of world.dangers()) {
      const gx = Math.max(d.x - (p.x + PHYS.w), p.x - (d.x + d.w), 0), gy = Math.max(d.y - (p.y + PHYS.h), p.y - (d.y + d.h), 0);
      const gap = Math.max(gx, gy), key = Math.round(d.x / 16) + ',' + Math.round(d.y / 16);
      if (gap > 0 && gap < 7 && !(this.t - (this.nm[key] ?? -9) < 1.5)) { this.nm[key] = this.t; this.closeAt = this.t; }
    }
    // only a miss if the runner is still standing a moment later
    if (this.closeAt != null && this.t - this.closeAt > 0.25) { this.closeAt = null; this.say(p.x + 5, p.y - 12, 'CLOSE!', '#ffffff', 0.8); if (this.onClose) this.onClose(); }
  }
  // "!" over a trap the moment it is fired
  drawAlerts(world) {
    const l = this.l;
    for (const t of world.traps) {
      if (!(t.state === 'warn' || (t.state === 'active' && t.t < 0.2))) continue;
      const ceiling = t.kind === 'crusher' || t.kind === 'dropper';
      const X = Math.round((t.x0 + t.x1 + 1) * TILE / 2) - 3, Y = ceiling ? t.y * TILE + 18 + (t.oy || 0) : t.y * TILE - 22 - (t.kind === 'wall' ? 16 : 0);
      const b = Math.floor(this.t * 16) % 2;
      l.fillStyle = '#1c1424'; l.fillRect(X - 1, Y - 1 - b, 9, 12); l.fillRect(X + 2, Y + 11 - b, 3, 2);
      l.fillStyle = '#ffffff'; l.fillRect(X, Y - b, 7, 10); l.fillRect(X + 3, Y + 10 - b, 1, 1);
      l.fillStyle = '#e8414f'; l.fillRect(X + 2, Y + 1 - b, 3, 5); l.fillRect(X + 3, Y + 7 - b, 1, 2); l.fillRect(X + 2, Y + 7 - b, 3, 2);
    }
  }
  // Moving platforms (wood on a dotted track), crumbling stone tiles, ropes.
  drawPlatforms(world) {
    const l = this.l, time = world.rtime ?? world.time;
    for (const m of world.movers) {
      const a = world.moverPos(m, time);
      l.fillStyle = 'rgba(28,20,36,0.35)';   // the track
      if (m.axis === 'x') for (let d = 0; d <= m.range + m.w; d += 4) l.fillRect(m.x0 + d, m.y0 + 4, 2, 1);
      else for (let d = 0; d <= m.range + 8; d += 4) l.fillRect(m.x0 + m.w / 2, m.y0 + 8 - d, 1, 2);
      const X = Math.round(a.x), Y = Math.round(a.y);
      l.fillStyle = '#1c1424'; l.fillRect(X, Y, m.w, 7);
      l.fillStyle = '#b06f3f'; l.fillRect(X + 1, Y + 1, m.w - 2, 5);
      l.fillStyle = '#d99a5e'; l.fillRect(X + 1, Y + 1, m.w - 2, 1);
      l.fillStyle = '#7a4522'; for (let i = 8; i < m.w - 2; i += 8) l.fillRect(X + i, Y + 2, 1, 4);
      l.fillStyle = '#9aa3b5'; l.fillRect(X + 2, Y + 3, 2, 2); l.fillRect(X + m.w - 4, Y + 3, 2, 2);
      l.fillStyle = '#1c1424'; l.fillRect(X + m.w / 2 - 3, Y + 7, 6, 2); l.fillStyle = '#5d6475'; l.fillRect(X + m.w / 2 - 2, Y + 7, 4, 1);
    }
    for (const c of world.crumbles) {
      if (c.state === 'gone') { if (Math.floor(this.t * 2) % 2) { l.fillStyle = 'rgba(255,255,255,0.18)'; l.fillRect(c.x * TILE + 2, c.y * TILE + 2, 12, 1); l.fillRect(c.x * TILE + 2, c.y * TILE + 13, 12, 1); } continue; }
      const jx = c.state === 'shake' ? Math.round(Math.sin(this.t * 60 + c.x) * 1) : 0, X = c.x * TILE + jx, Y = c.y * TILE;
      l.fillStyle = '#1c1424'; l.fillRect(X, Y, 16, 16);
      l.fillStyle = '#a89a86'; l.fillRect(X + 1, Y + 1, 14, 14);
      l.fillStyle = '#c9bca6'; l.fillRect(X + 1, Y + 1, 14, 2); l.fillRect(X + 1, Y + 8, 6, 1); l.fillRect(X + 9, Y + 8, 6, 1);
      l.fillStyle = '#7d705f'; l.fillRect(X + 7, Y + 3, 1, 5); l.fillRect(X + 4, Y + 9, 1, 6); l.fillRect(X + 11, Y + 9, 1, 6); l.fillRect(X + 1, Y + 14, 14, 1);
      if (c.state === 'shake') { l.fillStyle = '#1c1424'; l.fillRect(X + 5, Y + 2, 1, 3); l.fillRect(X + 6, Y + 5, 1, 3); l.fillRect(X + 10, Y + 6, 1, 4); l.fillRect(X + 9, Y + 10, 1, 3); }
    }
    for (let i = 0; i < world.ropes.length; i++) {
      const r = world.ropes[i], p = world.player;
      let ex, ey;
      if (p.rope === i && !p.dead) { ex = p.x + PHYS.w / 2; ey = p.y + PHYS.h / 2 - 3; }
      else { const a = Math.sin(this.t * 1.3 + i) * 0.08; ex = r.ax + Math.sin(a) * r.len; ey = r.ay + Math.cos(a) * r.len; }
      const n = Math.max(1, Math.round(Math.hypot(ex - r.ax, ey - r.ay)));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(r.ax + (ex - r.ax) * k / n), y = Math.round(r.ay + (ey - r.ay) * k / n);
        l.fillStyle = '#5a3418'; l.fillRect(x - 1, y, 3, 1);
        l.fillStyle = k % 4 < 2 ? '#c99a5e' : '#9a6a3a'; l.fillRect(x, y, 1, 1);
      }
      if (p.rope !== i) { l.fillStyle = '#5a3418'; l.fillRect(Math.round(ex) - 1, Math.round(ey), 3, 3); l.fillStyle = '#c99a5e'; l.fillRect(Math.round(ex), Math.round(ey) + 1, 1, 1); }
    }
  }

  // Pits end in water (or a sea of cloud on the sky level), gently waving.
  drawWater(world, cx) {
    const l = this.l, W = this.lo.width, base = world.h * TILE, theme = world.level.theme;
    const C = { day: ['#2f74d0', '#5aa2ff', '#bfe3ff'], sunset: ['#b4506e', '#e07a8a', '#ffd0b0'], night: ['#1b2550', '#2e3f86', '#7f95e6'], dusk: ['#3d2260', '#6a3f8e', '#f2a6c4'], sky: ['#e6f3ff', '#ffffff', '#ffffff'],
      lava: ['#c2361b', '#ff7a1a', '#ffd84a'], ice: ['#5a9ed6', '#bfe9ff', '#ffffff'], pirate: ['#1f5f9e', '#3d8be0', '#bfe3ff'], haunted: ['#2a1f3d', '#4a3a6a', '#9a7acc'] }[theme] || ['#2f74d0', '#5aa2ff', '#bfe3ff'];
    for (let x = Math.max(0, Math.floor(cx)); x < Math.min(world.w * TILE, cx + W); x++) {
      if (this.groundTop(world, x) < base) continue;
      const wave = Math.round(Math.sin(x / 7 + this.t * 2) * 1.5 + Math.sin(x / 3 - this.t * 3) * 0.6), top = base - 9 + wave;
      if (theme === 'lava') { l.fillStyle = '#ff7a1a22'; l.fillRect(x, top - 10, 1, 10); }
      l.fillStyle = C[0]; l.fillRect(x, top, 1, base - top);
      l.fillStyle = C[1]; l.fillRect(x, top, 1, 2);
      if ((x + Math.floor(this.t * 6)) % 11 === 0) { l.fillStyle = C[2]; l.fillRect(x, top, 1, 1); }
    }
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
    if (t.kind === 'laser') y = t.y * TILE - 6;
    if (t.kind === 'dropper') y = t.y * TILE + 22;
    if (t.kind === 'conveyor' || t.kind === 'ice') y = t.y * TILE + 22;
    if (t.kind === 'saw') y = t.y * TILE - 6;
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

  // Traps ahead of the runner but off the trapper's screen: a marker on the edge with the trap and the seconds until the runner gets there.
  drawUpcoming(world, cx, cy) {
    const l = this.l, W = this.lo.width, H = this.lo.height, p = world.player, px = p.x + PHYS.w / 2;
    const dir = Math.sign(world.goal.x - px) || 1, list = [];
    for (const t of world.traps) {
      const tx = (t.x0 + t.x1 + 1) * TILE / 2, ty = t.y * TILE + 8, ahead = (tx - px) * dir;
      if (ahead < 0 || ahead > W * 2.5) continue;
      if (tx >= cx && tx <= cx + W && ty >= cy && ty <= cy + H) continue;
      list.push({ t, ahead, tx, ty });
    }
    list.sort((a, b) => a.ahead - b.ahead);
    const boxes = [];
    for (const m of list.slice(0, 5)) {
      let x = Math.max(1, Math.min(W - 18, m.tx - cx - 9)), y = Math.max(1, Math.min(H - 10, m.ty - cy - 5));
      while (boxes.some(b => Math.abs(b.x - x) < 18 && Math.abs(b.y - y) < 10)) y += m.ty < cy ? 10 : -10;
      boxes.push({ x, y });
      const ready = m.t.state === 'idle' && m.t.cd <= 0, eta = Math.min(9, Math.ceil(m.ahead / PHYS.maxRun));
      l.globalAlpha = Math.max(0.55, 1 - m.ahead / (W * 3));
      l.fillStyle = '#1c1424'; l.fillRect(x - 1, y - 1, 19, 11);
      l.fillStyle = ready ? '#e8414f' : '#5d6475'; l.fillRect(x, y, 17, 9);
      l.drawImage(SPR.icon[m.t.kind], x + 1, y + 1);
      drawDigits(l, eta, x + 9, y + 2, '#ffd84a');
      l.fillStyle = '#ffd84a'; l.fillRect(x + 13, y + 6, 1, 1); l.fillRect(x + 14, y + 5, 1, 1); l.fillRect(x + 14, y + 7, 1, 1); l.fillRect(x + 15, y + 6, 1, 1);
      l.globalAlpha = 1;
    }
  }

  drawTrapButtons(world, o, mini) {
    const l = this.l, W = this.lo.width, H = this.lo.height;
    if (o.targets) this.drawTargets(o);
    for (const t of world.traps) {
      const b = this.trapButton(world, t), C = TRAPS[t.kind], bx = Math.round(b.x), by = Math.round(b.y);
      if (bx < this.camX - 12 || bx > this.camX + W + 12 || by < this.camY - 12 || by > this.camY + H + 12) continue;
      const ready = t.state === 'idle' && t.cd <= 0, frac = ready ? 0 : 1 - t.cd / C.cd;
      if (mini) {
        if (!ready) this.dial(bx, by, 3, frac, '#3b3f52', '#7bd65a', '#1c1424');
        else if (world.player.radar > 0 && !o.trapper && Math.floor(this.t * 6) % 2) { l.fillStyle = '#ff5d5d'; l.fillRect(bx - 1, by - 5, 2, 6); l.fillRect(bx - 1, by + 3, 2, 2); }
        continue;
      }
      const hover = o.hover === t.id, pend = o.pending && o.pending[t.id] > 0, blocked = ready && world.lock > 0 && !world.chained(t);
      const pulse = ready && !blocked && Math.floor(this.t * 3) % 2 === 0, r = hover ? 8 : 7;
      if (ready) this.dial(bx, by + 1, r, 0, '#1c1424', '#1c1424', '#1c1424');
      this.dial(bx, by, r, frac, ready ? (blocked ? '#ff9a3c' : '#e8414f') : '#3b3f52', '#8b93a6', pend || pulse ? '#ffffff' : '#1c1424');
      if (ready) { l.fillStyle = blocked ? '#ffc488' : '#ff8a96'; l.fillRect(bx - 3, by - r + 2, 3, 1); l.drawImage(SPR.icon[t.kind], bx - 3, by - 3); }
      else drawDigits(l, Math.ceil(t.cd) || 0, bx - 1, by - 2, '#ffffff');
    }
  }
}

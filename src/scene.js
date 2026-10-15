// The menu world: a living pixel landscape behind the title and every menu (in the spirit of cozy farm-game title
// screens). It isn't a level: a sky that turns from day to sunset to a starry night and back, drifting clouds, hazy
// mountains, hills with trees and a cottage, a meadow with swaying grass, petals, birds, fireflies, and now and then a
// runner dashing along the path, sometimes with a bat on their tail. Opens with a slow pan down from the sky.
import { CHARS, charFrame, SPR } from './sprites.js';

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
// smooth 1-D value noise
const noise = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u; };

// time of day keyframes (0..1 is one full day): sky top, sky horizon, light tint over the land and how strong it is
const DAY = [
  [0.00, '#6d82d6', '#ffc9a3', '#ff9a6a', 0.12],
  [0.10, '#4f9cff', '#c4ebff', '#ffffff', 0.00],
  [0.56, '#4f9cff', '#c4ebff', '#ffffff', 0.00],
  [0.66, '#4a4fa8', '#ff9c5e', '#ff7a3d', 0.18],
  [0.74, '#1e2156', '#7a4f8f', '#2c2266', 0.40],
  [0.86, '#0b0f2e', '#26315f', '#0b1030', 0.52],
  [0.95, '#2b3672', '#c98ba2', '#3a3070', 0.30],
  [1.00, '#6d82d6', '#ffc9a3', '#ff9a6a', 0.12],
].map(([at, a, b, c, k]) => ({ at, top: hex(a), bot: hex(b), tint: hex(c), k }));
function dayAt(d) {
  let i = 0; while (i < DAY.length - 2 && DAY[i + 1].at <= d) i++;
  const A = DAY[i], B = DAY[i + 1], t = (d - A.at) / (B.at - A.at || 1);
  return { top: mix(A.top, B.top, t), bot: mix(A.bot, B.bot, t), tint: mix(A.tint, B.tint, t), k: A.k + (B.k - A.k) * t };
}
const DAY_LENGTH = 150;   // seconds for a whole day

export class Scene {
  constructor() {
    this.t = 0; this.day = 0.14; this.key = ''; this.intro = 0;
    this.runners = []; this.nextRun = 2.5; this.birds = []; this.nextBirds = 4; this.petals = []; this.smoke = [];
  }

  build(W, H) {
    this.W = W; this.H = H; this.key = W + 'x' + H;
    const LW = Math.max(W * 2, 640);
    this.LW = LW;
    this.hz = Math.round(H * 0.6);                  // the horizon line
    this.far = this.mountains(LW, H, 0.30, 0.20, '#a8c4e8', '#8fb0dc', 11, true);
    this.mid = this.mountains(LW, H, 0.44, 0.10, '#7fa9c9', '#6a95b8', 23, false);
    this.hills = this.makeHills(LW, H);
    this.meadow = this.makeMeadow(LW, H);
    this.clouds = Array.from({ length: Math.ceil(W / 70) + 3 }, (_, i) => ({
      s: this.cloud(26 + Math.floor(hash(i, 3) * 46), i), x: hash(i, 5) * (W + 120) - 60, y: H * (0.06 + hash(i, 7) * 0.3), v: 2 + hash(i, 9) * 4, far: hash(i, 11) < 0.45,
    }));
    this.stars = Array.from({ length: Math.round(W * H / 260) }, (_, i) => ({ x: hash(i, 21) * W, y: hash(i, 23) * this.hz * 0.95, p: hash(i, 25) * 6.28, b: hash(i, 27) }));
  }

  // a jagged range: noise for the ridge, darker shading on the right faces, snow on the high peaks
  mountains(LW, H, top, amp, col, shade, seed, snow) {
    const c = canvasOf(LW, H), g = c.getContext('2d'), base = this.hz + 2, C = hex(col), S = hex(shade);
    const ridge = x => H * top + (noise(x / 46, seed) * 0.75 + noise(x / 15, seed + 1) * 0.25) * H * amp + (1 - Math.abs(Math.sin(x / LW * Math.PI * 3 + seed))) * H * amp * 0.9;
    for (let x = 0; x < LW; x++) {
      // wrap smoothly: blend the ends so the strip tiles
      const y0 = Math.round(x > LW - 40 ? ridge(x) + (ridge(x - LW) - ridge(x)) * (x - (LW - 40)) / 40 : ridge(x));
      const slope = (ridge(x + 4) - ridge(x - 4)) / 8;   // > 0: the face turned away from the light
      const shadeK = Math.max(0, Math.min(1, (slope + 0.05) / 0.3));
      for (let y = y0; y < base; y++) {
        const dith = ((x + y) & 1) ? 0.25 : -0.25;
        let k = shadeK + dith > 0.5 ? S : C;
        if (y === y0) k = mix(C, [255, 255, 255], 0.35);
        const deep = (y - y0) / (base - y0 + 1);
        if (deep > 0.6) k = mix(k, hex('#c4ebff'), (deep - 0.6) * 0.5);   // haze toward the foot
        if (snow && y < y0 + 4 && y0 < H * (top + amp * 0.55)) k = y < y0 + 2 || shadeK < 0.5 ? [240, 246, 255] : [205, 220, 240];
        g.fillStyle = rgb(k); g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  makeHills(LW, H) {
    const c = canvasOf(LW, H), g = c.getContext('2d'), top = H * 0.6, bottom = H * 0.8;
    const ridge = x => top + noise(x / 60, 41) * H * 0.08 + noise(x / 17, 42) * H * 0.02;
    for (let x = 0; x < LW; x++) {
      const y0 = Math.round(ridge(x));
      for (let y = y0; y < H; y++) { g.fillStyle = y < y0 + 2 ? '#8fd16a' : (hash(x, y) < 0.06 ? '#4f9a44' : '#62b552'); g.fillRect(x, y, 1, 1); }
    }
    // tree clusters along the ridge: round pixel crowns, light on the upper left
    const tree = (tx, ty, r) => {
      g.fillStyle = '#5a3a22'; g.fillRect(tx - 1, ty, 2, 4);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y * 1.1); if (d > r) continue;
        g.fillStyle = d > r - 1 ? '#1f5a34' : (x + y < -r * 0.5 ? '#4fae5c' : (hash(tx + x, ty + y) < 0.15 ? '#2a7040' : '#358a4a')); g.fillRect(tx + x, ty - r + y, 1, 1);
      }
    };
    for (let x = 6; x < LW - 6; x += 5 + Math.floor(hash(x, 51) * 9)) if (noise(x / 45, 52) > 0.42) tree(x, Math.round(ridge(x)) + 2, 3 + Math.floor(hash(x, 53) * 3));
    // the cottage (with a lit window at night, drawn separately) and the goal flag's hill
    const hx0 = Math.round(Math.min(LW * 0.1, this.W * 0.14)), fx0 = Math.round(this.W * 0.87);
    this.house = { x: hx0, y: Math.round(ridge(hx0)) + 1 };
    this.flag = { x: fx0, y: Math.round(ridge(fx0)) };
    const hx = this.house.x, hy = this.house.y;
    g.fillStyle = '#1c1424'; g.fillRect(hx - 11, hy - 13, 22, 14);
    g.fillStyle = '#f2e3c2'; g.fillRect(hx - 10, hy - 12, 20, 12);
    g.fillStyle = '#d9c39a'; g.fillRect(hx - 10, hy - 3, 20, 3);
    for (let i = 0; i < 9; i++) { g.fillStyle = '#1c1424'; g.fillRect(hx - 13 + i, hy - 13 - i, 26 - i * 2, 1); g.fillStyle = i % 2 ? '#c8484b' : '#b23a40'; g.fillRect(hx - 12 + i, hy - 13 - i, 24 - i * 2, 1); }
    g.fillStyle = '#1c1424'; g.fillRect(hx + 4, hy - 22, 4, 8); g.fillStyle = '#8a6a5a'; g.fillRect(hx + 5, hy - 21, 2, 7);
    g.fillStyle = '#6b4226'; g.fillRect(hx - 2, hy - 7, 4, 7); g.fillStyle = '#1c1424'; g.fillRect(hx - 8, hy - 9, 4, 4); g.fillRect(hx + 4, hy - 9, 4, 4);
    return c;
  }

  makeMeadow(LW, H) {
    const c = canvasOf(LW, H), g = c.getContext('2d'), top = Math.round(H * 0.8);
    this.pathY = Math.round(H * 0.9);
    for (let x = 0; x < LW; x++) for (let y = top; y < H; y++) {
      const n = hash(x, y);
      let col = y < top + 1 ? '#a6e07a' : n < 0.07 ? '#4ea43e' : n > 0.97 ? '#9be06e' : '#5fbf48';
      if (Math.abs(y - this.pathY) <= 2) col = n < 0.12 ? '#b07f45' : n > 0.95 ? '#e3c08a' : '#cfa064';   // the dirt path
      if (y === this.pathY - 3 || y === this.pathY + 3) col = '#4ea43e';
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    // a wooden fence along the back of the path: posts every 10 px, two rails
    const fy = this.pathY - 9;
    for (let x = 0; x < LW; x++) {
      g.fillStyle = '#5a3418'; g.fillRect(x, fy - 1, 1, 1); g.fillRect(x, fy + 3, 1, 1);
      g.fillStyle = '#c08a52'; g.fillRect(x, fy, 1, 1); g.fillStyle = '#a06c3c'; g.fillRect(x, fy + 4, 1, 1);
      if (x % 10 === 0) { g.fillStyle = '#5a3418'; g.fillRect(x - 1, fy - 4, 4, 11); g.fillStyle = '#d9a066'; g.fillRect(x, fy - 3, 2, 9); g.fillStyle = '#b07a46'; g.fillRect(x + 1, fy - 3, 1, 9); }
    }
    for (let i = 0; i < LW / 5; i++) {   // flowers
      const x = Math.floor(hash(i, 61) * LW), y = top + 2 + Math.floor(hash(i, 62) * (H - top - 3));
      if (Math.abs(y - this.pathY) < 5) continue;
      g.fillStyle = ['#ffd84a', '#ff7b8a', '#ffffff', '#c58bff'][Math.floor(hash(i, 63) * 4)]; g.fillRect(x, y, 1, 1);
      g.fillStyle = '#3f8a34'; g.fillRect(x, y + 1, 1, 1);
    }
    return c;
  }

  cloud(w, seed) {
    const h = Math.round(w * 0.42), c = canvasOf(w + 2, h + 2), g = c.getContext('2d');
    const puffs = Array.from({ length: 5 }, (_, i) => ({ x: w * (0.18 + i * 0.16), y: h * (0.6 - hash(seed, i) * 0.25), r: h * (0.3 + hash(seed, i + 9) * 0.25) }));
    puffs.push({ x: w * 0.5, y: h * 0.45, r: h * 0.45 });
    const inside = (x, y) => puffs.some(p => Math.hypot(x - p.x, (y - p.y) * 1.15) < p.r) && y < h * 0.86;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const lower = !inside(x, y + 3);
      g.fillStyle = lower ? '#d6e4f4' : (!inside(x, y - 2) ? '#ffffff' : '#f4f8ff'); g.fillRect(x + 1, y + 1, 1, 1);
    }
    return c;
  }

  // ---------- each frame
  draw(g, W, H, dt, lite) {
    if (this.key !== W + 'x' + H) this.build(W, H);
    this.t += dt; this.intro = Math.min(1, this.intro + dt / 2.8);
    this.day = (this.day + dt / DAY_LENGTH) % 1;
    const D = dayAt(this.day), night = Math.max(0, Math.min(1, (this.day - 0.68) / 0.08)) * Math.max(0, Math.min(1, (0.97 - this.day) / 0.06));
    const pan = (1 - ease(this.intro)) * H * 0.9;                 // opening: the camera tilts down from the sky
    const cx = this.t * 3;                                         // a slow drift to the right
    // sky
    const sky = g.createLinearGradient(0, 0, 0, this.hz + pan);
    sky.addColorStop(0, rgb(D.top)); sky.addColorStop(1, rgb(D.bot));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (night > 0) for (const s of this.stars) {
      const a = night * (0.45 + 0.55 * Math.sin(this.t * (1 + s.b * 2) + s.p));
      if (a <= 0.05) continue;
      g.globalAlpha = a; g.fillStyle = s.b > 0.8 ? '#fff6c8' : '#ffffff'; g.fillRect(Math.round(s.x), Math.round(s.y + pan * 0.2), 1, 1);
      if (s.b > 0.93) { g.fillRect(Math.round(s.x) - 1, Math.round(s.y + pan * 0.2), 3, 1); g.fillRect(Math.round(s.x), Math.round(s.y + pan * 0.2) - 1, 1, 3); }
    }
    g.globalAlpha = 1;
    this.drawSun(g, W, H, pan);
    // clouds, far ones slower and paler
    for (const c of this.clouds) {
      c.x += c.v * (c.far ? 0.5 : 1) * dt;
      if (c.x > W + 10) { c.x = -c.s.width - 10; c.y = H * (0.06 + Math.random() * 0.3); }
      g.globalAlpha = (c.far ? 0.75 : 0.95) * (1 - night * 0.6);
      g.drawImage(c.s, Math.round(c.x), Math.round(c.y + pan * (c.far ? 0.15 : 0.3)));
    }
    g.globalAlpha = 1;
    this.birdsStep(g, W, H, dt, pan, night);
    // the land, in layers that drift at different speeds
    if (!this.land || this.land.width !== W || this.land.height !== H) { this.land = canvasOf(W, H); this.lg = this.land.getContext('2d'); }
    const L = this.lg; L.clearRect(0, 0, W, H);
    const layer = (img, f, k) => { const off = Math.round((cx * f) % this.LW); const y = Math.round(pan * k); L.drawImage(img, -off, y); if (this.LW - off < W) L.drawImage(img, this.LW - off, y); };
    layer(this.far, 0.15, 0.55); layer(this.mid, 0.3, 0.7);
    layer(this.hills, 0.55, 0.85);
    this.drawHillLife(L, W, H, dt, cx * 0.55, pan * 0.85, night);
    layer(this.meadow, 1, 1);
    this.drawMeadowLife(L, W, H, dt, cx, pan, night, true);
    // light: warm at sunset, deep blue at night, on the land only (the sky keeps its own colours)
    if (D.k > 0.01) {
      L.globalCompositeOperation = 'source-atop'; L.globalAlpha = Math.min(0.85, D.k * 1.5);
      L.fillStyle = rgb(D.tint); L.fillRect(0, 0, W, H);
      L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1;
    }
    g.drawImage(this.land, 0, 0);
    // what glows stays bright at night: lit windows, fireflies, petals
    this.drawGlow(g, W, H, cx * 0.55, pan * 0.85, night);
    if (!lite) this.drawFloaters(g, W, H, dt, pan, night);
  }

  drawSun(g, W, H, pan) {
    const d = this.day, sunP = (d - 0.0) / 0.72, moonP = (d - 0.7) / 0.32;
    const body = (p, r, col, halo) => {
      if (p <= 0 || p >= 1) return;
      const x = Math.round(W * (0.12 + p * 0.76)), y = Math.round(this.hz - Math.sin(p * Math.PI) * H * 0.42 + pan * 0.25);
      for (const [rr, a] of halo) { g.globalAlpha = a; g.fillStyle = col; this.disc(g, x, y, rr); }
      g.globalAlpha = 1; g.fillStyle = col; this.disc(g, x, y, r);
      return { x, y };
    };
    const s = body(sunP, 8, '#fff2b0', [[16, 0.10], [12, 0.18]]);
    if (s) { g.fillStyle = '#ffffff'; this.disc(g, s.x - 2, s.y - 2, 3); }
    const m = body(moonP, 6, '#f2f4ff', [[11, 0.10]]);
    if (m) { g.fillStyle = '#c9cfe8'; g.fillRect(m.x + 1, m.y - 2, 2, 2); g.fillRect(m.x - 3, m.y + 1, 2, 2); }
  }
  disc(g, x, y, r) { for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); g.fillRect(x - w, y + j, w * 2 + 1, 1); } }

  birdsStep(g, W, H, dt, pan, night) {
    this.nextBirds -= dt;
    if (this.nextBirds <= 0 && night < 0.3) {
      this.nextBirds = 9 + Math.random() * 10;
      const n = 3 + Math.floor(Math.random() * 3), y = H * (0.12 + Math.random() * 0.25);
      for (let i = 0; i < n; i++) this.birds.push({ x: -10 - i * 7, y: y + (i % 2) * 4 + i, v: 16 + Math.random() * 4, p: Math.random() * 6 });
    }
    g.fillStyle = '#2b2440';
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]; b.x += b.v * dt; b.y += Math.sin(this.t * 2 + b.p) * dt * 2;
      if (b.x > W + 10) { this.birds.splice(i, 1); continue; }
      const x = Math.round(b.x), y = Math.round(b.y + pan * 0.3), up = Math.floor(this.t * 6 + b.p) % 2;
      g.fillRect(x - 2, y + (up ? -1 : 0), 2, 1); g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y + (up ? -1 : 0), 2, 1);
    }
  }

  // the cottage's window and smoke, and the goal flag waving on its hill
  drawHillLife(g, W, H, dt, off, pan, night) {
    const place = x => { let X = Math.round(x - (off % this.LW)); if (X < -40) X += this.LW; return X; };
    const hx = place(this.house.x), hy = Math.round(this.house.y + pan);
    g.fillStyle = '#9fd0ff';
    g.fillRect(hx - 7, hy - 8, 2, 2); g.fillRect(hx + 5, hy - 8, 2, 2);
    if (Math.random() < dt * 3) this.smoke.push({ x: this.house.x + 6, y: this.house.y - 23, life: 3 });
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]; s.life -= dt; s.y -= 5 * dt; s.x += 2.5 * dt;
      if (s.life <= 0) { this.smoke.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, s.life / 1.5) * 0.7; g.fillStyle = '#e8eef5';
      const sz = s.life > 2 ? 1 : 2; g.fillRect(place(s.x), Math.round(s.y + pan), sz, sz);
    }
    g.globalAlpha = 1;
    const f = SPR['goal' + (Math.floor(this.t * 3) % 2)];
    if (f) g.drawImage(f, place(this.flag.x) - 2, Math.round(this.flag.y + pan) - f.height + 2);
  }

  // grass blades swaying at the front, runners on the path, petals by day and fireflies by night
  drawMeadowLife(g, W, H, dt, cx, pan, night, lite) {
    const top = Math.round(H * 0.8 + pan), py = Math.round(this.pathY + pan);
    // runners
    this.nextRun -= dt;
    if (this.nextRun <= 0) {
      this.nextRun = 7 + Math.random() * 7;
      const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
      this.runners.push({ ch, x: -14, v: 62 + Math.random() * 18, y: 0, vy: 0, jumpAt: 40 + Math.random() * 80, bat: Math.random() < 0.35, t: 0 });
    }
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const r = this.runners[i]; r.t += dt; r.x += r.v * dt;
      if (r.x > r.jumpAt && r.y === 0) { r.vy = -95; r.jumpAt += 50 + Math.random() * 110; }
      if (r.vy || r.y) { r.vy += 260 * dt; r.y += r.vy * dt; if (r.y >= 0) { r.y = 0; r.vy = 0; } }
      if (r.x > W + 30) { this.runners.splice(i, 1); continue; }
      const frame = r.y < 0 ? (r.vy < 0 ? 'jump' : 'fall') : ['run0', 'run1', 'run2', 'run1'][Math.floor(r.t * 12) % 4];
      g.fillStyle = 'rgba(28,20,36,.25)'; g.fillRect(Math.round(r.x) - 4, py + 1, 9, 1);
      g.drawImage(charFrame(r.ch, frame, 1, 0), Math.round(r.x) - 6, py - 15 + Math.round(r.y));
      if (r.bat) {   // a little bat flapping after them
        const bx = Math.round(r.x - 20), by = py - 22 + Math.round(Math.sin(r.t * 7) * 3), up = Math.floor(r.t * 10) % 2;
        g.fillStyle = '#1c1424'; g.fillRect(bx - 1, by - 1, 3, 3);
        g.fillStyle = '#3a2c52'; g.fillRect(bx - 4, by + (up ? -2 : 0), 3, 1); g.fillRect(bx + 2, by + (up ? -2 : 0), 3, 1); g.fillRect(bx - 3, by - 1 + (up ? -1 : 1), 2, 1); g.fillRect(bx + 2, by - 1 + (up ? -1 : 1), 2, 1);
        g.fillStyle = '#ff5d6a'; g.fillRect(bx, by, 1, 1);
      }
    }
    // tall grass along the front edge, swaying in the breeze
    const sway = t => Math.round(Math.sin(t) * 1.2);
    for (let x = 0; x < W; x += 2) {
      const n = hash(Math.floor(x + cx) & 1023, 71), hgt = 3 + Math.floor(n * 5), y = H - 1;
      if (n < 0.35) continue;
      const s = sway(this.t * 1.6 + (x + cx) * 0.08);
      g.fillStyle = n > 0.8 ? '#8fd16a' : '#3f9a38';
      for (let k = 0; k < hgt; k++) g.fillRect(x + (k > hgt / 2 ? s : 0), y - k, 1, 1);
    }
  }

  drawGlow(g, W, H, off, pan, night) {
    if (night < 0.2) return;
    let hx = Math.round(this.house.x - (off % this.LW)); if (hx < -40) hx += this.LW;
    const hy = Math.round(this.house.y + pan);
    g.fillStyle = '#ffd84a'; g.fillRect(hx - 7, hy - 8, 2, 2); g.fillRect(hx + 5, hy - 8, 2, 2);
    g.globalAlpha = 0.25 * night; g.fillRect(hx - 9, hy - 10, 6, 6); g.fillRect(hx + 3, hy - 10, 6, 6); g.globalAlpha = 1;
  }

  drawFloaters(g, W, H, dt, pan, night) {
    const top = Math.round(H * 0.8 + pan);
    // petals by day, fireflies by night
    if (night < 0.5 && this.petals.length < W / 8 && Math.random() < dt * 4) this.petals.push({ x: Math.random() * W * 1.2, y: -4, v: 6 + Math.random() * 6, p: Math.random() * 6, c: Math.random() < 0.6 ? '#ffc0cf' : '#ffffff', fly: false });
    if (night > 0.5 && this.petals.filter(p => p.fly).length < 14 && Math.random() < dt * 3) this.petals.push({ x: Math.random() * W, y: top + Math.random() * (H - top - 6), v: 0, p: Math.random() * 6, fly: true, life: 3 + Math.random() * 3 });
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      if (p.fly) {
        p.life -= dt; p.x += Math.sin(this.t + p.p) * 6 * dt; p.y += Math.cos(this.t * 1.3 + p.p) * 4 * dt;
        if (p.life <= 0) { this.petals.splice(i, 1); continue; }
        g.globalAlpha = Math.max(0, Math.sin(this.t * 3 + p.p)) * Math.min(1, p.life);
        g.fillStyle = '#fff3a0'; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        g.globalAlpha *= 0.35; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
        g.globalAlpha = 1; continue;
      }
      p.y += p.v * dt; p.x += (-4 + Math.sin(this.t * 1.5 + p.p) * 6) * dt;
      if (p.y > H) { this.petals.splice(i, 1); continue; }
      g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), Math.floor(this.t * 4 + p.p) % 2 ? 2 : 1, 1);
    }
  }
}

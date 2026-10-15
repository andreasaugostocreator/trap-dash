// The menu world: living pixel landscapes behind the title and every menu (in the spirit of cozy farm-game title
// screens). Not a level. Four hand-made places take turns, one per day, fading over at dawn:
//   Spring Valley (a lake, a turning windmill, cherry trees), Autumn Woods (golden light, a farmhouse and pumpkins),
//   Winter Peaks (snowy pines, a cabin, an aurora at night) and Seaside Cliffs (rolling sea, a lighthouse, a boat).
// A day passes in DAY_LENGTH seconds: day, sunset, a starry night, dawn. Clouds drift, birds cross, the weather of
// the place falls (petals, leaves, snow, spray), fireflies glow at night, and now and then a runner dashes along the
// path, sometimes with a bat on their tail. It opens with a slow tilt down from the sky.
//
// Static scenery is painted once per place and size into tileable strips (periodic shapes, so they wrap), pixel by
// pixel with ordered dithering; only the living bits are drawn each frame.
import { CHARS, charFrame } from './sprites.js';

const TAU = Math.PI * 2;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const H = c => (Array.isArray(c) ? c : hex(c));

// A pixel buffer to paint scenery into, then turn into a canvas.
class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (y < 0 || y >= this.h) return;
    x = ((x % this.w) + this.w) % this.w;   // strips wrap around
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 1 || d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a >= 1 ? 255 : Math.round(a * 255); return; }
    d[i] = d[i] + (c[0] - d[i]) * a; d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * a; d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * a; d[i + 3] = Math.max(d[i + 3], a * 255);
  }
  has(x, y) { x = ((Math.round(x) % this.w) + this.w) % this.w; y = Math.round(y); return y >= 0 && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0; }
  canvas() { const c = canvasOf(this.w, this.h); c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0); return c; }
}
// a periodic wavy line (wraps over the strip width): sum of sines with whole periods
const wave = (LW, parts, seed) => x => parts.reduce((s, [amp, per], i) => s + amp * Math.sin(TAU * per * x / LW + hash(i, seed) * TAU), 0);

// ---------- time of day: sky top, sky horizon, the light over the land and how strong it is
const DAY = [
  [0.00, '#6d82d6', '#ffc9a3', '#ff9a6a', 0.14],
  [0.10, '#3f8ff5', '#bfe8ff', '#ffffff', 0.00],
  [0.56, '#3f8ff5', '#bfe8ff', '#ffffff', 0.00],
  [0.66, '#4a4fa8', '#ffa05e', '#ff7a3d', 0.22],
  [0.74, '#1e2156', '#7a4f8f', '#2c2266', 0.44],
  [0.86, '#0b0f2e', '#26315f', '#0b1030', 0.56],
  [0.95, '#2b3672', '#c98ba2', '#3a3070', 0.32],
  [1.00, '#6d82d6', '#ffc9a3', '#ff9a6a', 0.14],
].map(([at, a, b, c, k]) => ({ at, top: hex(a), bot: hex(b), tint: hex(c), k }));
function dayAt(d) {
  let i = 0; while (i < DAY.length - 2 && DAY[i + 1].at <= d) i++;
  const A = DAY[i], B = DAY[i + 1], t = (d - A.at) / (B.at - A.at || 1);
  return { top: mix(A.top, B.top, t), bot: mix(A.bot, B.bot, t), tint: mix(A.tint, B.tint, t), k: A.k + (B.k - A.k) * t };
}
const DAY_LENGTH = 150;

// ---------- the places
const PLACES = [
  { id: 'spring', name: 'Spring Valley', far: '#9fbde6', mid: '#7ea7c8', rock: '#6b8fb0', snow: true,
    hill: ['#a9e07a', '#79c454', '#5aa743', '#3f8a37'], meadow: ['#b2e886', '#6fc64e', '#58ad40', '#3f8f35'],
    trees: ['oak', 'oak', 'cherry', 'pine'], crown: ['#6cc45a', '#47a246', '#2f7f3c', '#1d5a30'], blossom: ['#ffd1dc', '#ffa9bf', '#ec7fa0', '#b8506f'],
    water: 'lake', landmark: 'windmill', weather: 'petals', path: ['#e6c48e', '#cfa064', '#b07f45'], flowers: ['#ffd84a', '#ff8fa3', '#ffffff', '#c58bff'] },
  { id: 'autumn', name: 'Autumn Woods', far: '#b9b0d8', mid: '#9a8fb8', rock: '#7d7299', snow: false, warm: 0.12,
    hill: ['#e0c46a', '#c9a94a', '#a98a3a', '#7d6a2c'], meadow: ['#d9c46e', '#b9a54a', '#9a8a3c', '#776a2e'],
    trees: ['oak', 'oak', 'birch', 'oak'], crown: ['#ffb347', '#f07a2a', '#c8482b', '#8a2c22'], crown2: ['#ffd84a', '#f0b52a', '#c88a1e', '#8a5a14'],
    water: null, landmark: 'farm', weather: 'leaves', path: ['#d8b07a', '#b98a52', '#94683a'], flowers: ['#ff9a3c', '#ffd84a', '#e8414f', '#ffffff'] },
  { id: 'winter', name: 'Winter Peaks', far: '#c6d6ee', mid: '#9fb6d8', rock: '#8199c0', snow: true, cold: true,
    hill: ['#ffffff', '#e8f1fb', '#cbdcf0', '#a9bfdc'], meadow: ['#ffffff', '#eef5fc', '#d6e4f4', '#b4c8e2'],
    trees: ['pine', 'pine', 'pine', 'birch'], crown: ['#5f9a7a', '#3f7a62', '#2a5a4a', '#183d34'],
    water: 'ice', landmark: 'cabin', weather: 'snow', path: ['#f2f6fb', '#d9e4f1', '#b7c7dd'], flowers: [] },
  { id: 'sea', name: 'Seaside Cliffs', far: '#a8c6e8', mid: '#86aed0', rock: '#a08a72', snow: false, cliffs: true,
    hill: ['#b9e98a', '#86cc5c', '#66b246', '#4a9238'], meadow: ['#bdeb8e', '#7ccc55', '#62b244', '#47913a'],
    trees: ['pine', 'oak', 'oak', 'pine'], crown: ['#6cc45a', '#47a246', '#2f7f3c', '#1d5a30'],
    water: 'sea', landmark: 'lighthouse', weather: 'spray', path: ['#f0dcb0', '#dcc08a', '#bf9f68'], flowers: ['#ffffff', '#ffd84a', '#8fd6ff', '#ff8fa3'] },
];

export class Scene {
  constructor() {
    this.t = 0; this.day = 0.14; this.key = ''; this.intro = 0;
    this.place = Math.floor(Math.random() * PLACES.length); this.fade = 1; this.old = null;
    this.runners = []; this.nextRun = 2.5; this.birds = []; this.nextBirds = 4; this.parts = []; this.smoke = []; this.flies = [];
  }
  get placeName() { return PLACES[this.place].name; }
  setPlace(i) { this.place = ((i % PLACES.length) + PLACES.length) % PLACES.length; this.key = ''; this.parts = []; }

  // ---------- painting a place (once per place and size)
  build(W, Hh) {
    const P = PLACES[this.place];
    this.W = W; this.H = Hh; this.key = `${W}x${Hh}:${this.place}`; this.P = P;
    this.hillTop = []; this.windows = null; this.lamp = null; this.hub = null; this.smoke = [];
    const LW = Math.max(Math.ceil(W * 2 / 64) * 64, 640);
    this.LW = LW; this.hz = Math.round(Hh * 0.58);
    this.farL = this.paintRange(LW, Hh, 0.28, 0.2, H(P.far), true, 11, 0.55);
    this.midL = this.paintRange(LW, Hh, 0.40, 0.13, H(P.mid), P.snow, 23, 0.3);
    this.waterL = this.paintWater(LW, Hh);
    this.hillL = this.paintHills(LW, Hh);
    this.meadowL = this.paintMeadow(LW, Hh);
    this.clouds = Array.from({ length: Math.ceil(W / 80) + 3 }, (_, i) => ({
      s: this.paintCloud(30 + Math.floor(hash(i, 3) * 50), i), x: hash(i, 5) * (W + 140) - 70, y: Hh * (0.05 + hash(i, 7) * 0.28), v: 2 + hash(i, 9) * 4, far: hash(i, 11) < 0.45,
    }));
    this.stars = Array.from({ length: Math.round(W * Hh / 240) }, (_, i) => ({ x: hash(i, 21) * W, y: hash(i, 23) * this.hz * 0.95, p: hash(i, 25) * 6.28, b: hash(i, 27) }));
    this.skyKey = '';
  }

  // a mountain range: periodic ridge, faces in light and shade (dithered between), rock strata on the shaded side,
  // snow caps with a shaded side, and haze toward the foot that melts into the horizon
  paintRange(LW, Hh, top, amp, col, snow, seed, haze) {
    const R = new Raster(LW, Hh), base = this.hz + 3;
    const ridge = wave(LW, [[1, 3], [0.55, 7], [0.25, 13], [0.12, 29]], seed);
    const y0 = x => Hh * top + (1 - (ridge(x) + 1.9) / 3.8) * Hh * amp * 2;
    const light = mix(col, [255, 255, 255], 0.22), shade = mix(col, [30, 40, 80], 0.22), strata = mix(col, [30, 40, 80], 0.32);
    const horizon = hex('#d6eefc');
    const snowLine = Hh * (top + amp * 0.75);
    for (let x = 0; x < LW; x++) {
      const yt = Math.round(y0(x)), slope = y0(x + 3) - y0(x - 3);
      for (let y = yt; y < base; y++) {
        const depth = (y - yt) / Math.max(1, base - yt);
        let c = slope > 0.4 ? shade : slope < -0.4 ? light : (bayer(x, y) < 0.5 + slope ? light : shade);
        if (slope > 0.4 && (y + Math.floor(x * 0.5)) % 6 === 0 && hash(x, y) < 0.7) c = strata;
        if (snow && yt < snowLine && y < yt + 3 + (hash(x, 3) * 3 | 0)) c = slope > 0.5 ? [205, 220, 240] : [244, 248, 255];
        if (y === yt) c = mix(c, [255, 255, 255], 0.25);
        c = mix(c, horizon, Math.min(1, Math.max(0, depth - 0.25) * haze * 1.4));
        R.set(x, y, c);
      }
    }
    return R.canvas();
  }

  // the lake (sky colours, darker, with a lighter rim) or the sea (deep blue toward the horizon); drawn under the hills
  paintWater(LW, Hh) {
    const P = this.P;
    if (!P.water) return null;
    const R = new Raster(LW, Hh), y0 = this.hz - 1, y1 = P.water === 'sea' ? Math.round(Hh * 0.78) : this.hz + 10;
    const C = P.water === 'sea' ? ['#2f7fc8', '#3f95dc', '#5aafea'] : P.water === 'ice' ? ['#bcd8f0', '#d2e6f7', '#e8f3fc'] : ['#4f97d8', '#6aaee6', '#8cc6f0'];
    for (let x = 0; x < LW; x++) for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const k = t + (bayer(x, y) - 0.5) * 0.35;
      R.set(x, y, H(C[k < 0.33 ? 2 : k < 0.66 ? 1 : 0]));
      if (y === y0) R.set(x, y, [235, 248, 255]);
    }
    return R.canvas();
  }

  paintHills(LW, Hh) {
    const P = this.P, R = new Raster(LW, Hh), hl = P.hill.map(H);
    const sea = P.water === 'sea';
    const ridge = wave(LW, [[1, 2], [0.5, 5], [0.2, 11]], 41);
    const top = x => (sea ? Hh * 0.74 : Hh * 0.6) + ridge(x) * Hh * (sea ? 0.02 : 0.05);
    // seaside: the land rises from the right as cliffs with a beach under them
    for (let x = 0; x < LW; x++) {
      let yt = Math.round(top(x));
      if (P.water === 'lake' || P.water === 'ice') { const lc = this.W * 0.84 / LW, lw = this.W * 0.16 / LW, f = (x / LW) % 1; if (Math.abs(f - lc) < lw) yt = Math.max(yt, this.hz + 9 + Math.round(Math.cos((f - lc) / lw * Math.PI / 2) * -6)); }
      for (let y = yt; y < Hh; y++) {
        const d = (y - yt) / (Hh - yt + 1), k = d * 3 + (bayer(x, y) - 0.5) * 0.9;
        let c = y < yt + 1 ? hl[0] : hl[Math.min(3, 1 + Math.floor(k))];
        if (!P.cold && hash(x, y) < 0.04) c = hl[3];
        R.set(x, y, c);
      }
      this.hillTop[x] = yt;
    }
    // trees in clusters along the hills (none over the lake or the sea)
    for (let x = 4; x < LW - 4; x += 4 + Math.floor(hash(x, 51) * 7)) {
      if (Math.sin(TAU * x / LW * 3 + 1) < -0.15 || hash(x, 52) < 0.25) continue;
      const yt = this.hillTop[x];
      if (yt > this.hz + 8 && (P.water === 'lake' || P.water === 'ice')) continue;
      const kind = P.trees[Math.floor(hash(x, 53) * P.trees.length)], s = 0.7 + hash(x, 54) * 0.6;
      this.tree(R, x, yt + 2, kind, s, x);
    }
    // the landmark, on the left third so the menu never hides it
    const lx = Math.round(this.W * 0.13), ly = this.hillTop[lx];
    this.landmark = { x: lx, y: ly };
    this.paintLandmark(R, lx, ly);
    return R.canvas();
  }

  tree(R, x, y, kind, s, seed) {
    const P = this.P;
    if (kind === 'pine') {
      const h = Math.round(14 * s), cr = P.crown.map(H);
      for (let j = 0; j < h; j++) {
        const w = Math.round((j / h) * 5 * s) + 1, yy = y - h + j;
        for (let i = -w; i <= w; i++) {
          const edge = Math.abs(i) === w, c = edge ? cr[3] : i < -w / 3 ? cr[1] : i > w / 3 ? cr[2] : cr[1];
          R.set(x + i, yy, (j % 4 === 3 && !edge) ? cr[2] : c);
          if (P.cold && j % 4 === 0 && i < 0 && !edge) R.set(x + i, yy, [244, 248, 255]);
        }
      }
      for (let j = 0; j < 3; j++) R.set(x, y + j, [90, 58, 34]);
      if (P.cold) R.set(x, y - h, [255, 255, 255]);
      return;
    }
    const trunk = kind === 'birch' ? [236, 236, 228] : [104, 70, 40];
    const th = Math.round(5 * s);
    for (let j = 0; j < th; j++) { R.set(x, y - j, trunk); R.set(x + 1, y - j, kind === 'birch' ? [190, 190, 180] : [74, 48, 28]); if (kind === 'birch' && j % 3 === 1) R.set(x, y - j, [40, 40, 40]); }
    let cr = (kind === 'cherry' ? P.blossom : P.crown).map(H);
    if (P.crown2 && hash(seed, 7) < 0.45) cr = P.crown2.map(H);
    // a crown of 3-5 overlapping leaf clusters, lit from the upper left, with a dark rim and dithered shading
    const r0 = (kind === 'birch' ? 4 : 5) * s, cy = y - th - r0 + 1, blobs = [[0, 0, r0]];
    for (let k = 0; k < 3 + Math.floor(hash(seed, 9) * 2); k++) blobs.push([(hash(seed, 10 + k) - 0.5) * r0 * 1.6, (hash(seed, 20 + k) - 0.6) * r0 * 1.1, r0 * (0.55 + hash(seed, 30 + k) * 0.35)]);
    const inside = (px, py) => blobs.some(([bx, by, br]) => Math.hypot(px - bx, (py - by) * 1.1) <= br);
    const ext = Math.ceil(r0 * 2.2);
    for (let py = -ext; py <= ext; py++) for (let px = -ext; px <= ext; px++) {
      if (!inside(px, py)) continue;
      const rim = !inside(px + 1, py) || !inside(px, py + 1) || !inside(px - 1, py) || !inside(px, py - 1);
      const l = (-px * 0.55 - py * 0.8) / (r0 * 1.2) + (bayer(x + px, cy + py) - 0.5) * 0.5;
      let c = rim ? (py > 0 || px > 0 ? cr[3] : cr[2]) : l > 0.45 ? cr[0] : l > -0.1 ? cr[1] : cr[2];
      if (!rim && hash(x + px, cy + py) < 0.06) c = cr[3];
      R.set(x + px, cy + py, c);
    }
  }

  paintLandmark(R, x, y) {
    const P = this.P, K = [28, 20, 36];
    const rect = (x0, y0, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) R.set(x0 + i, y0 + j, H(c)); };
    if (P.landmark === 'windmill') {   // a stone tower (blades are drawn turning, each frame)
      for (let j = 0; j < 24; j++) { const w = 4 + Math.floor(j / 5); rect(x - w - 1, y - 24 + j, 1, 1, K); rect(x - w, y - 24 + j, w * 2, 1, j % 5 === 0 ? '#d9cbb0' : '#efe4cc'); rect(x + w - 2, y - 24 + j, 2, 1, '#cbb995'); rect(x + w, y - 24 + j, 1, 1, K); }
      for (let i = 0; i < 12; i++) rect(x - 6 + i, y - 27 + Math.abs(i - 6) / 2, 1, 3, i < 6 ? '#b23a40' : '#8f2c33');
      rect(x - 2, y - 7, 4, 7, '#6b4226'); rect(x - 1, y - 16, 3, 3, '#4f97d8');
      this.hub = { x, y: y - 22 };
    } else if (P.landmark === 'farm') {   // a red barn and a pumpkin patch
      rect(x - 13, y - 14, 26, 15, K); rect(x - 12, y - 13, 24, 13, '#b23a32'); rect(x - 12, y - 4, 24, 4, '#8f2c28');
      for (let i = 0; i < 10; i++) rect(x - 14 + i, y - 14 - i, 28 - i * 2, 1, i === 0 ? '#1c1424' : i % 2 ? '#5a3a2a' : '#6b4630');
      rect(x - 5, y - 10, 10, 10, '#f2e3c2'); rect(x - 4, y - 9, 8, 9, '#8f2c28'); for (let i = 0; i < 8; i++) { R.set(x - 4 + i, y - 9 + i, H('#f2e3c2')); R.set(x + 3 - i, y - 9 + i, H('#f2e3c2')); }
      for (let k = 0; k < 6; k++) { const px = x + 16 + k * 5, py = y + 2 + (k % 2); rect(px - 2, py - 2, 4, 3, '#f07a2a'); rect(px - 1, py - 3, 2, 1, '#ff9a3c'); R.set(px, py - 4, H('#3f8a37')); R.set(px - 2, py, H('#c8482b')); }
      this.hub = { x: x + 6, y: y - 22 };
    } else if (P.landmark === 'cabin') {   // a log cabin under snow
      rect(x - 12, y - 12, 24, 13, K); for (let j = 0; j < 11; j++) rect(x - 11, y - 11 + j, 22, 1, j % 2 ? '#7a4a28' : '#8f5a32');
      for (let i = 0; i < 9; i++) { rect(x - 14 + i, y - 12 - i, 28 - i * 2, 1, K); rect(x - 13 + i, y - 12 - i, 26 - i * 2, 1, i < 3 ? '#ffffff' : '#e8f1fb'); }
      rect(x - 2, y - 7, 4, 7, '#5a3418'); rect(x + 5, y - 22, 3, 7, K); rect(x + 6, y - 21, 1, 6, '#8a6a5a'); rect(x + 5, y - 23, 3, 1, '#ffffff');
      this.windows = [[x - 8, y - 8], [x + 5, y - 8]];
      this.hub = { x: x + 6, y: y - 24 };
    } else if (P.landmark === 'lighthouse') {   // red and white stripes on a rock (the beam turns at night)
      rect(x - 7, y - 3, 14, 4, '#8a7a66'); rect(x - 6, y - 4, 12, 1, '#a89a84');
      for (let j = 0; j < 26; j++) { const w = 3 + Math.floor(j / 9); rect(x - w - 1, y - 30 + j, w * 2 + 2, 1, K); rect(x - w, y - 30 + j, w * 2, 1, Math.floor(j / 5) % 2 ? '#e8414f' : '#f4f4ee'); rect(x + w - 1, y - 30 + j, 1, 1, Math.floor(j / 5) % 2 ? '#b02a3a' : '#c8c8c0'); }
      rect(x - 4, y - 37, 8, 7, K); rect(x - 3, y - 36, 6, 5, '#fff6c8'); rect(x - 5, y - 38, 10, 1, K); rect(x - 2, y - 40, 4, 2, '#e8414f');
      this.lamp = { x, y: y - 34 };
      this.hub = null;
    }
  }

  paintMeadow(LW, Hh) {
    const P = this.P, R = new Raster(LW, Hh), md = P.meadow.map(H), pa = P.path.map(H);
    const top = Math.round(Hh * 0.8), py = Math.round(Hh * 0.905);
    this.pathY = py;
    const edge = wave(LW, [[1.2, 9], [0.6, 23]], 61);
    for (let x = 0; x < LW; x++) {
      const yt = top + Math.round(edge(x));
      for (let y = yt; y < Hh; y++) {
        const d = (y - yt) / (Hh - yt), k = d * 2.5 + (bayer(x, y) - 0.5) * 0.8;
        let c = y === yt ? md[0] : md[Math.min(3, 1 + Math.floor(k))];
        if (hash(x, y) < 0.05) c = md[3]; else if (hash(x, y) > 0.975) c = md[0];
        const pd = Math.abs(y - py);
        if (pd <= 3) {   // the path: worn in the middle, with pebbles
          c = pd === 3 ? mix(c, pa[2], 0.6) : pd <= 1 ? pa[0] : pa[1];
          if (hash(x, y + 7) < 0.06) c = pa[2];
          if (hash(x, y + 9) > 0.985) c = [236, 236, 228];
        }
        R.set(x, y, c);
      }
    }
    // a split-rail fence along the back of the path, shaded, with a shadow on the grass
    const fy = py - 10, wood = P.cold ? ['#c8a07a', '#a07a52', '#6b4a30'] : ['#d9a066', '#b07a46', '#6b4226'];
    for (let x = 0; x < LW; x++) {
      R.set(x, fy - 1, H(wood[2])); R.set(x, fy, H(wood[0])); R.set(x, fy + 1, H(wood[1]));
      R.set(x, fy + 4, H(wood[2])); R.set(x, fy + 5, H(wood[0])); R.set(x, fy + 6, H(wood[1]));
      R.set(x, fy + 9, md[3], 0.5);
      if (P.cold) R.set(x, fy - 2, [255, 255, 255]);
      if (x % 14 === 0) for (let j = -5; j < 10; j++) { R.set(x - 1, fy + j, H(wood[2])); R.set(x, fy + j, H(wood[0])); R.set(x + 1, fy + j, H(wood[1])); R.set(x + 2, fy + j, H(wood[2])); if (P.cold && j === -5) { R.set(x, fy - 6, [255, 255, 255]); R.set(x + 1, fy - 6, [255, 255, 255]); } }
    }
    // bushes, flower clumps and mushrooms in the meadow
    for (let i = 0; i < LW / 26; i++) {
      const bx = Math.floor(hash(i, 71) * LW), by = top + 3 + Math.floor(hash(i, 72) * (fy - top - 8));
      const br = 3 + hash(i, 73) * 3, cr = (P.cold ? ['#f4f8ff', '#dde8f5', '#b9cbe3', '#93a9c9'] : P.crown).map(H);
      for (let yy = -br; yy <= 1; yy++) for (let xx = -br * 1.6; xx <= br * 1.6; xx++) {
        const d = Math.hypot(xx / 1.6, yy); if (d > br) continue;
        const l = (-xx * 0.4 - yy) / br + (bayer(bx + xx, by + yy) - 0.5) * 0.6;
        R.set(bx + xx, by + yy, d > br - 1 ? cr[3] : l > 0.5 ? cr[0] : l > -0.2 ? cr[1] : cr[2]);
      }
      if (P.id === 'spring' && hash(i, 74) < 0.5) for (let k = 0; k < 4; k++) R.set(bx - 3 + k * 2, by - br + 1 + (k % 2), H('#ff8fa3'));
    }
    if (P.flowers.length) for (let i = 0; i < LW / 4; i++) {
      const x = Math.floor(hash(i, 61) * LW), y = top + 3 + Math.floor(hash(i, 62) * (Hh - top - 5));
      if (Math.abs(y - py) < 5 || Math.abs(y - fy - 2) < 7) continue;
      const c = H(P.flowers[Math.floor(hash(i, 63) * P.flowers.length)]);
      R.set(x, y, c); R.set(x, y + 1, md[3]);
      if (hash(i, 64) < 0.3) { R.set(x - 1, y, c); R.set(x + 1, y, c); R.set(x, y - 1, c); R.set(x, y, [255, 240, 150]); }
    }
    if (P.id === 'autumn') for (let i = 0; i < LW / 14; i++) { const x = Math.floor(hash(i, 81) * LW), y = top + 4 + Math.floor(hash(i, 82) * (Hh - top - 6)); if (Math.abs(y - py) > 4) { R.set(x, y, H('#e8414f')); R.set(x + 1, y, H('#c8482b')); R.set(x, y + 1, H('#f2e3c2')); } }
    return R.canvas();
  }

  paintCloud(w, seed) {
    const h = Math.round(w * 0.42), R = new Raster(w + 2, h + 2);
    const puffs = Array.from({ length: 5 }, (_, i) => ({ x: w * (0.16 + i * 0.17), y: h * (0.62 - hash(seed, i) * 0.25), r: h * (0.28 + hash(seed, i + 9) * 0.25) }));
    puffs.push({ x: w * 0.5, y: h * 0.45, r: h * 0.45 });
    const inside = (x, y) => puffs.some(p => Math.hypot(x - p.x, (y - p.y) * 1.15) < p.r) && y < h * 0.86;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const under = !inside(x, y + 3), lit = !inside(x - 1, y - 2);
      const k = under ? 2 : lit ? 0 : (bayer(x, y) < (y / h) * 0.9 ? 1 : 0);
      R.set(x + 1, y + 1, [[255, 255, 255], [238, 244, 252], [206, 220, 240]][k]);
    }
    return R.canvas();
  }

  // ---------- each frame
  draw(g, W, Hh, dt, lite) {
    if (this.key !== `${W}x${Hh}:${this.place}`) this.build(W, Hh);
    this.t += dt; this.intro = Math.min(1, this.intro + dt / 2.8);
    const before = this.day;
    this.day = (this.day + dt / DAY_LENGTH) % 1;
    if (before > 0.96 && this.day < 0.5) this.nextPlace(W, Hh);   // a new place every dawn
    const D = dayAt(this.day), night = Math.max(0, Math.min(1, (this.day - 0.68) / 0.08)) * Math.max(0, Math.min(1, (0.97 - this.day) / 0.06));
    const pan = (1 - ease(this.intro)) * Hh * 0.9, cx = this.t * 3;
    this.drawSky(g, W, Hh, D, pan, night);
    this.drawSun(g, W, Hh, pan);
    this.drawClouds(g, W, Hh, dt, pan, night);
    this.drawBirds(g, W, Hh, dt, pan, night);
    // the land of this place, faded in over the last one at a change
    const land = this.paintLand(W, Hh, dt, cx, pan, night, D, lite);
    if (this.fade < 1 && this.old) { g.drawImage(this.old, 0, 0); g.globalAlpha = ease(this.fade); g.drawImage(land, 0, 0); g.globalAlpha = 1; this.fade = Math.min(1, this.fade + dt / 2.5); }
    else g.drawImage(land, 0, 0);
    this.drawGlow(g, W, Hh, cx, pan, night);
    if (!lite) this.drawWeather(g, W, Hh, dt, pan, night);
  }

  nextPlace(W, Hh) {
    this.old = canvasOf(W, Hh); this.old.getContext('2d').drawImage(this.land, 0, 0);
    this.setPlace(this.place + 1); this.fade = 0; this.build(W, Hh);
  }

  // sky in dithered bands (pixel-art style) with a glow around the horizon; cached while the colours don't change
  drawSky(g, W, Hh, D, pan, night) {
    const key = `${W}x${Hh}:${Math.round(this.day * 200)}:${Math.round(pan)}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      if (!this.skyC || this.skyC.width !== W || this.skyC.height !== Hh) this.skyC = canvasOf(W, Hh);
      const x = this.skyC.getContext('2d'), img = x.createImageData(W, Hh), d = img.data, end = this.hz + pan, STEPS = 7;
      for (let y = 0; y < Hh; y++) {
        const t = Math.min(1, Math.max(0, y / end)), f = Math.pow(t, 1.5) * STEPS;
        for (let px = 0; px < W; px++) {
          const s = Math.min(STEPS, Math.floor(f + bayer(px, y) - 0.5 + 0.5)), c = mix(D.top, D.bot, s / STEPS), i = (y * W + px) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
    }
    g.drawImage(this.skyC, 0, 0);
    if (night > 0) {
      for (const s of this.stars) {
        const a = night * (0.45 + 0.55 * Math.sin(this.t * (1 + s.b * 2) + s.p));
        if (a <= 0.05) continue;
        const sx = Math.round(s.x), sy = Math.round(s.y + pan * 0.2);
        g.globalAlpha = a; g.fillStyle = s.b > 0.8 ? '#fff6c8' : '#ffffff'; g.fillRect(sx, sy, 1, 1);
        if (s.b > 0.93) { g.fillRect(sx - 1, sy, 3, 1); g.fillRect(sx, sy - 1, 1, 3); }
      }
      if (this.P.cold) {   // the aurora: soft green and violet curtains swaying
        for (let x = 0; x < W; x += 2) {
          const y = Hh * 0.18 + Math.sin(x * 0.03 + this.t * 0.4) * 8 + Math.sin(x * 0.011 - this.t * 0.2) * 10;
          const h = 14 + Math.sin(x * 0.05 + this.t) * 6;
          for (let j = 0; j < h; j += 1) { g.globalAlpha = night * 0.22 * (1 - j / h) * (0.6 + 0.4 * Math.sin(x * 0.07 + this.t * 0.8)); g.fillStyle = j < h * 0.4 ? '#7dffb0' : '#9a7dff'; g.fillRect(x, Math.round(y + j), 2, 1); }
        }
      }
      g.globalAlpha = 1;
    }
  }

  drawSun(g, W, Hh, pan) {
    const d = this.day;
    const body = (p, r, col, halo) => {
      if (p <= 0 || p >= 1) return null;
      const x = Math.round(W * (0.12 + p * 0.76)), y = Math.round(this.hz - Math.sin(p * Math.PI) * Hh * 0.42 + pan * 0.25);
      for (const [rr, a] of halo) { g.globalAlpha = a; g.fillStyle = col; this.disc(g, x, y, rr); }
      g.globalAlpha = 1; g.fillStyle = col; this.disc(g, x, y, r);
      return { x, y };
    };
    const s = body(d / 0.72, 8, '#fff2b0', [[18, 0.07], [13, 0.14]]);
    if (s) { g.fillStyle = '#ffffff'; this.disc(g, s.x - 2, s.y - 2, 3); }
    const m = body((d - 0.7) / 0.32, 6, '#f2f4ff', [[11, 0.10]]);
    if (m) { g.fillStyle = '#c9cfe8'; g.fillRect(m.x + 1, m.y - 2, 2, 2); g.fillRect(m.x - 3, m.y + 1, 2, 2); g.fillRect(m.x, m.y + 3, 1, 1); }
    this.sunPos = s;
  }
  disc(g, x, y, r) { for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); g.fillRect(x - w, y + j, w * 2 + 1, 1); } }

  drawClouds(g, W, Hh, dt, pan, night) {
    for (const c of this.clouds) {
      c.x += c.v * (c.far ? 0.5 : 1) * dt;
      if (c.x > W + 10) { c.x = -c.s.width - 10; c.y = Hh * (0.05 + Math.random() * 0.28); }
      g.globalAlpha = (c.far ? 0.7 : 0.95) * (1 - night * 0.6);
      g.drawImage(c.s, Math.round(c.x), Math.round(c.y + pan * (c.far ? 0.15 : 0.3)));
    }
    g.globalAlpha = 1;
  }

  drawBirds(g, W, Hh, dt, pan, night) {
    this.nextBirds -= dt;
    if (this.nextBirds <= 0 && night < 0.3) {
      this.nextBirds = 9 + Math.random() * 10;
      const n = 3 + Math.floor(Math.random() * 3), y = Hh * (0.12 + Math.random() * 0.25), gull = this.P.water === 'sea';
      for (let i = 0; i < n; i++) this.birds.push({ x: -10 - i * 7, y: y + (i % 2) * 4 + i, v: 16 + Math.random() * 4, p: Math.random() * 6, gull });
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]; b.x += b.v * dt; b.y += Math.sin(this.t * 2 + b.p) * dt * 2;
      if (b.x > W + 10) { this.birds.splice(i, 1); continue; }
      const x = Math.round(b.x), y = Math.round(b.y + pan * 0.3), up = Math.floor(this.t * 6 + b.p) % 2;
      g.fillStyle = b.gull ? '#ffffff' : '#2b2440';
      g.fillRect(x - 2, y + (up ? -1 : 0), 2, 1); g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y + (up ? -1 : 0), 2, 1);
      if (b.gull) { g.fillStyle = '#5d6475'; g.fillRect(x - 2, y + (up ? -1 : 0), 1, 1); g.fillRect(x + 2, y + (up ? -1 : 0), 1, 1); }
    }
  }

  // land layers, the place's living details and the light of the hour (on the land only), into one canvas
  paintLand(W, Hh, dt, cx, pan, night, D, lite) {
    if (!this.land || this.land.width !== W || this.land.height !== Hh) { this.land = canvasOf(W, Hh); this.lg = this.land.getContext('2d'); }
    const L = this.lg; L.clearRect(0, 0, W, Hh);
    const layer = (img, f, k) => { if (!img) return; const off = Math.round((cx * f) % this.LW), y = Math.round(pan * k); L.drawImage(img, -off, y); if (this.LW - off < W) L.drawImage(img, this.LW - off, y); };
    layer(this.farL, 0.12, 0.55); layer(this.midL, 0.25, 0.7);
    layer(this.waterL, 0.4, 0.8);
    this.drawWaterLife(L, W, Hh, cx * 0.4, pan * 0.8);
    layer(this.hillL, 0.5, 0.85);
    this.drawLandmarkLife(L, W, Hh, dt, cx * 0.5, pan * 0.85, night);
    layer(this.meadowL, 1, 1);
    this.drawPathLife(L, W, Hh, dt, cx, pan);
    // light of the hour; autumn is golden all day, winter a little blue
    const warm = this.P.warm || 0, cold = this.P.cold ? 0.08 : 0;
    if (D.k > 0.01 || warm || cold) {
      L.globalCompositeOperation = 'source-atop';
      if (warm) { L.globalAlpha = warm * (1 - D.k); L.fillStyle = '#ffb84a'; L.fillRect(0, 0, W, Hh); }
      if (cold) { L.globalAlpha = cold * (1 - D.k); L.fillStyle = '#6a9cff'; L.fillRect(0, 0, W, Hh); }
      if (D.k > 0.01) { L.globalAlpha = Math.min(0.85, D.k * 1.5); L.fillStyle = rgb(D.tint); L.fillRect(0, 0, W, Hh); }
      L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1;
    }
    return this.land;
  }

  // ripples and the sun's glitter on the water, waves breaking on the beach, a sailboat
  drawWaterLife(L, W, Hh, off, pan) {
    const P = this.P; if (!P.water) return;
    const y0 = this.hz - 1 + pan, y1 = (P.water === 'sea' ? Math.round(Hh * 0.78) : this.hz + 10) + pan;
    for (let i = 0; i < W / 6; i++) {
      const x = Math.round((hash(i, 91) * W + this.t * (4 + hash(i, 92) * 6)) % W), y = Math.round(y0 + 2 + hash(i, 93) * (y1 - y0 - 3));
      const a = 0.35 + 0.35 * Math.sin(this.t * 2 + i);
      L.globalAlpha = P.water === 'ice' ? 0.5 : a; L.fillStyle = '#ffffff'; L.fillRect(x, y, P.water === 'ice' ? 1 : 2 + (i % 3), 1);
    }
    if (this.sunPos && P.water !== 'ice') {   // a glitter path under the sun
      for (let y = Math.round(y0 + 1); y < y1; y += 2) { L.globalAlpha = 0.5 * Math.max(0, Math.sin(this.t * 3 + y)); L.fillStyle = '#fff6c8'; L.fillRect(this.sunPos.x - 3 + ((y * 7) % 5), y, 3 + ((y * 3) % 4), 1); }
    }
    L.globalAlpha = 1;
    if (P.water === 'sea') {
      // the sailboat drifting along the horizon
      const bx = Math.round(((this.t * 2.5 + W * 0.6) % (W + 40)) - 20), by = Math.round(this.hz + 3 + pan);
      L.fillStyle = '#5a3418'; L.fillRect(bx - 5, by, 11, 2); L.fillStyle = '#7a4a28'; L.fillRect(bx - 4, by + 2, 9, 1);
      L.fillStyle = '#1c1424'; L.fillRect(bx, by - 9, 1, 9); L.fillStyle = '#ffffff'; for (let j = 0; j < 7; j++) L.fillRect(bx + 1, by - 8 + j, Math.ceil(j * 0.7) + 1, 1);
      L.fillStyle = '#e8414f'; L.fillRect(bx, by - 10, 2, 1);
      // foam where the waves meet the beach
      for (let x = 0; x < W; x++) {
        const f = Math.sin(x * 0.12 + this.t * 1.6) + Math.sin(x * 0.05 - this.t * 0.9);
        if (f > 0.9) { L.fillStyle = '#ffffff'; L.fillRect(x, Math.round(y1 - 2 + Math.sin(this.t * 1.6 + x * 0.12)), 1, 1); }
      }
    }
  }

  // the windmill's blades, the lighthouse beam, chimney smoke
  drawLandmarkLife(L, W, Hh, dt, off, pan, night) {
    const place = x => { let X = Math.round(x - (off % this.LW)); if (X < -60) X += this.LW; return X; };
    const P = this.P;
    if (P.landmark === 'windmill' && this.hub) {
      const hx = place(this.hub.x), hy = Math.round(this.hub.y + pan), a = this.t * 0.9;
      for (let k = 0; k < 4; k++) {
        const ang = a + k * TAU / 4, ca = Math.cos(ang), sa = Math.sin(ang);
        for (let r = 2; r < 15; r++) {
          const x = Math.round(hx + ca * r), y = Math.round(hy + sa * r);
          L.fillStyle = '#5a3a22'; L.fillRect(x, y, 1, 1);
          if (r > 4) { const sx = Math.round(hx + ca * r - sa * 2), sy = Math.round(hy + sa * r + ca * 2); L.fillStyle = r % 3 ? '#f2e3c2' : '#d9c39a'; L.fillRect(sx, sy, 1, 1); L.fillRect(Math.round(hx + ca * r - sa), Math.round(hy + sa * r + ca), 1, 1); }
        }
      }
      L.fillStyle = '#1c1424'; L.fillRect(hx - 1, hy - 1, 3, 3); L.fillStyle = '#8a6a5a'; L.fillRect(hx, hy, 1, 1);
    }
    if (this.hub && P.landmark !== 'windmill') {   // chimney smoke
      if (Math.random() < dt * 3) this.smoke.push({ x: this.hub.x, y: this.hub.y, life: 3 });
      for (let i = this.smoke.length - 1; i >= 0; i--) {
        const s = this.smoke[i]; s.life -= dt; s.y -= 5 * dt; s.x += 2.5 * dt;
        if (s.life <= 0) { this.smoke.splice(i, 1); continue; }
        L.globalAlpha = Math.min(1, s.life / 1.5) * 0.7; L.fillStyle = '#e8eef5';
        const sz = s.life > 2 ? 1 : 2; L.fillRect(place(s.x), Math.round(s.y + pan), sz, sz);
      }
      L.globalAlpha = 1;
    }
  }

  // runners on the path and the grass at the very front, swaying
  drawPathLife(L, W, Hh, dt, cx, pan) {
    const py = Math.round(this.pathY + pan);
    this.nextRun -= dt;
    if (this.nextRun <= 0) {
      this.nextRun = 7 + Math.random() * 7;
      this.runners.push({ ch: CHARS[Math.floor(Math.random() * CHARS.length)], x: -14, v: 62 + Math.random() * 18, y: 0, vy: 0, jumpAt: 40 + Math.random() * 80, bat: Math.random() < 0.35, t: 0 });
    }
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const r = this.runners[i]; r.t += dt; r.x += r.v * dt;
      if (r.x > r.jumpAt && r.y === 0) { r.vy = -95; r.jumpAt += 50 + Math.random() * 110; }
      if (r.vy || r.y) { r.vy += 260 * dt; r.y += r.vy * dt; if (r.y >= 0) { r.y = 0; r.vy = 0; } }
      if (r.x > W + 30) { this.runners.splice(i, 1); continue; }
      const frame = r.y < 0 ? (r.vy < 0 ? 'jump' : 'fall') : ['run0', 'run1', 'run2', 'run1'][Math.floor(r.t * 12) % 4];
      L.fillStyle = 'rgba(28,20,36,.25)'; L.fillRect(Math.round(r.x) - 4, py + 1, 9, 1);
      L.drawImage(charFrame(r.ch, frame, 1, 0), Math.round(r.x) - 6, py - 15 + Math.round(r.y));
      if (r.bat) {
        const bx = Math.round(r.x - 20), by = py - 22 + Math.round(Math.sin(r.t * 7) * 3), up = Math.floor(r.t * 10) % 2;
        L.fillStyle = '#1c1424'; L.fillRect(bx - 1, by - 1, 3, 3);
        L.fillStyle = '#3a2c52'; L.fillRect(bx - 4, by + (up ? -2 : 0), 3, 1); L.fillRect(bx + 2, by + (up ? -2 : 0), 3, 1); L.fillRect(bx - 3, by - 1 + (up ? -1 : 1), 2, 1); L.fillRect(bx + 2, by - 1 + (up ? -1 : 1), 2, 1);
        L.fillStyle = '#ff5d6a'; L.fillRect(bx, by, 1, 1);
      }
    }
    const md = this.P.meadow;
    for (let x = 0; x < W; x += 2) {
      const n = hash(Math.floor(x + cx) & 1023, 71), hgt = 3 + Math.floor(n * 6);
      if (n < 0.3) continue;
      const s = Math.round(Math.sin(this.t * 1.6 + (x + cx) * 0.08) * 1.3);
      L.fillStyle = n > 0.8 ? md[0] : md[3];
      for (let k = 0; k < hgt; k++) L.fillRect(x + (k > hgt / 2 ? s : 0), Hh - 1 - k, 1, 1);
    }
  }

  // what glows stays bright at night: lit windows, the lighthouse lamp
  drawGlow(g, W, Hh, cx, pan, night) {
    if (night < 0.15) return;
    const off = cx * 0.5, place = x => { let X = Math.round(x - (off % this.LW)); if (X < -60) X += this.LW; return X; };
    g.fillStyle = '#ffd84a';
    for (const [x, y] of this.windows || []) { const X = place(x), Y = Math.round(y + pan * 0.85); g.fillRect(X, Y, 3, 3); g.globalAlpha = 0.25 * night; g.fillRect(X - 2, Y - 2, 7, 7); g.globalAlpha = 1; }
    if (this.lamp) {   // the lighthouse beam sweeping over the sea
      // seen from the side, a turning beam stretches out to one side, shrinks back and comes round the other way
      const X = place(this.lamp.x), Y = Math.round(this.lamp.y + pan * 0.85), c = Math.cos(this.t * 0.8), len = Math.abs(c) * W * 0.6, dir = Math.sign(c) || 1;
      g.fillStyle = '#fff6c8';
      for (let r = 3; r < len; r += 2) { const w = 2 + r * 0.09; g.globalAlpha = 0.2 * night * (1 - r / (W * 0.6)); g.fillRect(Math.round(X + dir * r), Math.round(Y - w / 2), 2, Math.ceil(w)); }
      g.globalAlpha = 1;
    }
    if (this.lamp) { const X = place(this.lamp.x), Y = Math.round(this.lamp.y + pan * 0.85); g.fillStyle = '#fff6c8'; g.fillRect(X - 3, Y - 2, 6, 5); g.globalAlpha = 0.3 * night; this.disc(g, X, Y, 8); g.globalAlpha = 1; }
  }

  // the weather of the place by day (petals, leaves, snow, spray), butterflies, and fireflies at night
  drawWeather(g, W, Hh, dt, pan, night) {
    const P = this.P, top = Math.round(Hh * 0.8 + pan);
    const kind = P.weather;
    const want = kind === 'snow' ? W / 4 : W / 9;
    if (this.parts.length < want && Math.random() < dt * (kind === 'snow' ? 30 : 5)) {
      const cols = { petals: ['#ffc0cf', '#ffffff', '#ffa9bf'], leaves: ['#f07a2a', '#ffb347', '#c8482b', '#ffd84a'], snow: ['#ffffff'], spray: ['#ffffff', '#d6eefc'] }[kind];
      this.parts.push({ x: Math.random() * W * 1.3 - W * 0.15, y: kind === 'spray' ? this.hz + 10 + Math.random() * 20 : -4, v: kind === 'snow' ? 8 + Math.random() * 10 : 6 + Math.random() * 7, p: Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], s: kind === 'snow' && Math.random() < 0.3 ? 2 : 1 });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (kind === 'spray') { p.y -= p.v * dt * 0.6; p.x += 8 * dt; if (p.y < this.hz - 20) { this.parts.splice(i, 1); continue; } g.globalAlpha = 0.5; }
      else { p.y += p.v * dt; p.x += (-3 + Math.sin(this.t * 1.5 + p.p) * (kind === 'leaves' ? 10 : 6)) * dt; if (p.y > Hh) { this.parts.splice(i, 1); continue; } }
      g.fillStyle = p.c;
      const flip = Math.floor(this.t * 4 + p.p) % 2;
      if (kind === 'leaves') g.fillRect(Math.round(p.x), Math.round(p.y), flip ? 2 : 1, flip ? 1 : 2);
      else g.fillRect(Math.round(p.x), Math.round(p.y), p.s + (kind === 'petals' && flip ? 1 : 0), p.s);
      g.globalAlpha = 1;
    }
    // butterflies by day, fireflies by night, over the meadow
    if (this.flies.length < 6 && Math.random() < dt) this.flies.push({ x: Math.random() * W, y: top + Math.random() * (Hh - top - 8), p: Math.random() * 6, life: 6 + Math.random() * 6, c: ['#ffffff', '#ffd84a', '#ff8fa3', '#8fd6ff'][Math.floor(Math.random() * 4)] });
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i]; f.life -= dt;
      if (f.life <= 0) { this.flies.splice(i, 1); continue; }
      f.x += Math.sin(this.t * 0.9 + f.p) * 10 * dt; f.y += Math.cos(this.t * 1.3 + f.p) * 6 * dt;
      const x = Math.round(f.x), y = Math.round(f.y);
      if (night > 0.4) {
        g.globalAlpha = Math.max(0, Math.sin(this.t * 3 + f.p)) * Math.min(1, f.life);
        g.fillStyle = '#fff3a0'; g.fillRect(x, y, 1, 1); g.globalAlpha *= 0.35; g.fillRect(x - 1, y - 1, 3, 3); g.globalAlpha = 1;
      } else if (!P.cold && night < 0.1) {
        const up = Math.floor(this.t * 8 + f.p) % 2;
        g.fillStyle = f.c; g.fillRect(x - 1, y - (up ? 1 : 0), 1, 1); g.fillRect(x + 1, y - (up ? 1 : 0), 1, 1); g.fillStyle = '#1c1424'; g.fillRect(x, y, 1, 1);
      }
    }
  }
}

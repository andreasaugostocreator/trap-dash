// The level select as a little world map, like a farm map pinned to the wall: a strip of countryside that changes
// from meadow to clouds to woods to night, caves, snow, sea and a haunted hill, a dotted trail winding through it,
// and a wooden pin for every level with its name and stars. Your runner stands on the one you picked.
// The pins are ordinary buttons (so keyboards, gamepads and tests treat them like the old level list).
const K = 2;                 // CSS px per map pixel
const SP = 104, PAD = 84;    // CSS px between pins, and at both ends
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ground colours [base, light, dark] and a sky band colour for each world
const LAND = {
  day:     { g: ['#7fb04e', '#9cc966', '#5f8f38'], sky: '#bfe3f0' },
  sky:     { g: ['#dfeeff', '#ffffff', '#a9c6ea'], sky: '#8fd0f5' },
  sunset:  { g: ['#c9a24a', '#e0be62', '#9a7a34'], sky: '#f6c48a' },
  night:   { g: ['#3c6a5e', '#56877a', '#284a42'], sky: '#2e3470' },
  dusk:    { g: ['#8a4f86', '#a8689f', '#643a62'], sky: '#83508f' },
  lava:    { g: ['#4a3030', '#5e3c38', '#2e1c1c'], sky: '#3d1812' },
  ice:     { g: ['#e6f3ff', '#ffffff', '#b8d4ee'], sky: '#bfe3fa' },
  pirate:  { g: ['#e6c98a', '#f2dca8', '#c9a86a'], sky: '#7cc4f0' },
  haunted: { g: ['#4e5a4e', '#66725e', '#343c34'], sky: '#2a1f45' },
};

export function mapSize(n) { return { w: PAD * 2 + (n - 1) * SP, h: 0 }; }
export const pinX = i => PAD + i * SP;
export const pinY = (i, H) => Math.round(H * 0.46 + Math.sin(i * 1.25 + 0.4) * H * 0.16);

// Paint the countryside for these level themes (one region per pin) at map scale.
export function paintMap(cv, themes, H) {
  const Wc = Math.ceil((PAD * 2 + (themes.length - 1) * SP) / K), Hc = Math.ceil(H / K);
  cv.width = Wc; cv.height = Hc;
  const g = cv.getContext('2d'), px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const regionAt = x => Math.max(0, Math.min(themes.length - 1, Math.round((x * K - PAD) / SP)));
  // which world a column belongs to, with a dithered seam between neighbours
  const themeAt = (x, y) => {
    const f = (x * K - PAD) / SP, i = Math.floor(f), frac = f - i;
    if (i < 0) return themes[0];
    if (i >= themes.length - 1) return themes[themes.length - 1];
    const seam = (frac - 0.5) * 4;   // -2..2 around the middle between two pins: a soft dithered blend
    if (seam < -0.5) return themes[i];
    if (seam > 0.5) return themes[i + 1];
    return ((BAYER[(y % 4) * 4 + (x % 4)] + hash(x, y) * 6 - 3) / 16) < seam + 0.5 ? themes[i + 1] : themes[i];
  };
  const horizon = Math.round(Hc * 0.2);
  for (let x = 0; x < Wc; x++) for (let y = 0; y < Hc; y++) {
    const t = LAND[themeAt(x, y)] || LAND.day;
    if (y < horizon) { px(x, y, t.sky); continue; }
    const n = hash(x >> 1, y >> 1);
    px(x, y, n > 0.9 ? t.g[1] : n < 0.07 ? t.g[2] : t.g[0]);
  }
  // a soft hill line along the horizon
  for (let x = 0; x < Wc; x++) {
    const t = LAND[themeAt(x, horizon)] || LAND.day, hh = Math.round(3 + Math.sin(x / 9) * 2 + Math.sin(x / 23) * 3);
    for (let y = horizon - hh; y < horizon; y++) px(x, y, t.g[2]);
    px(x, horizon - hh - 1, t.g[1]);
  }
  // props for each world, scattered away from the trail
  for (let x = 2; x < Wc - 2; x += 1) {
    const r = hash(x, 7); if (r > 0.16) continue;
    const y = horizon + 3 + Math.floor(hash(x, 8) * (Hc - horizon - 8)), th = themeAt(x, y);
    const i = regionAt(x), py = pinY(i, H) / K;
    if (Math.abs(y - py) < 9 && Math.abs(x - pinX(i) / K) < 22) continue;   // keep the pin's ground clear
    prop(g, th, x, y, hash(x, 9));
  }
  return { horizon };
}
function prop(g, th, x, y, r) {
  const R = (i, j, w, h, c) => { g.fillStyle = c; g.fillRect(x + i, y + j, w, h); };
  switch (th) {
    case 'day': if (r < 0.5) { R(0, -4, 3, 3, '#2f7a45'); R(-1, -3, 5, 2, '#46a056'); R(1, -1, 1, 2, '#6b4226'); } else { R(0, 0, 1, 1, r < 0.75 ? '#fdf6e6' : '#f0be4a'); R(1, 1, 1, 1, '#d9663f'); } break;
    case 'sunset': if (r < 0.5) { R(0, -5, 3, 4, '#d9782a'); R(-1, -4, 5, 2, '#f08a3a'); R(1, -1, 1, 2, '#6b4226'); } else { R(0, -1, 1, 2, '#f0be4a'); R(1, -2, 1, 3, '#e0a83a'); } break;
    case 'sky': R(-2, 0, 6, 2, '#ffffff'); R(-1, -1, 4, 1, '#ffffff'); break;
    case 'night': if (r < 0.4) { R(0, -5, 3, 5, '#1f3a34'); R(-1, -2, 5, 2, '#1f3a34'); } else R(0, 0, 1, 1, r < 0.7 ? '#d8ff7a' : '#9cc966'); break;
    case 'dusk': R(0, -2, 1, 3, '#f2a6c4'); R(1, -1, 1, 2, '#ffd0e8'); break;
    case 'lava': if (r < 0.5) { R(-1, 0, 4, 2, '#ff7a1a'); R(0, 0, 2, 1, '#ffd84a'); } else { R(0, -3, 2, 3, '#2e1c1c'); } break;
    case 'ice': if (r < 0.5) { R(0, -5, 1, 5, '#7fb6e6'); R(-1, -2, 3, 2, '#bfe0ff'); } else { R(0, -3, 3, 3, '#5a8a3a'); R(1, -4, 1, 1, '#ffffff'); R(0, -3, 3, 1, '#ffffff'); } break;
    case 'pirate': if (r < 0.45) { R(-2, 0, 5, 2, '#3d8be0'); R(-1, 0, 3, 1, '#7cc4f0'); } else { R(0, -6, 1, 6, '#8a5a2b'); R(-2, -7, 5, 2, '#2f7a45'); } break;
    case 'haunted': if (r < 0.5) { R(0, -3, 3, 3, '#8a8a9a'); R(1, -4, 1, 1, '#8a8a9a'); R(1, -2, 1, 1, '#4a4a5a'); } else { R(0, -5, 1, 5, '#2a2030'); R(-1, -4, 1, 1, '#2a2030'); R(1, -3, 1, 1, '#2a2030'); } break;
  }
}
// The dotted trail from pin to pin.
export function paintTrail(cv, n, H) {
  const g = cv.getContext('2d');
  let step = 0;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pinX(i) / K, y0 = pinY(i, H) / K, x1 = pinX(i + 1) / K, y1 = pinY(i + 1, H) / K;
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(len);
    for (let s = 0; s <= steps; s++) {
      const u = s / steps, x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 4);
      if (step++ % 4 < 2) { g.fillStyle = '#6b4226'; g.fillRect(x, y, 2, 2); g.fillStyle = '#c9a77a'; g.fillRect(x, y, 2, 1); }
    }
  }
}

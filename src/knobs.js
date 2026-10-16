// Arcade parts for the on-screen controls, drawn as real pixel art (one pixel at a time, so every edge is crisp and the
// buttons share the game world's pixel grid): a domed round cap sitting in a smoked-glass socket, a pixel joystick.
// The canvases are tiny and scaled up by CSS with image-rendering: pixelated. Redrawn only when their look changes.

// [highlight, base, shade, side]
export const PAL = {   // the Harvest palette: moss, plum, brick, dusty teal, honey, harvest orange, warm greys, walnut
  runner: ['#cfeaa0', '#7fb04e', '#5f8f38', '#365a20'],
  trapper: ['#e2b8da', '#9a6492', '#7a4a72', '#46283f'],
  red: ['#f6b89a', '#d9663f', '#b24a2c', '#6a2a18'],
  blue: ['#bfe6ea', '#4aa3b2', '#33808e', '#1d4a54'],
  yellow: ['#fff0b8', '#f0be4a', '#cf9a2a', '#7a5414'],
  jump: ['#ffd2a0', '#f08a3a', '#cc6524', '#743614'],
  grey: ['#ddd2c0', '#a29580', '#7f725e', '#4c4134'],
  dark: ['#a8876a', '#5e3f28', '#4a301e', '#26170c'],
  aim: ['#fff0b8', '#f0be4a', '#cf9a2a', '#7a5414'],
};
const INK = [58, 36, 23];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PALRGB = {}; for (const k in PAL) PALRGB[k] = PAL[k].map(hex);

// Size of a knob's canvas for a cap radius r (socket r+2, a pixel of outline, room for the charge pips below).
export const knobSize = r => ({ w: 2 * (r + 3), h: 2 * (r + 3) });

const tinted = new Map();   // icon -> dark copy, for its drop shadow
function shadowOf(icon) {
  let c = tinted.get(icon);
  if (!c) {
    c = document.createElement('canvas'); c.width = icon.width; c.height = icon.height;
    const x = c.getContext('2d'); x.drawImage(icon, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(58,36,23,.75)'; x.fillRect(0, 0, c.width, c.height);
    tinted.set(icon, c);
  }
  return c;
}

// o: { r, pal, icon, iconScale, pressed, cd (0..1 still to recharge), spent, empty, pips, maxPips }
export function drawKnob(cv, o) {
  const r = o.r, { w, h } = knobSize(r);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const cx = w / 2, cy = w / 2, S = r + 2;
  const lift = o.empty ? 0 : o.pressed || o.spent ? 0.6 : 2.2, top = cy - lift;
  const pal = PALRGB[o.spent ? 'grey' : o.pal] || PALRGB.grey, grey = PALRGB.grey;
  const put = (i, c, a = 255) => {
    const k = i * 4, A = a / 255, B = d[k + 3] / 255, out = A + B * (1 - A);
    if (out <= 0) return;
    for (let j = 0; j < 3; j++) d[k + j] = Math.round((c[j] * A + d[k + j] * B * (1 - A)) / out);
    d[k + 3] = Math.round(out * 255);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5, i = y * w + x;
    const dx = px - cx, ds = Math.hypot(dx, py - cy);
    // the socket: a smoked-glass hole, dark at its top inner edge, catching light along the bottom
    if (ds <= S + 1) {
      if (ds > S) put(i, INK, 200);
      else {
        put(i, o.empty ? [10, 7, 16] : [14, 10, 22], o.empty ? 150 : 120);
        if (ds > S - 1) put(i, py > cy ? [255, 255, 255] : INK, py > cy ? 60 : 110);
      }
    }
    if (o.empty) continue;
    // the cap: a short cylinder (its side shows below the top when raised) with a domed top
    const sy = Math.max(top, Math.min(cy, py)), dSeg = Math.hypot(dx, py - sy), dTop = Math.hypot(dx, py - top);
    if (dSeg > r + 1) continue;
    if (dSeg > r) { put(i, INK); continue; }
    const cooling = o.cd > 0 && !o.spent && ((Math.atan2(dx, -(py - top)) / (Math.PI * 2) + 1) % 1) < o.cd;
    const P = cooling ? grey : pal;
    if (dTop > r) { put(i, dTop > r + 0.2 && py > top ? P[3] : P[2]); continue; }   // the side
    if (dTop > r - 1) { put(i, INK); continue; }                                    // the rim between side and top
    const n = (-0.55 * dx - 0.83 * (py - top)) / Math.max(1, dTop);                  // light from the upper left
    let c = P[1];
    if (dTop > r - 2.4) c = n > 0.25 ? P[0] : n < -0.45 ? P[2] : P[1];
    else if (py - top > r * 0.42) c = P[2];
    put(i, c);
    if (r >= 6 && !cooling && Math.hypot(px - (cx - r * 0.42), py - (top - r * 0.5)) < (r >= 10 ? 1.6 : 1.1)) put(i, [255, 255, 255], 230);   // glint
  }
  // charges: little lit pips on the bottom of the socket
  const n = o.pips ?? 0;
  if (n > 0 && !o.empty) {
    // on the socket's lower rim, each a 2x2 light in a 1 px ink frame, sharing frames
    const shown = Math.min(n, o.maxPips || 4), y0 = Math.round(cy + S - 2), x0 = Math.round(cx - (shown * 3 + 1) / 2);
    for (let p = 0; p < shown; p++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
      const X = x0 + p * 3 + xx, Y = y0 + yy;
      if (X < 0 || X >= w || Y >= h) continue;
      const lit = yy > 0 && yy < 3 && xx > 0 && xx < 3;
      put(Y * w + X, lit ? (yy === 1 ? [255, 236, 170] : [240, 190, 74]) : INK);
    }
  }
  g.putImageData(img, 0, 0);
  if (o.icon && !o.empty) {
    const s = o.iconScale || 1, iw = o.icon.width * s, ih = o.icon.height * s;
    const ix = Math.round(cx - iw / 2), iy = Math.round(top - ih / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(shadowOf(o.icon), ix, iy + s, iw, ih);
    g.globalAlpha = o.spent ? 0.45 : o.cd > 0 ? 0.7 : 1;
    g.drawImage(o.icon, ix, iy, iw, ih);
    g.globalAlpha = 1;
  }
}

// The runner's joystick: a plate with an arrow at each end, a stick with a red ball that leans the way you press.
export const STICK = { w: 46, h: 32 };   // plate centre at y 22
export function drawStick(cv, dir) {
  const { w, h } = STICK;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4, A = a / 255, B = d[k + 3] / 255, out = A + B * (1 - A);
    for (let j = 0; j < 3; j++) d[k + j] = Math.round((c[j] * A + d[k + j] * B * (1 - A)) / out);
    d[k + 3] = Math.round(out * 255);
  };
  // the plate: a smoked capsule
  const pr = 9, py = 22, pl = 10, prr = w - 10;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.max(pl, Math.min(prr, x + 0.5)), dd = Math.hypot(x + 0.5 - cx, y + 0.5 - py);
    if (dd <= pr + 1) {
      if (dd > pr) put(x, y, INK, 200);
      else { put(x, y, [14, 10, 22], 120); if (dd > pr - 1) put(x, y, y + 0.5 > py ? [255, 255, 255] : INK, y + 0.5 > py ? 60 : 110); }
    }
  }
  // arrows engraved at both ends, lit on the side being pressed
  const arrow = (ax, s, lit) => {
    const col = lit ? [240, 190, 74] : [247, 234, 208], a = lit ? 255 : 150;
    for (let k = 0; k < 4; k++) for (let j = -k; j <= k; j++) put(ax + s * k, py + j, INK, a);
    for (let k = 0; k < 3; k++) for (let j = -k; j <= k; j++) put(ax + s * (k + 1), py + j, col, a);
  };
  arrow(4, 1, dir < 0); arrow(w - 5, -1, dir > 0);
  // the stick
  const bx = w / 2 + dir * 6, by = 8 + (dir ? 1 : 0), base = [w / 2, py - 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {   // shadow under the ball, on the plate
    if (Math.hypot((x + 0.5 - (w / 2 + dir * 2)) / 1.8, y + 0.5 - (py + 2)) < 2.4) put(x, y, INK, 120);
  }
  for (let t = 0; t <= 1; t += 0.05) {   // the shaft, 2 px wide with an ink outline
    const x = base[0] + (bx - base[0]) * t, y = base[1] + (by - base[1]) * t;
    for (let ox = -2; ox <= 1; ox++) put(Math.floor(x + ox), Math.floor(y), ox === -2 || ox === 1 ? INK : ox === -1 ? [190, 196, 210] : [120, 126, 140]);
  }
  for (let y = py - 2; y <= py + 1; y++) for (let x = w / 2 - 4; x < w / 2 + 4; x++) put(x, y, Math.abs(y - py + 0.5) > 1 || x === w / 2 - 4 || x === w / 2 + 3 ? INK : [80, 70, 100]);   // collar
  const R = 6, red = PALRGB.jump;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {   // the ball top
    const dx = x + 0.5 - bx, dy = y + 0.5 - by, dd = Math.hypot(dx, dy);
    if (dd > R + 1) continue;
    if (dd > R) { put(x, y, INK); continue; }
    const n = (-0.55 * dx - 0.83 * dy) / Math.max(1, dd);
    put(x, y, dd > R - 1.6 ? (n > 0.2 ? red[0] : n < -0.4 ? red[2] : red[1]) : dy > R * 0.35 ? red[2] : red[1]);
    if (Math.hypot(dx + 2.4, dy + 2.6) < 1.2) put(x, y, [255, 255, 255], 230);
  }
  g.putImageData(img, 0, 0);
}

// Small extra icons for the controls (7x7, white), in the same format as the trap icons.
function icon(rows) {
  const c = document.createElement('canvas'); c.width = 7; c.height = 7;
  const g = c.getContext('2d'); g.fillStyle = '#fff';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'W') g.fillRect(x, y, 1, 1); }));
  return c;
}
export const KICON = {
  jump: icon(['...W...', '..WWW..', '.WWWWW.', 'WWWWWWW', '..WWW..', '..WWW..', '..WWW..']),
  pause: icon(['.......', '.WW.WW.', '.WW.WW.', '.WW.WW.', '.WW.WW.', '.WW.WW.', '.......']),
  lockW: icon(['..WWW..', '.W...W.', '.W...W.', 'WWWWWWW', 'WWW.WWW', 'WWW.WWW', 'WWWWWWW']),
  help: icon(['..WWW..', '.W...W.', '.....W.', '...WW..', '...W...', '.......', '...W...']),
  gear: icon(['...W...', '.WWWWW.', '.WW.WW.', 'WW...WW', '.WW.WW.', '.WWWWW.', '...W...']),
  book: icon(['WWW.WWW', 'W.W.W.W', 'WWW.WWW', 'W.W.W.W', 'WWW.WWW', 'WWWWWWW', '.......']),
  trophy: icon(['WWWWWWW', 'WWWWWWW', '.WWWWW.', '..WWW..', '...W...', '..WWW..', '.WWWWW.']),
};

// Colour pixel icons for menus and result screens (in place of emoji, which would break the pixel look).
// K ink, W white, Y gold, O dark gold, R red, G grey, N wood.
const PC = { K: '#3a2417', W: '#fdf6e6', Y: '#f0be4a', O: '#c08a22', R: '#d9663f', G: '#b4a48c', N: '#8a5a2b', B: '#4aa3b2' };
const PICON = {
  trophy: ['KKKKKKKKK', 'KYWYYYYOK', 'KYWYYYYOK', '.KYYYYYK.', '..KYYYK..', '...KYK...', '...KOK...', '..KYYOK..', '.KKKKKKK.'],
  crown: ['.........', 'K...K...K', 'KK.KYK.KK', 'KYKYYYKYK', 'KYYYRYYYK', 'KYWYYYYYK', 'KOOOOOOOK', 'KKKKKKKKK', '.........'],
  flag: ['KKKKKKKK.', 'KWKWKWKK.', 'KKWKWKWK.', 'KWKWKWKK.', 'KKKKKKKK.', 'KNK......', 'KNK......', 'KNK......', 'KKK......'],
  clock: ['..KKKKK..', '.KWWWWWK.', 'KWWWKWWWK', 'KWWWKWWWK', 'KWWWKKWWK', 'KWWWWWWWK', '.KWWWWWK.', '..KKKKK..', '.........'],
  dice: ['KKKKKKKKK', 'KWWWWWWWK', 'KWKWWWWWK', 'KWWWWWWWK', 'KWWWKWWWK', 'KWWWWWWWK', 'KWWWWWKWK', 'KWWWWWWWK', 'KKKKKKKKK'],
  lock: ['..KKKKK..', '.KGKKKGK.', '.KGK.KGK.', 'KKKKKKKKK', 'KYYYYYYYK', 'KYYYKYYYK', 'KYYYKYYYK', 'KOOOOOOOK', 'KKKKKKKKK'],
  warn: ['....K....', '...KYK...', '...KYK...', '..KYKYK..', '..KYKYK..', '.KYYKYYK.', '.KYYYYYK.', 'KYYYKYYYK', 'KKKKKKKKK'],
  eye: ['.........', '..KKKKK..', '.KWWWWWK.', 'KWWKKKWWK', 'KWKBBKKWK', 'KWWKKKWWK', '.KWWWWWK.', '..KKKKK..', '.........'],
  hammer: ['..KKKKK..', '.KGGGGGK.', '.KGWGGGK.', '..KKNKK..', '....KNK..', '....KNK..', '....KNK..', '....KNK..', '.....KK..'],
  gem: ['....K....', '...KBK...', '..KWBBK..', '.KWBBBBK.', 'KWBBBBBBK', '.KBBBBBK.', '..KBBBK..', '...KBK...', '....K....'],
  coin: ['...KKKKK...', '.KKYYYYYKK.', '.KYWYYYYOK.', 'KYWYYOYYYOK', 'KYYOOOOOYOK', 'KYYYOOOYYOK', 'KYYOYYYOYOK', 'KYYYYYYYOOK', '.KYYYYYOOK.', '.KKOOOOOKK.', '...KKKKK...'],
  skull: ['...KKKKK...', '.KKWWWWWKK.', '.KWWWWWWGK.', 'KWWKKWKKWGK', 'KWWKKWKKWGK', 'KWWWWKWWWGK', 'KWWWWWWWWGK', 'KWGKGKGKGGK', '.KWWWWWWGK.', '.KKGGGGGKK.', '...KKKKK...'],
  spikes: ['.........', '...K.....', '..KGK..K.', '..KWK.KGK', '.KWGGKKWK', '.KWGGKWGK', 'KWGGGKWGK', 'KKKKKKKKK', '.........'],
};
const urls = {};
export function pixURL(name) {
  if (urls[name]) return urls[name];
  const rows = PICON[name], c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PC[ch]) { g.fillStyle = PC[ch]; g.fillRect(x, y, 1, 1); } }));
  return (urls[name] = c.toDataURL());
}
export const canvasURL = c => c.toDataURL();

// A wooden frame as a 9-slice image (12x12, slices of 5): an ink edge with notched corners, three pixels of wood
// with grain (lit along the top and left, shaded along the bottom and right), brass nails, a dark inner lip, and a
// parchment middle. Used through CSS border-image by the title tiles, the planks and the cards.
export function woodFrame(inner = '#f6e7c8') {
  const c = document.createElement('canvas'); c.width = c.height = 12;
  const g = c.getContext('2d'), I = hex(inner);
  const put = (x, y, col) => { g.fillStyle = typeof col === 'string' ? col : `rgb(${col.join(',')})`; g.fillRect(x, y, 1, 1); };
  const h2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const d = Math.min(x, y, 11 - x, 11 - y), corner = (x === 0 || x === 11) && (y === 0 || y === 11);
    if (corner) continue;
    if (d === 0) { put(x, y, '#3a2417'); continue; }
    if (d <= 3) {
      const top = y === d && y <= x && y <= 11 - x, left = x === d && x < y && x < 11 - y, bottom = 11 - y === d, right = 11 - x === d && !bottom;
      let col = top ? (d === 1 ? '#f0bd78' : '#d7984f') : left ? '#c98a49' : bottom ? (d === 1 ? '#6e3f1e' : '#86502a') : right ? '#965c30' : '#b8763f';
      if (!top && !bottom && h2(x, y) < 0.25) col = '#a2652f';
      put(x, y, col); continue;
    }
    if (d === 4) { put(x, y, y === 4 || x === 4 ? '#6b3f1f' : '#d9bf8f'); continue; }
    put(x, y, I);
  }
  for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9]]) { put(x, y, '#ffe9b0'); put(x + 1, y + 1, '#5a3418'); }
  return c.toDataURL();
}

// ---------- the title tiles' icons: 13x13, shaded (W light, L shade, A honey, O deep honey, R brick, r deep brick),
// outlined in walnut so they read on any cap colour. Drawn at full art resolution (no doubling) for finer detail.
const TI = { K: '#3a2417', W: '#fdf6e6', L: '#d8c6a4', A: '#f0be4a', O: '#b9851f', R: '#d9663f', r: '#9e3f24', G: '#8fc05a', g: '#5f8f38', B: '#4aa3b2', b: '#2f6a78' };
function tIcon(rows) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (TI[ch]) { g.fillStyle = TI[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}
function ringIcon(paint, n = 13) {   // painted from distance and angle to the centre
  const rows = [], c = (n - 1) / 2;
  for (let y = 0; y < n; y++) { let r = ''; for (let x = 0; x < n; x++) r += paint(x - c, y - c); rows.push(r); }
  return tIcon(rows);
}
// two overlapping people, painted from shapes (round heads, rounded shoulders) with a walnut outline around each
function people() {
  const shapes = [   // front first
    { head: [4.6, 5.4, 2.9], body: [4.6, 9.8, 4.4], fill: 'W', shade: 'L' },
    { head: [10.6, 3.4, 2.7], body: [10.6, 7.8, 3.9], fill: 'A', shade: 'O' },
  ];
  const inside = (s, x, y) => Math.hypot(x - s.head[0], y - s.head[1]) <= s.head[2] ||
    (y >= s.body[1] && y <= N - 1 && Math.abs(x - s.body[0]) <= s.body[2] - (y < s.body[1] + 1 ? 1.5 : y < s.body[1] + 2 ? 0.6 : 0));
  const rows = [], N = 15;
  for (let y = 0; y < N; y++) {
    let r = '';
    for (let x = 0; x < N; x++) {
      const i = shapes.findIndex(s => inside(s, x, y));
      if (i < 0) { r += shapes.some(s => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(s, x + dx, y + dy))) ? 'K' : '.'; continue; }
      const s = shapes[i], edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside(s, x + dx, y + dy) && (y + dy <= N - 1));
      const behindFront = i > 0 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(shapes[0], x + dx, y + dy));
      r += edge || behindFront ? 'K' : (x > (y < s.body[1] ? s.head[0] : s.body[0]) + 1 ? s.shade : s.fill);
    }
    rows.push(r);
  }
  return tIcon(rows);
}
export const TICON = {
  host: tIcon([   // a pennant waving on a pole with a gold finial
    '..KK.........',
    '.KAOK........',
    '.KKKKKKKK....',
    '.KWKWWWWWKK..',
    '.KWKWWWWWWWKK',
    '.KWKWWLWWWWWK',
    '.KWKWWLLWWWK.',
    '.KWKWWWWLKK..',
    '.KWKKKKKK....',
    '.KWK.........',
    '.KLK.........',
    'KKLKK........',
    'KLLLK........',
  ]),
  join: tIcon([   // a key: you join with the party's code
    '...KKKKK.....',
    '..KWWWWWK....',
    '.KWWKKKWWK...',
    '.KWK...KWK...',
    '.KWWKKKWLK...',
    '..KWWWWLK....',
    '...KKWLK.....',
    '....KWLKKK...',
    '....KWLWWK...',
    '....KWLKKK...',
    '....KWLWK....',
    '....KWLKK....',
    '.....KKK.....',
  ]),
  local: people(),   // two players: one in front (white), one just behind (honey)
  practice: ringIcon((x, y) => {   // a bullseye
    const d = Math.hypot(x, y);
    if (d > 7.4) return '.'; if (d > 6.4) return 'K';
    if (d > 4.9) return y > 2 ? 'L' : 'W'; if (d > 3.3) return y > 1 ? 'r' : 'R'; if (d > 1.7) return 'W'; return 'R';
  }, 15),
  match: shapeIcon(15, (x, y) => Math.hypot(x, y) <= 6.2, (x, y) => {   // a globe: players anywhere
    const lon = Math.round((Math.asin(Math.max(-1, Math.min(1, x / 6.3))) * 3)), land = ((x * 7 + y * 13 + 40) % 9 < 4 && Math.hypot(x - 1, y + 1) > 2.2) || (x < -1 && y > 1 && y < 4);
    if (x + y < -6) return 'W';
    if (Math.abs(y) === 0 || lon === 0 && Math.abs(x) <= 0) return 'L';
    return land ? (x + y > 3 ? 'g' : 'G') : (x + y > 3 ? 'b' : 'B');
  }),
  rejoin: tIcon([   // a U-turn arrow: back into the party
    '...K.........',
    '..KWK........',
    '.KWWWKKKKKK..',
    'KWWWWWWWWWWKK',
    '.KWWWLLLLLWWK',
    '..KWKKKKKKKWK',
    '...K......KWK',
    '..........KLK',
    '.....KKKKKKLK',
    '....KWWWWWLLK',
    '....KLLLLLLK.',
    '....KKKKKKK..',
  ]),
};

// ---------- the small planks' icons (How to play, Settings, Items, Trophies): 11x11, in colour, walnut outlines.
Object.assign(TI, { B: '#4aa3b2', b: '#2f6a78', n: '#7a4a26' });
const QMARK = ['.WWW.', 'W...W', '....W', '...W.', '..W..', '.....', '..W..'];
// an icon from a shape test: inside pixels get fill(x, y), and every pixel touching the shape gets the walnut outline
function shapeIcon(n, inside, fill) {
  const c = (n - 1) / 2, rows = [];
  for (let y = 0; y < n; y++) {
    let r = '';
    for (let x = 0; x < n; x++) {
      const X = x - c, Y = y - c;
      if (inside(X, Y)) r += fill(X, Y);
      else r += [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(X + dx, Y + dy)) ? 'K' : '.';
    }
    rows.push(r);
  }
  return tIcon(rows);
}
export const PLANK = {
  help: ringIcon((x, y) => {   // a teal coin with a question mark
    const d = Math.hypot(x, y);
    if (d > 5.6) return '.'; if (d > 4.6) return 'K';
    const qx = x + 2, qy = y + 3;
    if (qx >= 0 && qx < 5 && qy >= 0 && qy < 7 && QMARK[qy][qx] === 'W') return 'W';
    return x + y > 3 ? 'b' : 'B';
  }, 11),
  gear: shapeIcon(13, (x, y) => {   // a brass gear: body, 4 straight and 4 diagonal teeth, a hole in the hub
    const d = Math.hypot(x, y), ax = Math.abs(x), ay = Math.abs(y);
    if (d < 1.6) return false;
    return d <= 3.9 || (ax <= 1 && ay <= 5) || (ay <= 1 && ax <= 5) || (ax >= 3 && ax <= 4 && ay >= 3 && ay <= 4);
  }, (x, y) => x + y < -5 ? 'W' : x + y > 2 ? 'O' : 'A'),
  star: shapeIcon(11, (x, y) => {   // a five-point honey star for the tagline sign
    const a = Math.atan2(x, -y), d = Math.hypot(x, y), k = Math.cos(a * 5);
    return d <= 2.2 + 2.6 * Math.max(0, k) ** 1.6;
  }, (x, y) => x + y < -2 ? 'W' : x + y > 1 ? 'O' : 'A'),
  book: tIcon([   // a red book: gold title band, cream page edges, a teal bookmark
    '.KKKKKKKKK.',
    'KrRRRRRRRRK',
    'KrRAAAAAARK',
    'KrRRRRRRRRK',
    'KrRRRRRRRRK',
    'KrRRRRRRRRK',
    'KrRRRRRRRRK',
    'KrKKKKKKKKK',
    'KrWWWWWBWLK',
    'KKKKKKKBKKK',
    '.......K...',
  ]),
  trophy: tIcon([   // a gold cup with handles, a highlight and a base
    '..KKKKKKK..',
    'KKKWAAAAOKKK'.slice(0, 11),
    'KAKWAAAAOKA',
    'KAKWAAAAOKA',
    '.KKWAAAAOK.',
    '..KAAAAOK..',
    '...KAAOK...',
    '....KOK....',
    '...KKOKK...',
    '..KAAAAOK..',
    '..KKKKKKK..',
  ]),
};

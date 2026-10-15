// Arcade parts for the on-screen controls, drawn as real pixel art (one pixel at a time, so every edge is crisp and the
// buttons share the game world's pixel grid): a domed round cap sitting in a smoked-glass socket, a pixel joystick.
// The canvases are tiny and scaled up by CSS with image-rendering: pixelated. Redrawn only when their look changes.

// [highlight, base, shade, side]
export const PAL = {
  runner: ['#9ff5df', '#2fbf9f', '#229279', '#135446'],
  trapper: ['#d2c1ff', '#8a63f0', '#6a46cc', '#3a2484'],
  red: ['#ffb3ba', '#ff4d5e', '#d12f40', '#76162a'],
  blue: ['#bcd8ff', '#3d8bff', '#2766cc', '#163c7e'],
  yellow: ['#fff3b8', '#ffc23d', '#e09a12', '#81520a'],
  jump: ['#ffa8b1', '#f03a4d', '#c42338', '#6a1020'],
  grey: ['#c4c8d3', '#878d9f', '#666c7e', '#363b49'],
  dark: ['#8c7fa6', '#463a5c', '#33293f', '#16101e'],
  aim: ['#fff6c8', '#ffd84a', '#e0a91a', '#7d5a08'],
};
const INK = [28, 20, 36];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PALRGB = {}; for (const k in PAL) PALRGB[k] = PAL[k].map(hex);

// Size of a knob's canvas for a cap radius r (socket r+2, a pixel of outline, room for the charge pips below).
export const knobSize = r => ({ w: 2 * (r + 3), h: 2 * (r + 3) });

const tinted = new Map();   // icon -> dark copy, for its drop shadow
function shadowOf(icon) {
  let c = tinted.get(icon);
  if (!c) {
    c = document.createElement('canvas'); c.width = icon.width; c.height = icon.height;
    const x = c.getContext('2d'); x.drawImage(icon, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(28,20,36,.75)'; x.fillRect(0, 0, c.width, c.height);
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
      put(Y * w + X, lit ? (yy === 1 ? [255, 240, 170] : [255, 200, 60]) : INK);
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
    const col = lit ? [255, 216, 74] : [244, 234, 215], a = lit ? 255 : 150;
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
const PC = { K: '#1c1424', W: '#ffffff', Y: '#ffd84a', O: '#d18f12', R: '#e8414f', G: '#9aa3b5', N: '#8a5a2b', B: '#3c6fd1' };
const PICON = {
  trophy: ['KKKKKKKKK', 'KYWYYYYOK', 'KYWYYYYOK', '.KYYYYYK.', '..KYYYK..', '...KYK...', '...KOK...', '..KYYOK..', '.KKKKKKK.'],
  crown: ['.........', 'K...K...K', 'KK.KYK.KK', 'KYKYYYKYK', 'KYYYRYYYK', 'KYWYYYYYK', 'KOOOOOOOK', 'KKKKKKKKK', '.........'],
  flag: ['KKKKKKKK.', 'KWKWKWKK.', 'KKWKWKWK.', 'KWKWKWKK.', 'KKKKKKKK.', 'KNK......', 'KNK......', 'KNK......', 'KKK......'],
  clock: ['..KKKKK..', '.KWWWWWK.', 'KWWWKWWWK', 'KWWWKWWWK', 'KWWWKKWWK', 'KWWWWWWWK', '.KWWWWWK.', '..KKKKK..', '.........'],
  dice: ['KKKKKKKKK', 'KWWWWWWWK', 'KWKWWWWWK', 'KWWWWWWWK', 'KWWWKWWWK', 'KWWWWWWWK', 'KWWWWWKWK', 'KWWWWWWWK', 'KKKKKKKKK'],
  lock: ['..KKKKK..', '.KGKKKGK.', '.KGK.KGK.', 'KKKKKKKKK', 'KYYYYYYYK', 'KYYYKYYYK', 'KYYYKYYYK', 'KOOOOOOOK', 'KKKKKKKKK'],
  warn: ['....K....', '...KYK...', '...KYK...', '..KYKYK..', '..KYKYK..', '.KYYKYYK.', '.KYYYYYK.', 'KYYYKYYYK', 'KKKKKKKKK'],
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

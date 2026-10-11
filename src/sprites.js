// Pixel art, written as text. Each letter is a palette key, '.' is see-through.
// Sprites are compiled once into small canvases (and mirrored copies) and then drawn with drawImage.
const cache = new Map();

export function compile(rows, pal, key) {
  if (key && cache.has(key)) return cache.get(key);
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i];
    if (!ch || ch === '.') continue;
    const col = pal[ch];
    if (!col) continue;
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  if (key) cache.set(key, c);
  return c;
}
export function mirror(src, key) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  if (key) cache.set(key, c);
  return c;
}

const OUT = '#1c1424';

// ---------- characters: a 12x9 head on top of a 12x7 body, facing right
const HEADS = {
  explorer: [
    '...KKKKKK...',
    '..KTTTTTTK..',
    '..KttttttK..',
    'KTTTTTTTTTTK',
    '.KHHHSSSSSK.',
    '.KHSSSSESEK.',
    '.KHSSSSESEK.',
    '..KSSSrSSK..',
    '...KKKKKK...',
  ],
  knight: [
    '.PP.KKKKK...',
    'PPPKGGGGGK..',
    '.PKGGLLGGGK.',
    '.KGGGLGGGGK.',
    '.KGGGGGGGGK.',
    '.KGGGKKKKKK.',
    '.KGGGKWKWKK.',
    '..KgGGGGGK..',
    '...KKKKKK...',
  ],
  astronaut: [
    '...KKKKKK...',
    '..KwwwwwwK..',
    '.KwwwwwwwwK.',
    '.KwwKKKKKKK.',
    '.KwKvVSSSSK.',
    '.KwKVSSESEK.',
    '.KwKSSSESEK.',
    '.KwwKKKKKKK.',
    '..KKwwwwKK..',
  ],
  ninja: [
    '...KKKKKK...',
    '..KNNNNNNK..',
    '.KNNNNNNNNK.',
    'RRKRRRRRRRRK',
    '.RRNNNNNNNK.',
    '.KNNNSSESEK.',
    '.KNNNnnnnnK.',
    '..KNNNNNNK..',
    '...KKKKKK...',
  ],
  robot: [
    '......K.....',
    '.....KYK....',
    '..KKKKKKKK..',
    '.KMMMMMMMMK.',
    '.KMKKKKKKKK.',
    '.KMKDDCDCDK.',
    '.KMKDDCDCDK.',
    '.KmMKKKKKKK.',
    '..KKKKKKKK..',
  ],
  pirate: [
    '...KKKKKK...',
    '..KRRWRRRK..',
    '.KRRRRRRWRK.',
    'RRKRRRRRRRRK',
    '.RKHHSSSSSK.',
    '.KHHSSSEKKK.',
    '.KHSSSSEKKK.',
    '..KSSSrSSK..',
    '...KKKKKK...',
  ],
};

// Bodies: rows 9-15. A shirt, a shirt shade, S hands, B pants, F boots.
const BODIES = {
  idle: [
    '...KAAAAK...',
    '..KSAAAASK..',
    '..KSAaaASK..',
    '...KBBBBK...',
    '...KBKKBK...',
    '...KFKKFFK..',
    '...KKK.KKK..',
  ],
  run0: [
    '...KAAAAK...',
    '..KAAAAASK..',
    '.KSAaaaAK...',
    '...KBBBBK...',
    '..KBBKKBBK..',
    '.KFFK..KFFK.',
    '.KKK....KKK.',
  ],
  run1: [
    '...KAAAAK...',
    '...KAAAASK..',
    '...KSaaAK...',
    '...KBBBBK...',
    '...KBKBBK...',
    '...KFKFFK...',
    '...KKKKKK...',
  ],
  run2: [
    '...KAAAAK...',
    '..KSAAAAAK..',
    '...KAaaaSK..',
    '...KBBBBK...',
    '..KBBKKBBK..',
    '..KFFK.KFFK.',
    '..KKK...KKK.',
  ],
  jump: [
    '..KKAAAAKSK.',
    '..KSAAAAAK..',
    '...KAaaAK...',
    '...KBBBBK...',
    '..KBBKKBBK..',
    '..KFFK.KFK..',
    '..KKK..KK...',
  ],
  fall: [
    '.KSKAAAAKSK.',
    '..KKAAAAKK..',
    '...KAaaAK...',
    '...KBBBBK...',
    '...KBKKBK...',
    '..KFFKKFFK..',
    '..KKK..KKK..',
  ],
};

export const CHARS = [
  { id: 'explorer', name: 'Explorer', ui: '#4f9a4a', pal: { T: '#d8a860', t: '#7a4a28', H: '#6b4226', S: '#f2c29a', r: '#ec8f80', A: '#56a64e', a: '#3c7a37', B: '#8a6440', F: '#3d2a1f' } },
  { id: 'knight', name: 'Knight', ui: '#3c6fd1', pal: { G: '#b9c2d0', g: '#7d8699', L: '#f2f5fa', P: '#e8414f', W: '#ffffff', S: '#b9c2d0', A: '#3c6fd1', a: '#2a4f9e', B: '#7d8699', F: '#3b3f52' } },
  { id: 'astronaut', name: 'Astronaut', ui: '#ff8a3d', pal: { w: '#f1f4f8', V: '#8fd6ff', v: '#ffffff', S: '#f2c29a', A: '#f1f4f8', a: '#ff8a3d', B: '#d0d6e2', F: '#ff8a3d' } },
  { id: 'ninja', name: 'Ninja', ui: '#e8414f', pal: { N: '#353a5c', n: '#252942', R: '#e8414f', S: '#f2c29a', A: '#353a5c', a: '#e8414f', B: '#353a5c', F: '#1b1e33' } },
  { id: 'robot', name: 'Robot', ui: '#ffb43c', pal: { M: '#ffb43c', m: '#c97a1a', D: '#1b1e33', C: '#6ff7ff', Y: '#ff5d5d', S: '#9aa3b5', A: '#ffb43c', a: '#c97a1a', B: '#7d8699', F: '#4b5063' } },
  { id: 'pirate', name: 'Pirate', ui: '#d63a3a', pal: { R: '#d63a3a', W: '#ffffff', H: '#2a2020', S: '#e8b48a', r: '#e0806a', A: '#f5f0e6', a: '#3a5bd1', B: '#4a3426', F: '#2a2020' } },
];
export const charOf = id => CHARS.find(c => c.id === id) || CHARS[0];

// Returns the 12x16 frame canvas for a character, facing 1 (right) or -1 (left).
export function charFrame(ch, frame, face = 1, bob = 0) {
  const key = `${ch.id}:${frame}:${bob}`;
  let c = cache.get(key);
  if (!c) {
    const pal = { K: OUT, E: OUT, ...ch.pal };
    c = document.createElement('canvas'); c.width = 12; c.height = 16;
    const x = c.getContext('2d');
    x.drawImage(compile(BODIES[frame], pal), 0, 9);
    x.drawImage(compile(HEADS[ch.id], pal), 0, bob);
    cache.set(key, c);
  }
  return face < 0 ? mirror(c, key + ':m') : c;
}

// ---------- small sprites
export const SPR = {};
export function initSprites() {
  const P = { K: OUT, W: '#ffffff', w: '#dfe6f0', g: '#9aa3b5', d: '#5d6475', D: '#2f3340', r: '#e8414f', R: '#ff6b6b', o: '#ff9a3c', y: '#ffd84a', b: '#8a5a32', B: '#5c3a1e', l: '#c98b4f', L: '#e0aa6e', G: '#5ccf5f', s: '#3b3f52' };
  SPR.spike = compile([
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...K.......K....',
    '..KWK.....KWK...',
    '..KWK.....KWK...',
    '.KWwgK...KWwgK..',
    '.KWwgK...KWwgK..',
    'KWwwggK.KWwwggK.',
    'KWwwggKKKWwwggKK',
    'KddddddddddddddK',
    'KKKKKKKKKKKKKKKK',
  ], P);
  SPR.popSpike = compile([   // 16x10, slides up out of the floor
    '.K...K...K...K..',
    'KWK.KWK.KWK.KWK.',
    'KWK.KWK.KWK.KWK.',
    'KWgKKWgKKWgKKWgK',
    'KWgKKWgKKWgKKWgK',
    'KWwgKWwgKWwgKWwg',
    'KWwgKWwgKWwgKWwg',
    'KwwgKwwgKwwgKwwg',
    'KwwgKwwgKwwgKwwg',
    'KggdKggdKggdKggd',
  ], P);
  SPR.slots = compile(['KDDKKDDKKDDKKDDK', 'KssKKssKKssKKssK'], P);
  SPR.plank = compile([
    'KKKKKKKKKKKKKKKK',
    'KLLLLLLLKLLLLLLK',
    'KlllglllKllllglK',
    'KlllllllKlllllll',
    'KbbbbbbbKbbbbbbK',
    'KKKKKKKKKKKKKKKK',
  ], P);
  SPR.oneway = compile([
    'KKKKKKKKKKKKKKKK',
    'LLLLLLLLLLLLLLLL',
    'lllllllglllllll.',
    'bbbbbbbbbbbbbbbb',
    'KKKKKKKKKKKKKKKK',
    '..KbK......KbK..',
    '...KbK....KbK...',
    '....KK....KK....',
  ], P);
  SPR.cannon = compile([
    '................',
    '................',
    '................',
    '................',
    '....KKKKKKK.....',
    '...KDDDDDDDKKKKK',
    '..KDgWDDDDDDDDdK',
    '..KDWDDDDDDDDDsK',
    '..KDDDDDDDDDDDsK',
    '..KDDDDDDDDDdKKK',
    '...KDDDDDDDKK...',
    '..KKKKKKKKKKK...',
    '.KbbbbbbbbbbbK..',
    '.KbKKKbbbKKKbK..',
    '.KKgdKKKKKgdKK..',
    '..KKK.....KKK...',
  ], P);
  SPR.ball = compile([
    '..KKKK..',
    '.KDDDDK.',
    'KDgWDDDK',
    'KDWDDDDK',
    'KDDDDDDK',
    'KDDDDDsK',
    '.KDDDsK.',
    '..KKKK..',
  ], P);
  SPR.nozzle = compile([
    '.KKKKKKKKKKKKKK.',
    'KgggggggggggggdK',
    'KgKKKKKKKKKKKKdK',
    'KgKoKDKoKDKoKKdK',
    'KgKKKKKKKKKKKKdK',
    'KddddddddddddddK',
    'KKKKKKKKKKKKKKKK',
    'KdgggggggggggggK',
    'KdgDDDDDDDDDDggK',
    'KdgDsssssssssDgK',
    'KdgDDDDDDDDDDggK',
    'KdgggggggggggggK',
    'KdgDDDDDDDDDDggK',
    'KdgDsssssssssDgK',
    'KdgggggggggggggK',
    'KKKKKKKKKKKKKKKK',
  ], P);
  for (const [k, top] of [['spring0', 0], ['spring1', 4]]) {
    const coil = top ? ['................', '................', '................', '................', '.KKKKKKKKKKKKKK.', 'KRRRRRRRRRRRRrrK', 'KKKKKKKKKKKKKKKK', '...KgKKKKKKgK...', '....KgggggggK...']
      : ['.KKKKKKKKKKKKKK.', 'KRRRRRRRRRRRRrrK', 'KKKKKKKKKKKKKKKK', '...KgK....KgK...', '....KggggggK....', '...KgK....KgK...', '....KggggggK....', '...KgK....KgK...', '....KggggggK....'];
    SPR[k] = compile([...coil,
      '..KKKKKKKKKKKK..',
      '.KyyyyyyyyyyyyK.',
      '.KyoyyyyyyyyoyK.',
      '.KyyyyyyyyyyyyK.',
      '.KooooooooooooK.',
      '.KKKKKKKKKKKKKK.',
      '................'], P);
  }
  const flag = (c1, c2) => [
    ['KK..........', 'KgKKKKKKK...', 'KgK' + c1.repeat(6) + 'K..', 'KgK' + c1.repeat(5) + c2 + 'KK.', 'KgK' + c1.repeat(4) + c2 + 'KK..', 'KgKKKKKKK...', 'Kg..........'],
    ['KK..........', 'KgKKKKKK....', 'KgK' + c1.repeat(5) + 'KK..', 'KgK' + c1.repeat(6) + c2 + 'K.', 'KgK' + c1.repeat(5) + c2 + 'KK.', 'KgKKKKKKKK..', 'Kg..........'],
  ];
  const pole = ['Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'Kg', 'KK'];
  for (const [k, c1, c2] of [['flagOff', 'w', 'g'], ['flagOn', 'G', 'D']]) flag(c1, c2).forEach((f, i) => { SPR[k + i] = compile([...f, ...pole.map(r => r + '..........'), 'KKKK........', 'KbbbK.......', 'KKKKK.......'], { ...P, D: '#3a9a3e' }); });
  // checkered goal flag, 2 frames
  const ck = (o) => Array.from({ length: 8 }, (_, j) => 'KgK' + Array.from({ length: 10 }, (_, i) => ((Math.floor((i + o * (j > 3 ? 1 : 0)) / 2) + Math.floor(j / 2)) % 2 ? 'D' : 'W')).join('') + 'K');
  for (const f of [0, 1]) SPR['goal' + f] = compile([
    '.Ky.' + '.'.repeat(11),
    'KyyK' + '.'.repeat(11),
    '.KK' + 'K'.repeat(11) + '.',
    ...ck(f),
    'KgK' + 'K'.repeat(11),
    ...Array.from({ length: 22 }, () => 'KgK' + '.'.repeat(12)),
    'KKKKK' + '.'.repeat(10),
    'KbbbbK' + '.'.repeat(9),
    'KKKKKK' + '.'.repeat(9),
  ], { ...P, D: '#1c1424' });
  // trap icons for the trapper's buttons (7x7, white)
  const I = { W: '#ffffff' };
  SPR.icon = {
    spikes: compile(['.......', '...W...', '..WWW..', '..WWW..', '.WWWWW.', '.WWWWW.', '.......'], I),
    trapdoor: compile(['WWW.WWW', '.......', '...W...', '...W...', '.WWWWW.', '..WWW..', '...W...'], I),
    cannon: compile(['.......', '..WWW..', '.WWWWW.', '.WWWWW.', '.WWWWW.', '..WWW..', '.......'], I),
    crusher: compile(['WWWWWWW', 'WWWWWWW', 'WWWWWWW', 'W.W.W.W', '.......', '...W...', '..WWW..'], I),
    flame: compile(['...W...', '..WW...', '..WWW..', '.WWWW..', '.WW.WW.', '.WW.WW.', '..WWW..'], I),
  };
}

// 3x5 pixel digits
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
export function drawDigits(ctx, str, x, y, col) {
  ctx.fillStyle = col;
  for (const ch of String(str)) {
    const d = DIG[+ch];
    if (d) for (let i = 0; i < 15; i++) if (d[i] === '1') ctx.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

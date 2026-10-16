// Cosmetics: hats, scarves and shirt colours for your runner, each unlocked by a trophy (achievements.js) or by
// gems collected along risky routes. They change nothing in play. A dressed runner is a character object with its
// own id (so sprite caches keep each look apart) that charFrame (sprites.js) draws with the extras on top.
import { CHARS, charOf } from './sprites.js';
import { has } from './achievements.js';

// Hats sit over the top four rows of the head; K is the outline, the other keys their own colours.
export const HATS = {
  straw:   { name: 'Straw hat', need: 'first_flag', pal: { Y: '#f0d27a', y: '#c9963a' }, rows: ['...KKKKKK...', '..KYYYYYYK..', '..KyyyyyyK..', 'KYYYYYYYYYYK'] },
  flower:  { name: 'Flower', need: 'flawless', pal: { W: '#fdf6e6', Y: '#f0be4a', G: '#6fa046' }, rows: ['........KK..', '.......KWWK.', '.......KWYWK', '........KGK.'] },
  cap:     { name: 'Cap', need: 'catch5', pal: { B: '#4aa3b2', b: '#2f6a78' }, rows: ['............', '...KKKKKK...', '..KBBBBBBK..', '..KbbbbbbbbK'] },
  band:    { name: 'Headband', need: 'speedster', pal: { R: '#d9663f' }, rows: ['............', '............', '.KRRRRRRRRKR', '..........RR'] },
  party:   { name: 'Party hat', need: 'rivals', pal: { R: '#d9663f', Y: '#f0be4a', W: '#fdf6e6' }, rows: ['.....KWK....', '....KRYK....', '...KYRYRK...', '..KRYRYRYK..'] },
  witch:   { name: 'Witch hat', need: 'ghostbuster', pal: { P: '#8e5a86', p: '#5e3a5a' }, rows: ['......KK....', '.....KPPK...', '...KKpppPK..', 'KPPPPPPPPPPK'] },
  antlers: { name: 'Antlers', need: 'trap_master', pal: { N: '#a0703c' }, rows: ['.K.K....K.K.', '.KNKK..KKNK.', '..KNNKKNNK..', '............'] },
  crown:   { name: 'Crown', need: 'champion', pal: { Y: '#f0be4a', O: '#b9851f', R: '#d9663f' }, rows: ['..KK.KK.KK..', '..KYKYYKYK..', '..KYYRYYYK..', '.KOOOOOOOOK.'] },
  gem:     { name: 'Gem circlet', gems: 60, pal: { Y: '#f0be4a', C: '#7fd6e0' }, rows: ['............', '............', '.KYYYCYYYYK.', '..KKKKKKKK..'] },
};
// Scarves wrap the neck (rows 8-11) with a tail flying behind.
const SCARF_ROWS = ['..KRRRRRRK..', '.KRrrrrrRK..', 'KRK.........', 'KK..........'];
export const SCARVES = {
  brick: { name: 'Red scarf', need: 'first_catch', pal: { R: '#d9663f', r: '#9e3f24' } },
  teal:  { name: 'Teal scarf', need: 'combo', pal: { R: '#4aa3b2', r: '#2f6a78' } },
  honey: { name: 'Honey scarf', need: 'endless5', pal: { R: '#f0be4a', r: '#b9851f' } },
  plum:  { name: 'Plum scarf', need: 'variety', pal: { R: '#a46a9a', r: '#6e4068' } },
  gold:  { name: 'Gem scarf', gems: 120, pal: { R: '#7fd6e0', r: '#3f8f9c' } },
};
// Shirt colours: the shirt (A) and its shade (a).
export const TINTS = {
  moss:  { name: 'Moss', need: 'close5', A: '#7fb04e', a: '#5a8a36' },
  plum:  { name: 'Plum', need: 'assist', A: '#a46a9a', a: '#7a4a72' },
  teal:  { name: 'Teal', need: 'shield_save', A: '#4aa3b2', a: '#2f6a78' },
  honey: { name: 'Honey', need: 'gauntlet', A: '#f0be4a', a: '#b9851f' },
  brick: { name: 'Brick', need: 'daredevil', A: '#d9663f', a: '#9e3f24' },
  night: { name: 'Midnight', need: 'endless10', A: '#3a3f6a', a: '#252942' },
  gem:   { name: 'Crystal', gems: 200, A: '#7fd6e0', a: '#3f8f9c' },
};
export const SLOTS = { hat: HATS, scarf: SCARVES, tint: TINTS };

let gemCount = () => 0;
export function setGemCounter(f) { gemCount = f; }
export const unlocked = item => item && (item.need ? has(item.need) : item.gems ? gemCount() >= item.gems : true);
// only keep what this device has really unlocked (or, for other players, what they say they wear)
export function cleanCos(cos, mine = true) {
  const out = {};
  if (!cos || typeof cos !== 'object') return out;
  for (const k in SLOTS) { const id = cos[k]; if (typeof id === 'string' && SLOTS[k][id] && (!mine || unlocked(SLOTS[k][id]))) out[k] = id; }
  return out;
}
const dressedCache = new Map();
// player {char, cos} -> a character object for charFrame
export function dressed(p) {
  const base = charOf(p && p.char), cos = (p && p.cos) || {};
  if (!cos.hat && !cos.scarf && !cos.tint) return base;
  const id = `${base.id}|${cos.hat || ''}|${cos.scarf || ''}|${cos.tint || ''}`;
  if (dressedCache.has(id)) return dressedCache.get(id);
  const t = TINTS[cos.tint], h = HATS[cos.hat], s = SCARVES[cos.scarf];
  const ch = { ...base, id, base: base.id, pal: t ? { ...base.pal, A: t.A, a: t.a } : base.pal,
    hat: h ? { rows: h.rows, pal: h.pal } : null, scarf: s ? { rows: SCARF_ROWS, pal: s.pal } : null };
  dressedCache.set(id, ch);
  return ch;
}
export const ALL_CHARS = CHARS;

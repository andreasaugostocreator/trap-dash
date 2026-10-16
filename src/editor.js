// The level editor: paint a level tile by tile on the real game view, test it, and share it as a code.
// A level is the same ASCII map the built-in levels use (see the legend in levels.js), 18 rows tall, 40 to 240
// columns wide, with walls on both ends. Share codes are the map, the name and the world, deflated and base64url'd
// ("TD1." + data), or plain base64 ("TD0.") where the browser can't compress. Levels you make or import are kept on
// this device and show up in the lobby under "My levels", ready to play on one screen or online (the host shares
// the level itself, the same way random levels travel).
import { World } from './sim.js';
import { TILE } from './config.js';

export const ED_H = 18, ED_MIN_W = 40, ED_MAX_W = 240;
// The palette: [map letter, label, icon (an SPR.icon name or a colour swatch), group]
export const PALETTE = [
  ['#', 'Ground', '#8d5a31', 'Land'], ['=', 'Ledge', '#c98b4f', 'Land'], ['B', 'Spring', 'boots', 'Land'], ['L', 'Crumble', '#a0a0b0', 'Land'],
  ['M', 'Mover', '#7a6a56', 'Land'], ['N', 'Lift', '#5a4a3a', 'Land'], ['R', 'Rope', '#c9a77a', 'Land'], ['j', 'Ice block', '#bfe9ff', 'Land'],
  ['S', 'Start', '#6fa046', 'Marks'], ['G', 'Flag', '#f0be4a', 'Marks'], ['C', 'Checkpoint', '#4aa3b2', 'Marks'],
  ['^', 'Spikes (always)', '#e6e6ee', 'Hazards'], ['v', 'Ceiling spikes', '#c0c0cc', 'Hazards'],
  ['P', 'Pop-up spikes', 'spikes', 'Traps'], ['T', 'Trapdoor', 'trapdoor', 'Traps'], ['X', 'Crusher', 'crusher', 'Traps'], ['F', 'Flame', 'flame', 'Traps'],
  ['W', 'Fan', 'fan', 'Traps'], ['Z', 'Saw rail', 'saw', 'Traps'], ['Q', 'Conveyor', 'conveyor', 'Traps'], ['I', 'Ice floor', 'ice', 'Traps'],
  ['U', 'Wall', 'wall', 'Traps'], ['>', 'Cannon →', 'cannon', 'Traps'], ['<', 'Cannon ←', 'cannon', 'Traps'], ['}', 'Arrows →', 'arrows', 'Traps'],
  ['{', 'Arrows ←', 'arrows', 'Traps'], ['K', 'Laser →', 'laser', 'Traps'], ['k', 'Laser ←', 'laser', 'Traps'], ['D', 'Bomb dropper', 'dropper', 'Traps'],
  ['.', 'Eraser', '#ffffff', 'Tools'],
];
export const ED_THEMES = ['day', 'sunset', 'night', 'sky', 'dusk', 'lava', 'ice', 'pirate', 'haunted'];
const VALID = new Set(PALETTE.map(p => p[0]));

export function blankLevel(w = 80) {
  const rows = [];
  for (let y = 0; y < ED_H; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += x === 0 || x === w - 1 || y >= 14 ? '#' : '.';
    rows.push(r);
  }
  const set = (x, y, c) => { rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1); };
  set(3, 13, 'S'); set(w - 4, 13, 'G');
  return { id: 'c' + Date.now().toString(36), name: 'My level', theme: 'day', map: rows, custom: true };
}

// keep a map well formed: 18 rows, the right width, only known letters, walls on both ends, one start and one flag
export function tidy(level) {
  const w = Math.max(ED_MIN_W, Math.min(ED_MAX_W, Math.max(...level.map.map(r => r.length))));
  const rows = [];
  for (let y = 0; y < ED_H; y++) {
    let r = (level.map[y] || '').padEnd(w, '.').slice(0, w);
    r = [...r].map((c, x) => x === 0 || x === w - 1 ? '#' : VALID.has(c) ? c : '.').join('');
    rows.push(r);
  }
  return { ...level, map: rows, name: String(level.name || 'My level').slice(0, 24), theme: ED_THEMES.includes(level.theme) ? level.theme : 'day', custom: true };
}
export function problems(level) {
  const all = level.map.join(''), out = [];
  const n = c => all.split(c).length - 1;
  if (n('S') !== 1) out.push(n('S') ? 'only one start, please' : 'place a start (S)');
  if (n('G') !== 1) out.push(n('G') ? 'only one flag, please' : 'place the flag');
  return out;
}

// ---------- share codes
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(bytes, stream) { const r = new Blob([bytes]).stream().pipeThrough(stream); return new Uint8Array(await new Response(r).arrayBuffer()); }
export async function encodeLevel(level) {
  const txt = [level.name, level.theme, level.map.join('|')].join('~'), raw = new TextEncoder().encode(txt);
  if (typeof CompressionStream === 'function') { try { return 'TD1.' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { /* fall back */ } }
  return 'TD0.' + b64u(raw);
}
export async function decodeLevel(code) {
  code = String(code || '').trim().replace(/^.*[?&]level=/, '').replace(/\s+/g, '');
  const m = /^TD([01])\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!m) throw new Error('That is not a Trap Dash level code.');
  let bytes = unb64u(m[2]);
  if (m[1] === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const [name, theme, map] = new TextDecoder().decode(bytes).split('~');
  if (!map) throw new Error('That code is damaged.');
  return tidy({ id: 'c' + Date.now().toString(36), name, theme, map: map.split('|') });
}

// ---------- the editing session: a level, the camera, undo, painting
export class EditSession {
  constructor(level) { this.level = tidy(level); this.undo = []; this.tool = '#'; this.cam = { x: 0, y: 0 }; this.rebuild(); }
  get w() { return this.level.map[0].length; }
  rebuild() { this.world = new World({ ...this.level, noGems: false }); this.dirty = false; }
  snapshot() { this.undo.push(this.level.map.slice()); if (this.undo.length > 60) this.undo.shift(); }
  back() { const m = this.undo.pop(); if (!m) return false; this.level.map = m; this.rebuild(); return true; }
  get(x, y) { return (this.level.map[y] || '')[x]; }
  set(x, y, c) {
    if (x <= 0 || x >= this.w - 1 || y < 0 || y >= ED_H) return false;
    if (this.get(x, y) === c) return false;
    const rows = this.level.map;
    if (c === 'S' || c === 'G') for (let j = 0; j < ED_H; j++) rows[j] = rows[j].replaceAll(c, '.');   // only one of each
    rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
    this.dirty = true;
    return true;
  }
  resize(w) {
    w = Math.max(ED_MIN_W, Math.min(ED_MAX_W, w));
    this.snapshot();
    this.level.map = this.level.map.map((r, y) => {
      const body = r.slice(0, -1);   // drop the right wall, grow or cut, put the wall back
      const grown = w - 1 > body.length ? body + (y >= 14 ? '#' : '.').repeat(w - 1 - body.length) : body.slice(0, w - 1);
      return grown + '#';
    });
    this.level = tidy(this.level); this.rebuild();
  }
  tileAt(wx, wy) { return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) }; }
}

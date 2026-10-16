// Little synthesized sound effects and a bouncy background tune, all WebAudio, no files.
// Two volumes, 0..1: sound effects and music (0 = off). Older saves had on / off switches; they map onto these.
let ac = null, master = null, musicGain = null, sfxGain = null, musicTimer = null;
export const audio = { muted: false, music: true, sfxVol: 0.8, musicVol: 0.6 };
try {
  const s = JSON.parse(localStorage.getItem('trapdash-audio') || '{}'); Object.assign(audio, s);
  if (s.sfxVol == null && s.muted) audio.sfxVol = 0;
  if (s.musicVol == null && (s.muted || s.music === false)) audio.musicVol = 0;
  audio.muted = false; audio.music = audio.musicVol > 0;
} catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem('trapdash-audio', JSON.stringify({ sfxVol: audio.sfxVol, musicVol: audio.musicVol })); } catch { /* ignore */ } };
const MUSIC_MAX = 0.37;   // music sits under the effects: 0.6 gives the old level

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = audio.musicVol * MUSIC_MAX; musicGain.connect(master);
    sfxGain = ac.createGain(); sfxGain.gain.value = audio.sfxVol; sfxGain.connect(master);
  }
  if (ac.state === 'suspended') ac.resume();
}
export function setSfxVolume(v) { audio.sfxVol = Math.max(0, Math.min(1, v)); if (sfxGain) sfxGain.gain.value = audio.sfxVol; save(); }
// returns true when the music has just been switched on (the caller starts the right song)
export function setMusicVolume(v) {
  const was = audio.music;
  audio.musicVol = Math.max(0, Math.min(1, v)); audio.music = audio.musicVol > 0;
  if (musicGain) musicGain.gain.value = audio.musicVol * MUSIC_MAX;
  save(); if (!audio.music) stopMusic();
  return audio.music && !was;
}

function tone(f, dur, { type = 'square', vol = 0.3, slide = 0, delay = 0, out } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out || sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, freq = 1200, delay = 0, q = 1 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
}

export const sfx = {
  jump: () => tone(380, 0.14, { slide: 420, vol: 0.12 }),
  land: () => noise(0.08, { vol: 0.15, freq: 600 }),
  spring: () => { tone(300, 0.3, { slide: 900, vol: 0.14, type: 'triangle' }); tone(600, 0.2, { slide: 600, vol: 0.06, delay: 0.05 }); },
  die: () => { tone(520, 0.35, { slide: -440, vol: 0.18, type: 'sawtooth' }); noise(0.25, { vol: 0.25, freq: 1800 }); },
  spawn: () => tone(660, 0.12, { slide: 300, vol: 0.08, type: 'triangle' }),
  cp: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, { vol: 0.1, delay: i * 0.07, type: 'triangle' })),
  goal: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.2, { vol: 0.12, delay: i * 0.09, type: 'square' })),
  warn: () => tone(1100, 0.06, { vol: 0.06, type: 'square' }),
  spikes: () => { noise(0.1, { vol: 0.25, freq: 4000 }); tone(900, 0.08, { slide: 400, vol: 0.08 }); },
  trapdoor: () => { noise(0.18, { vol: 0.3, freq: 700 }); tone(160, 0.15, { slide: -80, vol: 0.12 }); },
  cannon: () => { noise(0.3, { vol: 0.45, freq: 500 }); tone(120, 0.2, { slide: -70, vol: 0.2, type: 'triangle' }); },
  crusher: () => tone(240, 0.12, { slide: -120, vol: 0.1, type: 'triangle' }),
  thud: () => { noise(0.35, { vol: 0.5, freq: 300 }); tone(70, 0.3, { slide: -30, vol: 0.3, type: 'sine' }); },
  flame: () => noise(0.9, { vol: 0.25, freq: 1400, q: 0.5 }),
  poof: () => noise(0.08, { vol: 0.12, freq: 900 }),
  bonk: () => tone(200, 0.06, { vol: 0.08 }),
  close: () => noise(0.06, { vol: 0.12, freq: 800 }),
  arrows: () => { noise(0.06, { vol: 0.2, freq: 5000 }); tone(1400, 0.06, { slide: -600, vol: 0.06, type: 'triangle' }); },
  wall: () => { noise(0.2, { vol: 0.35, freq: 400 }); tone(90, 0.2, { slide: 60, vol: 0.2, type: 'square' }); },
  fan: () => noise(1.2, { vol: 0.18, freq: 2500, q: 0.3 }),
  airjump: () => tone(600, 0.15, { slide: 600, vol: 0.1, type: 'triangle' }),
  zap: () => { noise(0.4, { vol: 0.5, freq: 3000 }); tone(1800, 0.25, { slide: -1500, vol: 0.12, type: 'sawtooth' }); },
  stun: () => [880, 660, 880].forEach((f, i) => tone(f, 0.08, { vol: 0.07, delay: i * 0.08, type: 'square' })),
  block: () => { tone(1200, 0.2, { slide: 400, vol: 0.12, type: 'triangle' }); tone(1800, 0.15, { vol: 0.06, delay: 0.05 }); },
  bolt: () => tone(200, 0.6, { slide: 100, vol: 0.05, type: 'sawtooth' }),
  glue: () => noise(0.25, { vol: 0.25, freq: 500, q: 3 }),
  gust: () => noise(1.0, { vol: 0.2, freq: 1200, q: 0.4 }),
  hex: () => [500, 400, 300, 450].forEach((f, i) => tone(f, 0.12, { vol: 0.08, delay: i * 0.07, type: 'square' })),
  dash: () => noise(0.15, { vol: 0.25, freq: 2500 }),
  shield: () => tone(500, 0.3, { slide: 700, vol: 0.1, type: 'triangle' }),
  jam: () => { noise(0.5, { vol: 0.3, freq: 6000 }); [300, 200, 300, 200].forEach((f, i) => tone(f, 0.06, { vol: 0.06, delay: i * 0.06 })); },
  saw: () => { tone(1500, 0.5, { slide: 300, vol: 0.05, type: 'sawtooth' }); noise(0.5, { vol: 0.12, freq: 4500, q: 2 }); },
  laser: () => { tone(2400, 0.3, { slide: -1800, vol: 0.09, type: 'square' }); tone(1200, 0.3, { vol: 0.05, type: 'sawtooth' }); },
  dropper: () => tone(900, 0.4, { slide: -700, vol: 0.08, type: 'triangle' }),
  conveyor: () => [0, 1, 2, 3].forEach(i => noise(0.05, { vol: 0.12, freq: 900, delay: i * 0.1 })),
  ice: () => [1800, 2400, 2100].forEach((f, i) => tone(f, 0.1, { vol: 0.05, delay: i * 0.05, type: 'triangle' })),
  pop: () => { noise(0.2, { vol: 0.35, freq: 1200 }); tone(400, 0.15, { slide: 500, vol: 0.1, type: 'triangle' }); },
  mine: () => tone(300, 0.08, { vol: 0.08, type: 'square' }),
  bat: () => [700, 900, 700].forEach((f, i) => tone(f, 0.05, { vol: 0.05, delay: i * 0.05, type: 'square' })),
  frost: () => [2000, 1600, 2200].forEach((f, i) => tone(f, 0.15, { vol: 0.05, delay: i * 0.06, type: 'triangle' })),
  fog: () => noise(0.8, { vol: 0.15, freq: 400, q: 0.3 }),
  anvil: () => tone(110, 0.4, { slide: -40, vol: 0.18, type: 'square' }),
  moon: () => tone(300, 0.6, { slide: 500, vol: 0.08, type: 'sine' }),
  rewind: () => tone(1200, 0.4, { slide: -1000, vol: 0.1, type: 'sawtooth' }),
  squash: () => tone(500, 0.2, { slide: -350, vol: 0.1, type: 'square' }),
  blink: () => { tone(1500, 0.08, { vol: 0.08, type: 'triangle' }); tone(2200, 0.1, { vol: 0.06, delay: 0.06, type: 'triangle' }); },
  glider: () => noise(0.4, { vol: 0.1, freq: 1500, q: 0.5 }),
  boots: () => tone(400, 0.2, { slide: 600, vol: 0.1, type: 'square' }),
  haste: () => [600, 800, 1000].forEach((f, i) => tone(f, 0.06, { vol: 0.07, delay: i * 0.04, type: 'square' })),
  slowmo: () => tone(800, 0.8, { slide: -600, vol: 0.1, type: 'sine' }),
  flag: () => [523, 784].forEach((f, i) => tone(f, 0.12, { vol: 0.09, delay: i * 0.07, type: 'triangle' })),
  decoy: () => tone(700, 0.2, { slide: -200, vol: 0.08, type: 'triangle' }),
  phase: () => tone(300, 0.5, { slide: 900, vol: 0.06, type: 'sine' }),
  magnet: () => tone(150, 0.3, { vol: 0.12, type: 'square' }),
  peek: () => [1000, 1000].forEach((f, i) => tone(f, 0.05, { vol: 0.06, delay: i * 0.12, type: 'sine' })),
  kaching: (streak = 1) => {   // a catch: coin-register sparkle, higher and longer with a combo
    const base = 880 * Math.pow(1.12, Math.min(6, streak - 1));
    [0, 0.07, 0.14].forEach((d, i) => tone(base * [1, 1.26, 1.5][i], 0.18, { vol: 0.1, delay: d, type: 'square' }));
    tone(base * 2, 0.35, { vol: 0.07, delay: 0.21, type: 'triangle' });
    noise(0.12, { vol: 0.12, freq: 6000, delay: 0.02 });
  },
  achieve: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.16, { vol: 0.09, delay: i * 0.08, type: 'triangle' })),
  step: (alt) => noise(0.035, { vol: 0.06, freq: alt ? 900 : 700, q: 2 }),
  whoosh: () => noise(0.3, { vol: 0.16, freq: 1800, q: 0.7 }),
  chirp: () => { const f = 2400 + Math.random() * 900; [0, 0.09, 0.18].slice(0, 2 + Math.floor(Math.random() * 2)).forEach(d => tone(f, 0.06, { slide: 500, vol: 0.025, delay: d, type: 'sine' })); },
  cricket: () => [0, 0.05, 0.1, 0.15].forEach(d => tone(4200, 0.03, { vol: 0.012, delay: d, type: 'square' })),
  drip: () => tone(1400 + Math.random() * 400, 0.12, { slide: -700, vol: 0.04, type: 'sine' }),
  crack: () => noise(0.08, { vol: 0.15, freq: 2500, q: 3 }),
  crumble: () => { noise(0.35, { vol: 0.3, freq: 500 }); tone(140, 0.25, { slide: -60, vol: 0.12, type: 'triangle' }); },
  grab: () => tone(500, 0.08, { slide: 200, vol: 0.08, type: 'triangle' }),
  fooled: () => [880, 660, 990].forEach((f, i) => tone(f, 0.1, { vol: 0.07, delay: i * 0.06, type: 'triangle' })),
  click: () => { noise(0.035, { vol: 0.2, freq: 2600, q: 5 }); tone(560, 0.05, { slide: -220, vol: 0.07, type: 'triangle' }); tone(1180, 0.02, { vol: 0.025, type: 'square' }); },   // a wooden clack
  // the title world's ambience
  wind: () => noise(2.2, { vol: 0.05, freq: 500, q: 0.4 }),
  wave: () => { noise(2.6, { vol: 0.07, freq: 700, q: 0.3 }); noise(1.2, { vol: 0.04, freq: 2400, q: 0.3, delay: 1.2 }); },
  owl: () => [0, 0.32].forEach(d => tone(420, 0.22, { slide: -60, vol: 0.03, delay: d, type: 'sine' })),
  count: () => tone(660, 0.12, { vol: 0.12, type: 'square' }),
  go: () => tone(990, 0.3, { vol: 0.14, type: 'square' }),
  denied: () => tone(140, 0.1, { vol: 0.1, type: 'square' }),
};

export function playEvent([k, , , extra]) {
  if (k === 'fire') return (sfx[extra] || sfx.warn)();
  if (k === 'warn') return sfx.warn();
  if (k === 'gadget') return (sfx[extra] || sfx.click)();
  if (k === 'poof' && extra === 'arrows') return;
  if (sfx[k]) sfx[k]();
}

// Music: one short loop per world. Each song is a chord progression, a scale and a motif; the lead line is built
// from the motif over each chord, so every world has its own tune and mood. Scheduled a bar ahead.
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10];
const SONGS = {
  title:   { bpm: 84, root: 65, scale: MAJ, prog: [0, 3, 4, 0, 5, 3, 1, 4], motif: [[0, -1, 2, -1, 4, -1, 2, -1], [4, -1, 5, 4, 2, -1, -1, -1]], lead: 'triangle', bass: 'sine', bell: true, soft: true, pad: true },
  day:     { bpm: 132, root: 60, scale: MAJ, prog: [0, 0, 4, 4, 3, 3, 1, 4], motif: [[0, -1, 2, -1, 4, -1, 2, 1], [0, -1, 1, 2, 1, -1, 0, -1]], lead: 'square', bass: 'triangle' },
  sunset:  { bpm: 112, root: 65, scale: MAJ, prog: [0, 5, 3, 4, 0, 5, 1, 4], motif: [[4, -1, -1, 2, 1, -1, 0, -1], [2, -1, 4, -1, 5, 4, 2, -1]], lead: 'triangle', bass: 'triangle', swing: 0.12 },
  night:   { bpm: 100, root: 57, scale: MIN, prog: [0, 0, 5, 5, 3, 3, 4, 4], motif: [[0, 2, 4, 7, 4, 2, 0, -1], [-1, 4, -1, 2, 1, -1, 0, -1]], lead: 'triangle', bass: 'sine', soft: true },
  sky:     { bpm: 144, root: 67, scale: MAJ, prog: [0, 3, 4, 0, 5, 3, 1, 4], motif: [[0, 2, 4, 2, 7, 4, 2, 4], [5, 4, 2, -1, 4, 2, 0, -1]], lead: 'square', bass: 'triangle' },
  dusk:    { bpm: 116, root: 62, scale: DOR, prog: [0, 0, 6, 6, 3, 3, 4, 4], motif: [[0, -1, 2, 3, -1, 2, 0, -1], [4, -1, 3, -1, 2, 1, 0, -1]], lead: 'square', bass: 'sawtooth', soft: true },
  lava:    { bpm: 150, root: 52, scale: PHR, prog: [0, 0, 1, 0, 0, 0, 6, 1], motif: [[0, 0, 3, 0, 4, 3, 1, 0], [0, -1, 0, 1, 3, 1, 0, -1]], lead: 'sawtooth', bass: 'sawtooth' },
  ice:     { bpm: 108, root: 64, scale: MAJ, prog: [0, 3, 5, 4, 0, 3, 1, 4], motif: [[7, -1, 4, -1, 2, -1, 4, -1], [9, 7, -1, 4, -1, 2, -1, -1]], lead: 'sine', bass: 'triangle', bell: true },
  pirate:  { bpm: 168, root: 62, scale: MIN, prog: [0, 0, 6, 6, 5, 5, 4, 4], motif: [[0, 2, 4, 4, 2, 0, 4, 2], [5, 4, 2, 1, 0, -1, 0, -1]], lead: 'square', bass: 'triangle', swing: 0.18 },
  haunted: { bpm: 92, root: 59, scale: MIN, prog: [0, 1, 0, 1, 5, 4, 0, 4], motif: [[0, -1, 1, 0, -1, 4, 3, -1], [7, -1, 6, -1, 5, -1, 4, -1]], lead: 'sawtooth', bass: 'sine', soft: true },
  endless: { bpm: 156, root: 60, scale: MIN, prog: [0, 5, 2, 6, 0, 5, 3, 4], motif: [[0, 4, 2, 4, 0, 4, 2, 4], [5, 4, 2, 4, 1, 2, 0, -1]], lead: 'square', bass: 'sawtooth' },
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const note = (S, deg) => S.root + S.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
let playing = null;
export function startMusic(song = 'day') {
  if (!ac || !audio.music) return;
  if (musicTimer && playing === song) return;
  stopMusic(); playing = song;
  const S = SONGS[song] || SONGS.day, beat = 60 / S.bpm / 2; let bar = 0, next = ac.currentTime + 0.1;
  const sched = () => {
    while (next < ac.currentTime + 0.6) {
      const b = bar % 8, chord = S.prog[b], motif = S.motif[b % 2];
      if (S.pad !== false) for (const k of [0, 2, 4]) tone(mtof(note(S, chord + k) - 12), beat * 7.6, { type: 'triangle', vol: S.soft ? 0.03 : 0.022, delay: next - ac.currentTime, out: musicGain });   // a soft chord under each bar
      for (let i = 0; i < 8; i++) {
        const d = next + i * beat + (i % 2 ? (S.swing || 0) * beat : 0) - ac.currentTime;
        if (i % 2 === 0) tone(mtof(note(S, chord) - 24 + (i === 4 ? 7 : 0)), beat * 1.6, { type: S.bass, vol: S.bass === 'sawtooth' ? 0.18 : 0.45, delay: d, out: musicGain });
        const m = motif[i];
        if (m >= 0) {
          tone(mtof(note(S, chord + m)), beat * (S.bell ? 2.2 : 0.9), { type: S.lead, vol: S.soft ? 0.08 : S.lead === 'sawtooth' ? 0.06 : 0.11, delay: d, out: musicGain });
          if (S.bell) tone(mtof(note(S, chord + m) + 12), beat * 1.4, { type: 'sine', vol: 0.04, delay: d, out: musicGain });
        }
        if (i % 4 === 2 || (S.bpm > 140 && i % 2 === 1)) noiseHat(d);
      }
      next += beat * 8; bar++;
    }
  };
  const noiseHat = d => { const t = ac.currentTime + d, n = 800, buf = ac.createBuffer(1, n, ac.sampleRate), x = buf.getChannelData(0); for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = 6000; g.gain.value = 0.25; s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); };
  sched(); musicTimer = setInterval(sched, 200);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; playing = null; }

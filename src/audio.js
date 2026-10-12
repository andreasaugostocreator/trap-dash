// Little synthesized sound effects and a bouncy background tune, all WebAudio, no files.
let ac = null, master = null, musicGain = null, musicTimer = null;
export const audio = { muted: false, music: true };
try { const s = JSON.parse(localStorage.getItem('trapdash-audio') || '{}'); Object.assign(audio, s); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem('trapdash-audio', JSON.stringify({ muted: audio.muted, music: audio.music })); } catch { /* ignore */ } };

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = audio.muted ? 0 : 0.5; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
  }
  if (ac.state === 'suspended') ac.resume();
}
export function setMuted(m) { audio.muted = m; if (master) master.gain.value = m ? 0 : 0.5; save(); }
export function setMusic(m) { audio.music = m; save(); if (!m) stopMusic(); }

function tone(f, dur, { type = 'square', vol = 0.3, slide = 0, delay = 0, out } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out || master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, freq = 1200, delay = 0, q = 1 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
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
  click: () => tone(880, 0.05, { vol: 0.07, type: 'triangle' }),
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

// A short loop: bass + plucky lead, 8 bars, in C major-ish. Scheduled a bar ahead.
const BASS = [48, 48, 55, 55, 53, 53, 50, 55];
const LEAD = [
  [72, 0, 76, 0, 79, 0, 76, 74], [72, 0, 74, 76, 74, 0, 72, 0], [71, 0, 74, 0, 79, 0, 77, 76], [74, 0, 72, 0, 71, 72, 74, 0],
  [77, 0, 76, 0, 74, 0, 72, 0], [76, 0, 74, 0, 72, 0, 69, 0], [71, 72, 74, 0, 76, 0, 74, 72], [71, 0, 67, 0, 71, 0, 74, 0],
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function startMusic() {
  if (!ac || !audio.music || musicTimer) return;
  const beat = 60 / 132 / 2; let bar = 0, next = ac.currentTime + 0.1;
  const sched = () => {
    while (next < ac.currentTime + 0.6) {
      const b = bar % 8;
      for (let i = 0; i < 8; i++) {
        const d = next + i * beat - ac.currentTime;
        if (i % 2 === 0) tone(mtof(BASS[b] - 12 + (i === 4 ? 7 : 0)), beat * 1.6, { type: 'triangle', vol: 0.5, delay: d, out: musicGain });
        const n = LEAD[b][i]; if (n) tone(mtof(n), beat * 0.9, { type: 'square', vol: 0.12, delay: d, out: musicGain });
        if (i % 4 === 2) noiseHat(d);
      }
      next += beat * 8; bar++;
    }
  };
  const noiseHat = d => { const t = ac.currentTime + d, n = 800, buf = ac.createBuffer(1, n, ac.sampleRate), x = buf.getChannelData(0); for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = 6000; g.gain.value = 0.25; s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); };
  sched(); musicTimer = setInterval(sched, 200);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

// Screens, the party flow and the game loop.
// A match is played level by level: each player gets one run as the runner while the other works the traps,
// then the faster runner wins the level. Online, the runner's device runs the world and streams it to the trapper.
import { DT, TIME_LIMIT, TILE, TRAPS, GADGETS, PHYS } from './config.js';
import { CHARS, charOf, charFrame, SPR } from './sprites.js';
import { World } from './sim.js';
import { LEVELS, THEMES } from './levels.js';
import { Renderer, viewH, UI, toUI, uiRect } from './render.js';
import { Scene } from './scene.js';
import { Net, cleanCode } from './net.js';
import { Bot } from './bot.js';
import { rateLevel } from './rating.js';
import { generate } from './gen.js';
const levelOf = ref => (typeof ref === 'number' ? LEVELS[ref] : ref);   // a level index, or a generated level object
const STARS = new Map();   // level id -> 1..3
const starsOf = L => { if (L.stars) return L.stars; if (!STARS.has(L.id)) STARS.set(L.id, rateLevel(L).stars); return STARS.get(L.id); };
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
import { sfx, playEvent, unlockAudio, audio, setMuted, setMusic, startMusic, stopMusic } from './audio.js';
import { settings, saveSettings, buzz, canVibrate } from './settings.js';
import { pollPads, BTN } from './gamepad.js';
import { drawKnob, drawStick, KICON, TICON, PLANK, pixURL, woodFrame } from './knobs.js';
// the pixel wood every frame in the menus is cut from (see style.css: --woodImg)
document.documentElement.style.setProperty('--woodImg', `url(${woodFrame()})`);
document.documentElement.style.setProperty('--woodImgDark', `url(${woodFrame('#3a2a1e')})`);
// the tagline sign's pixel stars (see PLANK.star) — set once the icons are drawn, below
// Pixel icons inside menu text: colour ones (PI) and the white button icons (PIW, darkened on paper buttons).
const PI = (name, cls = 'pi') => `<img class="${cls}" alt="" src="${pixURL(name)}">`;
const piwCache = {};
// Achievement medals: a little arcade cap in the achievement's colour with a game icon on it.
const ACH_ART = { first_flag: ['flag', 'aim'], flawless: ['phase', 'aim'], speedster: ['bolt', 'aim'], gauntlet: ['shield', 'runner'], daredevil: ['flame', 'red'],
  close5: ['dash', 'runner'], shield_save: ['shield', 'blue'], ghostbuster: ['phase', 'runner'], endless5: ['haste', 'blue'], endless10: ['glider', 'blue'],
  first_catch: ['spikes', 'trapper'], assist: ['gust', 'trapper'], combo: ['dropper', 'red'], catch5: ['crusher', 'trapper'], variety: ['saw', 'trapper'],
  trap_master: ['hex', 'red'], champion: ['trophy', 'aim'], rivals: ['decoy', 'blue'] };
const medalCache = {};
function medal(id, got = true) {
  const key = id + got;
  if (!medalCache[key]) {
    const [ic, pal] = ACH_ART[id] || ['flag', 'aim'], c = document.createElement('canvas');
    drawKnob(c, { r: 8, pal, icon: got ? SPR.icon[ic] || KICON[ic] : KICON.lockW, spent: !got });
    medalCache[key] = c.toDataURL();
  }
  return `<img class="medal" alt="" src="${medalCache[key]}">`;
}
const PIW = name => PLANK[name] ? `<img class="pi picon" alt="" src="${piwCache[name] || (piwCache[name] = PLANK[name].toDataURL())}">` : `<img class="pi bicon" alt="" src="${piwCache[name] || (piwCache[name] = (SPR.icon[name] || KICON[name]).toDataURL())}">`;
import { TrapScore, titleFor } from './score.js';
import { TRAINING, Tutorial } from './tutorial.js';
import { ACHIEVEMENTS, unlock, has, count as achCount, bump } from './achievements.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEBUG = new URLSearchParams(location.search).has('debug');
const store = {
  get(k, d) { try { const v = localStorage.getItem('trapdash-' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('trapdash-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const NICK = ['Ace', 'Pixel', 'Dash', 'Zip', 'Jinx', 'Moxie', 'Turbo', 'Scout'];
const me = store.get('me2', { name: NICK[Math.floor(Math.random() * NICK.length)] + Math.floor(Math.random() * 90 + 10), char: CHARS[Math.floor(Math.random() * CHARS.length)].id });
const saveMe = () => store.set('me2', me);
const otherChar = id => CHARS[(CHARS.findIndex(c => c.id === id) + 1) % CHARS.length].id;

const canvas = $('game'), R = new Renderer(canvas);
const net = new Net();
const touchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- party state
let mode = null;          // 'online' | 'local' | 'practice'
let isHost = false, roomCode = '';
let players = { a: null, b: null };  // a = host / player 1, b = guest / player 2
let lobby = { level: 0, first: 'a' };
let score = { a: 0, b: 0 };
let runs = [];            // results of the runs on the current level
let run = null;
const mySide = () => (mode === 'online' && !isHost ? 'b' : 'a');
const other = s => (s === 'a' ? 'b' : 'a');

// ---------- screens
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }

// A character sprite as a small canvas (CSS scales it up with image-rendering: pixelated).
function portrait(charId, frame = 'idle') {
  const c = document.createElement('canvas'); c.width = 16; c.height = 18; c.className = 'pix';
  c.getContext('2d').drawImage(charFrame(charOf(charId), frame, 1, 0), 2, 1);
  return c;
}

// ---------- title
// The logo has its own pixel lettering: chunky 6x7 letters with a light top row, a darker bottom, an ink outline and
// a drop shadow, pink for TRAP and blue for DASH.
const LOGO_GLYPHS = {
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  A: ['.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  S: ['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.'],
  H: ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
};
const LOGO_WORDS = ['TRAP', 'DASH'];
const LOGO_COLS = [['#ffd9a0', '#f5a54a', '#d9782a', '#8f4419'], ['#dcf0a6', '#9cc966', '#6fa046', '#3f6a24']];   // harvest orange, moss
function logoLetter(word, k) {
  const g = LOGO_GLYPHS[LOGO_WORDS[word][k]], [hi, base, mid, lo] = LOGO_COLS[word];
  const c = document.createElement('canvas'); c.width = 8; c.height = 11; c.className = 'pix logoLetter';
  const x = c.getContext('2d'), on = (i, j) => g[j] && g[j][i] === '#';
  x.fillStyle = '#3a2417';   // drop shadow, then outline
  for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) if (on(i, j)) x.fillRect(i + 1, j + 3, 1, 1);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) if (on(i, j)) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.fillRect(i + 1 + dx, j + 1 + dy, 1, 1);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) if (on(i, j)) { x.fillStyle = !on(i, j - 1) ? hi : !on(i, j + 1) ? mid : base; x.fillRect(i + 1, j + 1, 1, 1); }
  return c;
}
// The logo letters bob in a wave, and your runner runs along beside it.
(function dressTitle() {
  const logo = document.querySelector('.logo');
  let n = 0;
  logo.setAttribute('aria-label', 'Trap Dash');
  [...logo.querySelectorAll('span')].forEach((word, w) => {
    const letters = word.textContent.length;
    word.textContent = '';
    for (let k = 0; k < letters; k++) { const i = document.createElement('i'); i.style.setProperty('--i', n++); i.appendChild(logoLetter(w, k)); word.appendChild(i); }
  });
  // the big wooden tiles: each carries an arcade cap with its icon, in the colours the game uses for it
  const TILES = [['[data-go="host"]', 'host', 'jump'], ['[data-go="join"]', 'join', 'blue'], ['[data-go="local"]', 'local', 'trapper'], ['[data-go="practice"]', 'practice', 'runner'], ['#rejoinBtn', 'rejoin', 'aim']];
  for (const [sel, icon, pal] of TILES) {
    const b = document.querySelector('#title ' + sel), c = document.createElement('canvas'), label = document.createElement('span');
    c.className = 'pix tknob'; drawKnob(c, { r: 12, pal, icon: TICON[icon] }); sizeArt(c);
    label.className = 'tlabel'; label.textContent = b.textContent; b.textContent = ''; b.append(c, label);
    b.addEventListener('pointerdown', () => { drawKnob(c, { r: 12, pal, icon: TICON[icon], pressed: true }); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => drawKnob(c, { r: 12, pal, icon: TICON[icon] }));
  }
  document.documentElement.style.setProperty('--starImg', `url(${PLANK.star.toDataURL()})`);
  $('profileBtn').onclick = () => { sfx.click(); show('profile'); };
  $('profileDone').onclick = () => { sfx.click(); show('title'); buildTitle(); };
  // the small buttons get pixel icons too (no emoji: they'd break the pixel look)
  for (const [id, icon, text] of [['howBtn', 'help', 'How to play'], ['setBtn', 'gear', 'Settings'], ['itemsBtn', 'book', 'Items'], ['troBtn', 'trophy', 'Trophies']]) {
    const b = $(id), c = document.createElement('canvas'), art = PLANK[icon];
    c.width = art.width; c.height = art.height; c.className = 'pix picon'; c.getContext('2d').drawImage(art, 0, 0);
    b.textContent = text; b.prepend(c);
  }
})();
let titleAnimT = 0;
function animateTitle(dt) {
  if ($('title').classList.contains('hidden') && $('profile').classList.contains('hidden')) return;
  titleAnimT += dt;
  const f = ['run0', 'run1', 'run2', 'run1'][Math.floor(titleAnimT * 10) % 4];
  const c = $('profileArt'), x = c.getContext('2d'); x.clearRect(0, 0, 12, 16); x.drawImage(charFrame(charOf(me.char), titleAnimT % 4 < 2.4 ? 'idle' : f, 1, Math.floor(titleAnimT * 2) % 2), 0, 0);
  const on = document.querySelector('.swatch.on canvas');
  if (on) { const y = on.getContext('2d'); y.clearRect(0, 0, 16, 18); y.drawImage(charFrame(charOf(me.char), f, 1, 0), 2, 1); }
}
try { document.fonts.load('bold 8px Silkscreen'); } catch { /* old browser */ }
if (!store.get('seenTip', false)) { store.set('seenTip', true); setTimeout(() => toast('New here? Try the training in “How to play”.'), 900); }
// On iPhone Safari the browser keeps a strip at the bottom; the home-screen app is true full screen.
if (/iP(hone|od)/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches)
  setTimeout(() => toast('Tip: Share → Add to Home Screen plays in full screen'), 1500);

function buildTitle() {
  offerRejoin();
  $('name').value = me.name;
  $('name').oninput = () => { me.name = $('name').value.trim().slice(0, 12) || 'Player'; saveMe(); };
  const box = $('colors'); box.innerHTML = '';
  for (const c of CHARS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c.id === me.char ? ' on' : ''); b.title = c.name; b.setAttribute('aria-label', c.name);
    b.appendChild(portrait(c.id, c.id === me.char ? 'jump' : 'idle'));
    b.onclick = () => { me.char = c.id; saveMe(); sfx.click(); buildTitle(); };
    box.appendChild(b);
  }
  $('charName').textContent = charOf(me.char).name;
  $('profileName').textContent = me.name;
}
$('setBtn').onclick = () => { sfx.click(); openSettings(hidePanel); };

// ---------- settings
function openSettings(back) {
  const rows = [
    ['Sound', () => !audio.muted, v => setMuted(!v)],
    ['Music', () => audio.music, v => { setMusic(v); if (v && run) startMusic(run.endless ? 'endless' : run.world.level.theme); }],
    ['Vibration' + (canVibrate ? '' : ' <small>(not on this device)</small>'), () => settings.vibrate, v => { settings.vibrate = v; buzz(40); }],
    ['Ghost of the last run', () => settings.ghost, v => { settings.ghost = v; }],
    ['Level preview', () => settings.preview, v => { settings.preview = v; }],
    ['Screen shake', () => settings.shake, v => { settings.shake = v; R.shakeOn = v; }],
  ];
  const GFX = { auto: 'Auto', high: 'High', low: 'Low' }, nextGfx = { auto: 'high', high: 'low', low: 'auto' };
  panel(`<h2>Settings</h2><div class="settings">${rows.map(([label, get], i) => `<div class="setRow"><span>${label}</span><button class="chip tog${get() ? ' on' : ''}" data-i="${i}">${get() ? 'On' : 'Off'}</button></div>`).join('')}</div>
    <div class="setRow"><span>Graphics <small>(Low = lighter, for slow phones)</small></span><button class="chip tog on" id="gfxBtn">${GFX[settings.graphics] || 'Auto'}</button></div>
    <div class="buttons"><button class="big pink" id="setDone">Done</button></div>
    <p class="ver">Version <span id="appVersion">${bootVersion ? bootVersion.replace('trap-dash-', '') : '…'}</span></p>`);
  $('gfxBtn').onclick = () => { settings.graphics = nextGfx[settings.graphics] || 'auto'; applyGraphics(); saveSettings(); sfx.click(); openSettings(back); };
  for (const b of $('panelCard').querySelectorAll('.tog')) b.onclick = () => { const r = rows[+b.dataset.i]; r[2](!r[1]()); saveSettings(); sfx.click(); openSettings(back); };
  $('setDone').onclick = () => { sfx.click(); back(); };
}
R.shakeOn = settings.shake;
// Graphics: High keeps every effect, Low drops the purely decorative ones, Auto switches to Low by itself when frames
// get slow (below ~40 fps for a couple of seconds).
function applyGraphics() { R.lite = settings.graphics === 'low' || (settings.graphics === 'auto' && autoLite); }
let autoLite = false, slowFrames = 0;
function watchSpeed(dt) {
  if (settings.graphics !== 'auto' || autoLite || !run || run.phase !== 'play' || run.paused) return;
  slowFrames = dt > 0.025 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames > 90) { autoLite = true; applyGraphics(); }
}
applyGraphics();
$('howBtn').onclick = () => { panel(`
  <h2>How to play</h2>
  <div class="row tutRow"><button class="mid pink" id="tutRun">${PIW('dash')} Runner training</button><button class="mid blue" id="tutTrap">${PIW('spikes')} Trapper training</button></div>
  <ul class="help">
    <li><b>The runner</b> dashes from the start to the checkered flag. Move with <b>← →</b> or <b>A D</b>, jump with <b>Space</b>, <b>W</b> or <b>↑</b> (hold for higher). On a phone, use the buttons.</li>
    <li><b>The trapper</b> gets three coloured buttons for the next traps ahead of the runner (or keys 1-3). Each button fires the trap outlined in its colour on the map; as the runner moves on, the buttons switch to the next traps. There are 13 kinds: spikes, trapdoors, walls, cannons, arrows, crushers, flames, fans, saws, lasers, bombs, conveyor belts and ice.</li>
    <li>Every trap has a <b>cooldown</b> (the dial fills up), and traps can't be fired back to back. The runner sees the dials too, so dash while they're recharging!</li>
    <li><b>Gadgets</b> never kill on their own. There are 12 for each side (lightning, glue, mines, bats, fog, frost, an anvil, rewind… and dash, shield, blink, glider, slow-mo, decoy, phase…), but <b>each map deals 4 to each player</b>, picked to suit its traps and layout. Small numbers show how many uses are left this run.</li>
    <li>Then you <b>swap</b>. Whoever reaches the flag faster wins the level. Dying sends you back to the last flag, so it costs time.</li>
    <li>Levels have ★ to ★★★ difficulty. ${PI('dice')} builds a random level of the difficulty you pick.</li>
    <li><b>Gamepad</b>: plug one in and play. Runner: stick or d-pad to move, <b>A</b> jumps, <b>X Y B RB</b> gadgets. Trapper: <b>B X Y</b> fire the red, blue and yellow trap slots, <b>LB RB LT RT</b> gadgets (aimed ones: steer with a stick, <b>A</b> drops it). On one screen the first pad runs and the second traps. <b>Start</b> pauses; in menus use the d-pad and <b>A</b>.</li>
    <li><b>∞ Endless</b>: stage after stage of new levels, no clock. Swap sides whenever you like from the <b>II</b> menu.</li>
  </ul>
  <div class="buttons"><button class="big pink" data-close>Got it</button></div>`);
  $('tutRun').onclick = () => { sfx.click(); startTutorial('runner'); };
  $('tutTrap').onclick = () => { sfx.click(); startTutorial('trapper'); };
};

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { unlockAudio(); sfx.click(); nav(go.dataset.go); }
  if (e.target.closest('[data-close]')) { sfx.click(); hidePanel(); }
});

function nav(where) {
  if (where === 'title') { leaveParty(); show('title'); buildTitle(); return; }
  if (where === 'join') { show('join'); $('joinStatus').textContent = ''; $('joinStatus').className = 'status'; setTimeout(() => $('code').focus(), 50); return; }
  if (where === 'host') return hostParty();
  if (where === 'local') {
    mode = 'local'; isHost = true;
    players = { a: { name: me.name, char: me.char }, b: { name: 'Player 2', char: otherChar(me.char) } };
    score = { a: 0, b: 0 }; openLobby(); return;
  }
  if (where === 'practice') {
    mode = 'practice'; isHost = true;
    players = { a: { name: me.name, char: me.char }, b: { name: 'Trap Bot', char: otherChar(me.char) } };
    score = { a: 0, b: 0 }; openLobby(); return;
  }
}

// ---------- online
async function hostParty() {
  mode = 'online'; isHost = true; score = { a: 0, b: 0 };
  players = { a: { name: me.name, char: me.char }, b: null };
  roomCode = '';
  openLobby();
  $('lobbyStatus').textContent = 'Opening a room…';
  try {
    roomCode = await net.host();
    if (mode !== 'online') return;
    saveSession();
    openLobby();
  } catch (e) {
    console.warn(e);
    $('lobbyStatus').textContent = 'Could not open a room. Check your connection and try again.';
    $('lobbyStatus').className = 'status err';
  }
}
net.onPeer = () => { sfx.cp(); };

function bindCode() {
  $('code').addEventListener('input', () => { $('code').value = cleanCode($('code').value); });
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinGo').click(); });
}
bindCode();
// iOS "Shake to Undo" offers to undo the last typing (your name, the room code) whenever the phone is shaken,
// which happens a lot mid-game. Swapping the text boxes for fresh copies with the same text drops that history.
function forgetTyping() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  for (const id of ['name', 'code']) { const old = $(id), fresh = old.cloneNode(true); fresh.value = old.value; old.replaceWith(fresh); }
  bindCode();
  $('name').oninput = () => { me.name = $('name').value.trim().slice(0, 12) || 'Player'; saveMe(); };
}
$('joinGo').onclick = async () => {
  unlockAudio();
  const code = cleanCode($('code').value), st = $('joinStatus');
  if (code.length !== 4) { st.textContent = 'The code has 4 letters.'; st.className = 'status err'; return; }
  st.textContent = 'Connecting…'; st.className = 'status'; $('joinGo').disabled = true;
  mode = 'online'; isHost = false; roomCode = code; score = { a: 0, b: 0 };
  try {
    await net.join(code);
    saveSession();
    net.send({ t: 'hi', name: me.name, char: me.char });
    players = { a: null, b: { name: me.name, char: me.char } };
    openLobby();
  } catch (e) {
    console.warn(e);
    net.close(); mode = null;
    st.textContent = e && e.type === 'peer-unavailable' ? 'No party with that code. Check the letters?' : e && e.type === 'full' ? 'That party already has two players.' : 'Could not reach the party. Is the host still on the lobby screen?';
    st.className = 'status err';
  }
  $('joinGo').disabled = false;
};

let pendingStart = null;
net.onMessage = m => {
  if (m.t === 'hi' && isHost) {
    const char = charOf(m.char).id === players.a.char ? otherChar(players.a.char) : charOf(m.char).id;
    const back = m.rejoin && players.b;
    players.b = { name: String(m.name || 'Friend').slice(0, 12), char };
    if (!back && !(m.rejoin && restoredScore)) { score = { a: 0, b: 0 }; runs = []; }
    restoredScore = false; saveSession();
    if (back && run && performance.now() - lastRestart > 3000) restartRound();
    syncLobby(); if (!run) openLobby();
    toast(players.b.name + ' joined!');
  } else if ((m.t === 'start' || m.t === 'stage') && !isHost && (!players.a || !players.b)) {
    pendingStart = m;   // after a reload we don't know the players yet: start once the lobby arrives
  } else if (m.t === 'lobby' && !isHost) {
    players = m.players; lobby = m.lobby; score = m.score;
    if (pendingStart) { const p = pendingStart; pendingStart = null; net.onMessage(p); return; }
    if (!run) openLobby();
  } else if (m.t === 'full') {
    toast('That party is already full.'); nav('title');
  } else if (m.t === 'start' && !isHost) {
    lobby.level = m.level; runs = m.n === 1 ? [] : runs;
    startRun(m.level, m.runner, m.n);
  } else if (m.t === 'stage') {          // endless: the next stage (from the runner) or a fresh run after a swap (from the host)
    lobby.level = m.level; startRun(m.level, m.runner, 0, m.endless);
  } else if (m.t === 'ready') {
    if (run && run.phase === 'preview') { run.peerReady = true; if (run.meReady) endPreview(); }
    else if (run) run.peerReadyEarly = true;
  } else if (m.t === 'swap' && isHost && run && run.endless) {
    toast(players.b.name + ' swapped sides'); startEndless(run.endless.stars, other(run.runner));
  } else if (m.t === 'snap' && run && !run.simOwner) {
    receiveSnap(m);
  } else if (m.t === 'gad' && run && run.simOwner && run.phase === 'play') {
    run.world.useGadget('trapper', m.id, m.x, m.y, Math.max(0, Math.min(0.3, +m.lead || 0)));
  } else if (m.t === 'act' && run && run.simOwner && run.phase === 'play') {
    run.world.trigger(m.id, Math.max(0, Math.min(0.3, +m.lead || 0)), !!m.hold);
  } else if (m.t === 'rel' && run && run.simOwner) {
    run.world.release(m.id);
  } else if (m.t === 'done' && run && !run.simOwner) {
    finishRun(m.res);
  } else if (m.t === 'toLobby' && !isHost) {
    endRunView(); openLobby();
  } else if (m.t === 'bye') {
    friendLeft();
  }
};
// ---------- reconnecting: the host keeps the friend's place for a minute, the guest keeps trying with the same id
const REJOIN_WAIT = 60;
let waitTimer = null;
function netBanner(text) { const b = $('netWait'); if (!text) { b.classList.add('hidden'); return; } b.innerHTML = text; b.classList.remove('hidden'); }
net.onLost = () => {
  if (mode !== 'online') return;
  if (run) run.paused = true;
  if (isHost) {
    if (!players.b) return friendLeft();
    const until = performance.now() + REJOIN_WAIT * 1000, name = esc(players.b.name);
    clearInterval(waitTimer);
    const tick = () => {
      const left = Math.ceil((until - performance.now()) / 1000);
      if (left <= 0) { clearInterval(waitTimer); netBanner(null); return friendLeft(); }
      netBanner(`<b>${PI('warn')} Lost ${name}</b><small>Waiting for them to come back… ${left}s</small>`);
    };
    tick(); waitTimer = setInterval(tick, 500);
  } else guestRejoin();
};
net.onBack = () => {
  clearInterval(waitTimer); netBanner(null);
  toast(players.b.name + ' is back!'); sfx.cp();
  syncLobby();
  if (run) restartRound();
};
let lastRestart = -1e9;
function restartRound() {   // after a reconnect the round starts over; the score stays
  const r = run; lastRestart = performance.now();
  if (r.endless) { const e = { ...r.endless }; net.send({ t: 'stage', level: r.level, runner: r.runner, endless: e }); startRun(r.level, r.runner, 0, e); }
  else hostStart(r.level, r.runner, r.n || 1);
}
async function guestRejoin(fromReload) {
  const code = roomCode, gid = net.gid, until = performance.now() + REJOIN_WAIT * 1000;
  for (let attempt = 1; performance.now() < until && mode === 'online'; attempt++) {
    netBanner(`<b>${PI('warn')} Connection lost</b><small>Reconnecting to the party… (try ${attempt})</small>`);
    try {
      await net.join(code, gid);
      netBanner(null); toast('Reconnected!'); sfx.cp();
      saveSession();
      if (fromReload) players = { a: null, b: { name: me.name, char: me.char } };
      net.send({ t: 'hi', name: me.name, char: me.char, rejoin: true });   // also tells a host who reopened the party who's back
      return true;
    } catch (e) {
      if (e && e.type === 'full') break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  netBanner(null);
  if (mode === 'online' && !isHost) { forgetSession(); friendLeft(); }
  return false;
}
// Both players remember the party. Closing the app or reloading within a few minutes goes straight back in (the host
// reopens the same code, the guest knocks again), and for half an hour the title offers "Rejoin party ABCD", also after
// leaving by mistake. The host keeps the score, so the match carries on.
const saveSession = () => {
  if (mode !== 'online' || !roomCode) return;
  const s = { code: roomCode, gid: net.gid, role: isHost ? 'host' : 'guest', t: Date.now(), score, friend: players.b && players.b.name };
  store.set('session', s); store.set('lastParty', s);
};
const forgetSession = () => store.set('session', null);
setInterval(saveSession, 10000);
addEventListener('pagehide', saveSession);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
const REJOIN_OFFER = 30 * 60 * 1000;
let restoredScore = false;
async function rejoinParty(s, auto = false) {
  unlockAudio();
  if (s.role === 'host') {
    mode = 'online'; isHost = true; score = s.score || { a: 0, b: 0 }; restoredScore = true;
    players = { a: { name: me.name, char: me.char }, b: null }; roomCode = '';
    openLobby(); $('lobbyStatus').textContent = `Reopening party ${s.code}…`;
    try {
      roomCode = await net.host(s.code);
      if (mode !== 'online') return;
      saveSession(); openLobby();
      toast(`Party ${s.code} is open again. ${s.friend ? esc(s.friend) + ' can' : 'Your friend can'} rejoin.`);
    } catch (e) {
      console.warn(e); $('lobbyStatus').textContent = 'Could not reopen the party. Check your connection.'; $('lobbyStatus').className = 'status err';
    }
  } else {
    show('title'); mode = 'online'; isHost = false; roomCode = s.code; net.gid = s.gid; score = { a: 0, b: 0 };
    const ok = await guestRejoin(true);
    if (!ok) { mode = null; show('title'); buildTitle(); if (!auto) toast(`Party ${s.code} isn't open any more.`); }
  }
}
function offerRejoin() {
  const s = store.get('lastParty', null), b = $('rejoinBtn');
  const ok = s && Date.now() - s.t < REJOIN_OFFER && mode !== 'online';
  b.classList.toggle('hidden', !ok);
  if (ok) { const l = b.querySelector('.tlabel'); if (l) l.innerHTML = `Rejoin <b>${esc(s.code)}</b>`; b.onclick = () => { sfx.click(); rejoinParty(s); }; }
}

function friendLeft() {
  if (mode !== 'online') return;
  clearInterval(waitTimer); netBanner(null);
  if (isHost) {
    const n = players.b ? players.b.name : 'Your friend';
    net.dropGuest();
    players.b = null; score = { a: 0, b: 0 };
    endRunView(); openLobby(); toast(n + ' left the party.');
  } else {
    toast('The host closed the party.');
    endRunView(); leaveParty(); show('title'); buildTitle();
  }
}

function leaveParty() {
  if (mode === 'online') { net.close(); forgetSession(); }
  clearInterval(waitTimer); netBanner(null);
  mode = null; players = { a: null, b: null }; endRunView();
}

function syncLobby() { if (mode === 'online' && isHost) { net.send({ t: 'lobby', players, lobby, score }); saveSession(); } }

// ---------- lobby
function openLobby() {
  forgetTyping();
  show('lobby');
  stopMusic();
  const online = mode === 'online', practice = mode === 'practice';
  $('lobbyTitle').textContent = online ? (isHost ? 'Your party' : 'Party') : practice ? 'Practice' : 'Same screen';
  $('roomBox').classList.toggle('hidden', !online || !roomCode);
  $('roomCode').textContent = roomCode || '----';
  const st = $('lobbyStatus'); st.className = 'status';
  if (online) st.textContent = !players.b || !players.a ? (isHost ? (roomCode ? 'Send your friend the code or the link.' : 'Opening a room…') : 'Waiting for the host…')
    : (isHost ? 'Pick a level and start!' : 'The host picks the level.') + (net.link === 'direct' ? ' (direct link)' : ' (relay link)');
  else if (practice) st.textContent = 'You run, a bot fires the traps.';
  else st.textContent = 'One runs on the keyboard (or the touch buttons), the other clicks the traps.';

  const box = $('players'); box.innerHTML = '';
  for (const s of practice ? ['a'] : ['a', 'b']) {
    const p = players[s], d = document.createElement('div');
    if (!p) { d.className = 'player empty'; d.textContent = 'Waiting for a friend…'; box.appendChild(d); continue; }
    d.className = 'player';
    d.appendChild(portrait(p.char));
    const nm = document.createElement('b'); nm.textContent = p.name + (online && s === mySide() ? ' (you)' : ''); d.appendChild(nm);
    if (mode === 'local' && s === 'b') {   // let player 2 rename
      nm.contentEditable = 'true'; nm.spellcheck = false; nm.style.userSelect = 'text';
      nm.onblur = () => { players.b.name = nm.textContent.trim().slice(0, 12) || 'Player 2'; };
      d.onclick = e => { if (e.target === d.firstChild) { players.b.char = otherChar(players.b.char); if (players.b.char === players.a.char) players.b.char = otherChar(players.b.char); openLobby(); } };
      d.firstChild.title = 'Tap to change character';
    }
    if (!practice) { const sc = document.createElement('span'); sc.className = 'score'; sc.textContent = '★ ' + score[s]; d.appendChild(sc); }
    box.appendChild(d);
  }

  const ready = !online || (players.a && players.b);
  const best = store.get('best', {});
  const lv = $('levels'); lv.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.className = i === lobby.level ? 'on' : '';
    b.style.setProperty('--theme', (THEMES[L.theme] || THEMES.day).sky[1]);
    b.innerHTML = `<span>${i + 1}. ${esc(L.name)}</span><small class="stars">${starText(starsOf(L))}${practice && best[L.id] ? ' · ' + best[L.id].toFixed(1) + 's' : ''}</small>`;
    b.disabled = online && !isHost;
    b.onclick = () => { lobby.level = i; sfx.click(); syncLobby(); openLobby(); };
    lv.appendChild(b);
  });
  const on = lv.querySelector('.on'); if (on) lv.scrollLeft = Math.max(0, on.offsetLeft - lv.clientWidth / 2 + on.offsetWidth / 2);
  // Random levels: pick a difficulty, the host's device builds one and shares it.
  const rr = $('randRow'); rr.innerHTML = '';
  const cur = typeof lobby.level === 'object' ? lobby.level : null;
  const lab = document.createElement('span');
  lab.innerHTML = cur ? `${PI('dice')} <b>${esc(cur.name)}</b> <span class="stars">${starText(cur.stars)}</span>` : PI('dice') + ' Random level:';
  rr.appendChild(lab);
  for (const n of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'chip' + (cur && cur.stars === n ? ' on' : ''); b.textContent = starText(n);
    b.title = ['Easy', 'Medium', 'Hard'][n - 1] + ' random level';
    b.disabled = online && !isHost;
    b.onclick = () => {
      sfx.click(); b.disabled = true; b.textContent = '…';
      genAsync(n).then(L => { lobby.level = L; syncLobby(); if (!run && !$('lobby').classList.contains('hidden')) openLobby(); });
    };
    rr.appendChild(b);
  }

  // Endless: stage after stage on one difficulty, no clock. Swap sides any time from the menu.
  const er = $('endRow'); er.innerHTML = '<span>∞ Endless:</span>';
  for (const n of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = starText(n);
    b.title = ['Easy', 'Medium', 'Hard'][n - 1] + ' endless run';
    b.disabled = !ready || (online && !isHost);
    b.onclick = () => { unlockAudio(); sfx.click(); runs = []; startEndless(n, practice ? 'a' : lobby.first); };
    er.appendChild(b);
  }

  $('firstRow').classList.toggle('hidden', practice);
  const ms = $('matchSeg'); ms.innerHTML = '';
  for (const [v, label] of [[false, '1 level'], [true, 'Best of 3']]) {
    const b = document.createElement('button');
    b.textContent = label; b.className = !!lobby.bo3 === v ? 'on' : '';
    b.disabled = online && !isHost;
    b.onclick = () => { lobby.bo3 = v; sfx.click(); syncLobby(); openLobby(); };
    ms.appendChild(b);
  }
  const seg = $('firstSeg'); seg.innerHTML = '';
  for (const s of ['a', 'b']) {
    const b = document.createElement('button');
    b.textContent = players[s] ? players[s].name : '…'; b.className = lobby.first === s ? 'on' : '';
    b.disabled = online && !isHost;
    b.onclick = () => { lobby.first = s; sfx.click(); syncLobby(); openLobby(); };
    seg.appendChild(b);
  }
  $('startBtn').disabled = !ready || (online && !isHost);
  $('startBtn').textContent = online && !isHost ? 'Waiting for the host…' : 'Start!';
}

$('startBtn').onclick = () => { unlockAudio(); sfx.click(); runs = []; if (lobby.bo3) { score = { a: 0, b: 0 }; syncLobby(); } hostStart(lobby.level, mode === 'practice' ? 'a' : lobby.first, 1); };
$('leaveBtn').onclick = () => { sfx.click(); nav('title'); };
$('shareBtn').onclick = async () => {
  const url = `${location.origin}${location.pathname}?join=${roomCode}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Trap Dash', text: `Join my Trap Dash party! Code ${roomCode}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied!'); }
  } catch { /* cancelled */ }
};

function randomLevel(stars) { return generate((Math.random() * 1e9) >>> 0, stars); }
// Random levels are built in a worker so the game doesn't freeze while one is made and checked.
let genWorker = null;
try { genWorker = new Worker('src/genworker.js', { type: 'module' }); } catch { /* old browser: build on the main thread */ }
const genWaiting = new Map(); let genId = 0;
if (genWorker) {
  genWorker.onmessage = e => { const f = genWaiting.get(e.data.id); genWaiting.delete(e.data.id); if (f) f(e.data.level); };
  genWorker.onerror = () => { genWorker = null; for (const [id, f] of genWaiting) { genWaiting.delete(id); f(null); } };
}
function genAsync(stars) {
  const seed = (Math.random() * 1e9) >>> 0;
  if (!genWorker) return Promise.resolve(generate(seed, stars));
  return new Promise(res => { const id = ++genId; genWaiting.set(id, res); genWorker.postMessage({ id, seed, stars }); })
    .then(level => level || generate(seed, stars));
}
const prefetched = {};   // one random level per difficulty, built ahead for the "Next" button
function prefetch(stars) { if (!prefetched[stars]) prefetched[stars] = { p: genAsync(stars).then(L => (prefetched[stars].level = L)) }; }
function takeRandom(stars) { const f = prefetched[stars]; if (f && f.level) { delete prefetched[stars]; return f.level; } return randomLevel(stars); }
const nextOf = ref => (typeof ref === 'number' ? (ref + 1) % LEVELS.length : takeRandom(ref.stars));

// ---------- endless: generated stages one after another, totals carry over
const stageOf = (L, e) => ({ ...L, name: `Stage ${e.stage}` });
function startEndless(stars, runner) {
  const e = { stars, stage: 1, total: 0, deaths: 0 };
  toast('Building the level…');
  genAsync(stars).then(L => {
    const level = stageOf(L, e);
    if (mode === 'online') net.send({ t: 'stage', level, runner, endless: e });
    $('toast').classList.add('hidden');
    lobby.level = level; startRun(level, runner, 0, e);
  });
}
function nextStage() {   // only on the runner's device, which owns the simulation; the next stage was built during this one
  if (run.advancing) return;
  run.advancing = true;
  const cur = run, e = run.endless, w = run.world;
  const ne = { ...e, stage: e.stage + 1, total: e.total + w.time, deaths: e.deaths + w.player.deaths,
    score: { pts: run.score.pts, catches: run.score.catches, bestStreak: run.score.bestStreak } };
  (run.nextGen || genAsync(e.stars)).then(L => {
    if (run !== cur) return;
    const level = stageOf(L, ne);
    if (mode === 'online') net.send({ t: 'stage', level, runner: cur.runner, endless: ne });
    startRun(level, cur.runner, 0, ne);
  });
}
function swapSides() {
  if (!run || !run.endless) return;
  hidePanel();
  if (mode === 'online' && !isHost) { net.send({ t: 'swap' }); toast('Swapping…'); return; }
  startEndless(run.endless.stars, other(run.runner));
}

function hostStart(level, runner, n) {
  if (mode === 'online') net.send({ t: 'start', level, runner, n });
  startRun(level, runner, n);
}

// ---------- input
const keys = new Set();
const input = { left: false, right: false, jump: false, jumpQueued: false };
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'];
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  if (JUMP_KEYS.includes(e.code) && !keys.has(e.code)) input.jumpQueued = true;
  keys.add(e.code);
  if (run && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && run) togglePause();
  if (!run || e.repeat) return;
  const n = /^(Digit|Numpad)([0-9])$/.exec(e.code);
  if (n && run.trapperHere) {
    const d = +n[2];
    if (d >= 1 && d <= SLOTS) fireSlot(d - 1, e.code);
    const gid = run.world.loadout.trapper[{ 7: 0, 8: 1, 9: 2, 0: 3 }[d]];
    if (gid) useTrapperGadget(gid, GADGETS.trapper[gid].aim && pointer ? R.toWorld(pointer.x, pointer.y) : null);
  }
  const slot = { ShiftLeft: 0, ShiftRight: 0, KeyQ: 1, KeyE: 2, KeyR: 3 }[e.code];
  const rg = slot != null && runnerKeyed()[slot];
  if (rg && run.runnerHere) useRunnerGadget(rg);
});
addEventListener('keyup', e => { keys.delete(e.code); releaseHold(e.code); });
addEventListener('blur', () => keys.clear());
const touchHeld = { left: new Set(), right: new Set(), jump: new Set() };
const TOUCH_BTN = { left: 'tLeft', right: 'tRight', jump: 'tJump' };
// The runner's arcade parts: a joystick for left / right, a big red JUMP button. Redrawn when they change.
const knobArt = (el, cls = 'knob') => { let c = el.querySelector('canvas.' + cls); if (!c) { c = document.createElement('canvas'); c.className = 'pix ' + cls; el.prepend(c); } return c; };
function sizeArt(c) { c.style.setProperty('--aw', c.width); c.style.setProperty('--ah', c.height); }
let lookSig = '';
const touchLooks = () => {
  for (const k in TOUCH_BTN) $(TOUCH_BTN[k]).classList.toggle('down', touchHeld[k].size > 0);
  const dir = touchHeld.left.size > 0 ? -1 : touchHeld.right.size > 0 ? 1 : 0, j = touchHeld.jump.size > 0, sig = dir + '|' + j;
  if (sig === lookSig) return; lookSig = sig;
  const st = knobArt($('arrows'), 'stick'); drawStick(st, dir); sizeArt(st);
  const jc = knobArt($('tJump')); drawKnob(jc, { r: 13, pal: 'jump', icon: KICON.jump, iconScale: 2, pressed: j }); sizeArt(jc);
};
// A finger may have slid from one button to another, so a release clears it from every button.
const release = id => { for (const k in touchHeld) touchHeld[k].delete(id); touchLooks(); };
const releaseAll = () => { for (const k in touchHeld) touchHeld[k].clear(); touchLooks(); };
for (const k in TOUCH_BTN) {
  const el = $(TOUCH_BTN[k]);
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture?.(e.pointerId); } catch { /* forwarded tap */ } if (k === 'jump' && !touchHeld.jump.size) input.jumpQueued = true; touchHeld[k].add(e.pointerId); touchLooks(); unlockAudio(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, e => release(e.pointerId));
}
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => release(e.pointerId));
// Safety net: when no finger is on the screen at all, nothing can be held.
for (const ev of ['touchend', 'touchcancel']) addEventListener(ev, e => { if (!e.touches.length) releaseAll(); });
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', releaseAll);
// iOS shows its text magnifier (a glass bubble) and selection handles when a finger rests on something. The controls
// work from pointer events, so the panels and the game view can swallow the touch itself and iOS never starts that.
for (const el of [$('pad'), $('padTop'), canvas]) for (const ev of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
addEventListener('contextmenu', e => { if (run) e.preventDefault(); });
// Forgiving touch: a tap in a control panel that misses every button goes to the nearest one, if it's within
// about a fingertip (56 px). The press is handed on as that button's own pointerdown, so holding and sliding still work.
const NEAR = 56;
function pressNearest(e, pads) {
  let best = null, bd = NEAR;
  for (const pad of pads) for (const b of pad.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (!r.width || b.disabled) continue;
    const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return false;
  e.preventDefault();
  best.dispatchEvent(new PointerEvent('pointerdown', { pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true }));
  return true;
}
for (const pad of [$('pad'), $('padTop')]) pad.addEventListener('pointerdown', e => { if (!e.target.closest('button')) pressNearest(e, [pad]); });
// Pressed look (and a tiny tick, if vibration is on) for the trap and gadget buttons while a finger is on them.
const pressedBtn = new Map();
for (const pad of [$('pad'), $('padTop')]) pad.addEventListener('pointerdown', e => {
  const b = e.target.closest('.gbtn, .tbtn'); if (!b) return;
  b.classList.add('down'); pressedBtn.set(e.pointerId, b); if (e.pointerType !== 'mouse') buzz(8);
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => { const b = pressedBtn.get(e.pointerId); if (b) { b.classList.remove('down'); pressedBtn.delete(e.pointerId); } });
// Sliding a thumb from ◀ to ▶ should switch direction without lifting.
$('arrows').addEventListener('pointermove', e => {
  if (!touchHeld.left.has(e.pointerId) && !touchHeld.right.has(e.pointerId)) return;
  const r = uiRect($('tRight')), onRight = toUI(e.clientX, e.clientY).x >= r.left - 7;
  const to = onRight ? 'right' : 'left', from = onRight ? 'left' : 'right';
  if (touchHeld[from].delete(e.pointerId)) { touchHeld[to].add(e.pointerId); touchLooks(); }
});
function readInput() {
  input.left = keys.has('ArrowLeft') || keys.has('KeyA') || touchHeld.left.size > 0 || gp.left;
  input.right = keys.has('ArrowRight') || keys.has('KeyD') || touchHeld.right.size > 0 || gp.right;
  input.jump = JUMP_KEYS.some(k => keys.has(k)) || touchHeld.jump.size > 0 || gp.jump;
}

// ---------- gamepads. Runner: stick / d-pad to move, A to jump, X Y B RB for gadgets. Trapper: B X Y fire the red,
// blue and yellow trap slots, LB RB LT RT the gadgets (aimed ones: steer with a stick, A to drop, B to cancel).
// On a shared screen the first pad runs and the second traps. Start pauses. In menus: d-pad / stick + A, B goes back.
const gp = { left: false, right: false, jump: false };
function refreshKeyLabels() {
  if (!run) return;
  buildGadgets(); updateGadgets();
  [...$('trapbar').children].forEach((b, i) => { const k = b.querySelector('.skey'); if (k) k.textContent = slotKey(i); });
}
addEventListener('gamepadconnected', () => { if (!padOn) { padOn = true; refreshKeyLabels(); } toast('Gamepad ready: A jumps, Start pauses. Menus: d-pad + A.'); });
addEventListener('gamepaddisconnected', () => { gp.left = gp.right = gp.jump = false; });
function readPads(dt) {
  const pads = pollPads();
  gp.left = gp.right = gp.jump = false;
  if (!pads.length) return;
  if (!padOn) { padOn = true; refreshKeyLabels(); }
  if (!run || run.paused || run.phase === 'end') {
    if (run && run.paused && pads.some(p => p.pressed[BTN.START])) { togglePause(); return; }
    menuPad(pads); return;
  }
  for (const p of pads) {
    const role = !run.runnerHere ? 'trapper' : !run.trapperHere ? 'runner' : p.slot === 0 ? 'runner' : 'trapper';
    if (p.pressed[BTN.START]) { togglePause(); return; }
    if (run.phase === 'preview' && p.pressed[BTN.A]) readyPreview();
    if (role === 'runner') {
      gp.left ||= p.left; gp.right ||= p.right; gp.jump ||= !!p.down[BTN.A];
      if (p.pressed[BTN.A]) input.jumpQueued = true;
      [BTN.X, BTN.Y, BTN.B, BTN.RB].forEach((b, k) => { if (p.pressed[b]) { const id = runnerKeyed()[k]; if (id) useRunnerGadget(id); } });
      continue;
    }
    [BTN.B, BTN.X, BTN.Y].forEach(b => { if (p.released[b]) releaseHold('gp' + p.slot + '-' + b); });
    if (run.aim) {   // steering an aimed gadget
      const W = run.world.w * TILE, H = run.world.h * TILE, sx = p.lx || p.rx, sy = p.ly || p.ry;
      run.aim.x = Math.max(0, Math.min(W, run.aim.x + sx * 260 * dt)); run.aim.y = Math.max(0, Math.min(H, run.aim.y + sy * 260 * dt));
      if (p.pressed[BTN.A]) useTrapperGadget(run.aim.id, { x: run.aim.x, y: run.aim.y });
      else if (p.pressed[BTN.B]) run.aim = null;
    } else [BTN.B, BTN.X, BTN.Y].forEach((b, k) => { if (p.pressed[b]) fireSlot(k, 'gp' + p.slot + '-' + b); });
    [BTN.LB, BTN.RB, BTN.LT, BTN.RT].forEach((b, k) => { if (p.pressed[b]) { const id = run.world.loadout.trapper[k]; if (id) useTrapperGadget(id); } });
  }
}
// Menus: move a highlight over the buttons of whatever screen is up, A presses it, B finds a way back.
let padFocus = null, padRepeat = 0;
function menuPad(pads) {
  const scr = [...document.querySelectorAll('.screen, .panel')].filter(s => !s.classList.contains('hidden') && s.getClientRects().length).pop();
  if (!scr) return;
  const btns = [...scr.querySelectorAll('button')].filter(b => b.getClientRects().length && !b.disabled);
  if (!btns.length) return;
  let move = 0, press = false, back = false;
  for (const p of pads) {
    const dir = p.up || p.left ? -1 : p.downDir || p.right ? 1 : 0;
    if (dir && (p.pressed[BTN.UP] || p.pressed[BTN.DOWN] || p.pressed[BTN.LEFT] || p.pressed[BTN.RIGHT] || padRepeat <= 0)) move = dir;
    press ||= p.pressed[BTN.A]; back ||= p.pressed[BTN.B];
  }
  padRepeat = move ? 14 : padRepeat > 0 && pads.some(p => p.up || p.downDir || p.left || p.right) ? padRepeat - 1 : 0;
  if (!btns.includes(padFocus)) { padFocus?.classList.remove('padfocus'); padFocus = null; }
  if (move) {
    const i = padFocus ? btns.indexOf(padFocus) : -1;
    padFocus?.classList.remove('padfocus');
    padFocus = btns[(i + move + btns.length) % btns.length];
    padFocus.classList.add('padfocus'); padFocus.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); sfx.click();
  }
  if (press) { const b = padFocus || scr.querySelector('button.big, button.primary') || btns[0]; b.click(); }
  if (back) { const b = btns.find(x => /^(back|leave|close|resume|done)\b/i.test(x.textContent.trim())); if (b) b.click(); }
}

// Trapper: click / tap a trap.
function trapAt(cx, cy) {
  if (!run) return -1;
  const w = R.toWorld(cx, cy);
  let best = -1, bd = 1e9;
  for (const t of run.world.traps) {
    const b = R.trapButton(run.world, t), d = Math.hypot(b.x - w.x, b.y - w.y);
    const inRect = w.x > t.x0 * 16 - 10 && w.x < (t.x1 + 1) * 16 + 10 && w.y > t.y * 16 - 12 + (t.kind === 'crusher' ? t.oy : 0) && w.y < (t.y + 1) * 16 + 12 + (t.kind === 'crusher' ? t.oy : 0);
    if ((d < b.r + 16 || inRect) && d < bd) { bd = d; best = t.id; }
  }
  return best;
}
let pointer = null;   // last mouse position over the game, for aiming gadgets with the keyboard
canvas.addEventListener('pointerleave', () => { pointer = null; });
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  if (run && !run.trapperHere && e.pointerType !== 'mouse') { pressNearest(e, [$('pad')]); return; }   // the runner never taps the map: a near miss above the panel still counts
  if (!run || !run.trapperHere || run.phase !== 'play') return;
  if (run.aim) { useTrapperGadget(run.aim.id, R.toWorld(e.clientX, e.clientY)); return; }
  const id = trapAt(e.clientX, e.clientY);
  if (id < 0) return;
  fireTrap(id, 'p' + e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
  if (!run || !run.trapperHere) return;
  if (e.pointerType === 'mouse') run.hover = trapAt(e.clientX, e.clientY);
  if (run.aim) Object.assign(run.aim, R.toWorld(e.clientX, e.clientY));
});

// Feedback on the buttons themselves: a shake when it can't go yet, a flash when it is ready again.
function deny(el) { sfx.denied(); if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } }
function flashReady(el) { el.classList.remove('readyNow'); void el.offsetWidth; el.classList.add('readyNow'); }
const gadEl = (bar, id) => [...$(bar).children].find(b => b.dataset.id === id);

// holdKey: what will let go of it (a pointer id or a key code). Traps that burn while held (the flame) stop on release.
function fireTrap(id, holdKey) {
  const w = run.world, t = w.traps[id];
  const ready = t.state === 'idle' && t.cd <= 0 && (w.lock <= 0 || w.chained(t)) && !(run.pending[id] > 0);
  if (!ready) { deny([...$('trapbar').children].find(b => b.dataset.trap === String(id))); return; }
  const hold = holdKey !== undefined && !!TRAPS[t.kind].hold;
  if (hold) run.held.set(holdKey, id);
  if (run.simOwner) w.trigger(id, 0, hold);
  else { net.send({ t: 'act', id, lead: net.lag, hold }); run.pending[id] = 0.35; sfx.click(); }
}
function releaseHold(holdKey) {
  if (!run || !run.held.has(holdKey)) return;
  const id = run.held.get(holdKey); run.held.delete(holdKey);
  if (run.simOwner) run.world.release(id); else net.send({ t: 'rel', id });
}
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => releaseHold('p' + e.pointerId));

// ---------- the trap bar: three slots for the traps just ahead of the runner
// Only the next few traps get a button. Each slot has its own colour, and the trap it fires is outlined in the same
// colour on the map with the same number. A trap keeps its slot while it stays in range, so buttons don't jump around.
const SLOT_COLORS = ['#d9663f', '#4aa3b2', '#f0be4a'];   // brick, dusty teal, honey (the knobs' PAL red / blue / yellow)
const SLOTS = 3, AHEAD = 18 * TILE, BEHIND = 2 * TILE;
function slotCandidates(w) {
  const p = w.player, px = p.x + 5, py = p.y + 6, dir = Math.sign(w.goal.x - px) || 1, out = [];
  for (const t of w.traps) {
    const tx = (t.x0 + t.x1 + 1) * TILE / 2, ahead = (tx - px) * dir;
    // how far up or down: to the part of the trap that hurts (a crusher's landing spot, a bomb's whole fall)
    const top = t.y * TILE, bottom = t.kind === 'crusher' ? top + (t.drop || 0) + TILE : t.kind === 'dropper' ? w.h * TILE : top + TILE;
    const dy = py < top ? top - py : py > bottom ? py - bottom : 0;
    const near = ahead > -BEHIND - (t.x1 - t.x0) * TILE / 2 && ahead < AHEAD && dy < 7 * TILE;
    const busy = t.state === 'active' || t.state === 'warn';
    if (near || (busy && ahead > -6 * TILE)) out.push({ t, ahead });
  }
  return out.sort((a, b) => a.ahead - b.ahead);
}
function updateSlots(w) {
  const cand = slotCandidates(w), ids = new Set(cand.map(c => c.t.id));
  run.slots = run.slots || Array(SLOTS).fill(null);
  for (let i = 0; i < SLOTS; i++) if (run.slots[i] && !ids.has(run.slots[i].id) && !run.held.size) run.slots[i] = null;
  const taken = new Set(run.slots.filter(Boolean).map(t => t.id));
  for (const c of cand) {
    if (taken.has(c.t.id)) continue;
    let i = run.slots.indexOf(null);
    if (i < 0) {   // all full: a much closer trap pushes out the farthest one (unless it's busy)
      const far = run.slots.map((t, k) => ({ k, a: cand.find(x => x.t === t)?.ahead ?? 1e9, busy: t.state !== 'idle' })).filter(o => !o.busy).sort((a, b) => b.a - a.a)[0];
      if (!far || far.a < c.ahead + 3 * TILE) break;
      i = far.k;
    }
    run.slots[i] = c.t; taken.add(c.t.id);
  }
}
function fireSlot(i, holdKey) {
  const t = run.slots && run.slots[i];
  if (!t || run.phase !== 'play') { deny($('trapbar').children[i]); return; }
  fireTrap(t.id, holdKey);
}
function buildTrapBar() {
  const bar = $('trapbar'); bar.innerHTML = '';
  run.slots = Array(SLOTS).fill(null);
  for (let i = 0; i < SLOTS; i++) {
    const b = document.createElement('button');
    b.className = 'tbtn'; b.dataset.slot = i; b.style.setProperty('--slot', SLOT_COLORS[i]);
    b.innerHTML = `<i class="eta"></i><span class="kw"><canvas class="pix knob"></canvas><span class="secs"></span><i class="skey kc">${slotKey(i)}</i></span><small></small>`;
    b.sig = ''; slotArt(b, i, null);
    b.addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); if (run) fireSlot(i, 'p' + e.pointerId); });
    bar.appendChild(b);
  }
  bar.classList.toggle('hidden', !run.trapperHere);
}
function updateTrapBar() {
  const w = run.world;
  updateSlots(w);
  [...$('trapbar').children].forEach((b, i) => {
    const t = run.slots[i];
    if (b.dataset.trap !== String(t ? t.id : '')) {   // a new trap in this slot: new icon and name, and a little pop
      b.dataset.trap = t ? t.id : '';
      b.dataset.kind = t ? t.kind : '';
      if (t) { b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap'); }
      b.querySelector('small').textContent = t ? TRAPS[t.kind].name : '';
    }
    if (!t) { if (b.dataset.state !== 'empty') b.dataset.state = 'empty'; b.querySelector('.eta').textContent = ''; slotArt(b, i, null); return; }
    const C = TRAPS[t.kind], ready = t.state === 'idle' && t.cd <= 0, pend = run.pending[t.id] > 0;
    const burning = C.hold && t.state === 'active';
    const state = w.jam > 0 ? 'jam' : burning ? 'burn' : pend ? 'sent' : ready ? (w.lock > 0 && !w.chained(t) ? 'lock' : 'ready') : 'cool';
    if (b.dataset.state !== state) { if (state === 'ready' && b.dataset.state === 'cool') flashReady(b); b.dataset.state = state; }
    b.style.setProperty('--cd', burning ? Math.min(1, t.t / C.tank).toFixed(3) : !ready && t.state === 'idle' ? Math.min(1, t.cd / C.cd).toFixed(3) : 0);
    const secs = !ready && t.state === 'idle' && t.cd > 0 ? Math.ceil(t.cd) : '';
    const se = b.querySelector('.secs'); if (se.textContent != secs) se.textContent = secs;
    slotArt(b, i, t, state, burning ? Math.min(1, t.t / C.tank) : !ready && t.state === 'idle' ? Math.min(1, t.cd / C.cd) : 0);
    const eta = etaOfTrap(w, t), etaText = eta == null ? '' : eta < 0.5 ? 'now' : `in ${Math.ceil(eta)}s`, el = b.querySelector('.eta');
    if (el.textContent !== etaText) el.textContent = etaText;
  });
}
// A trap slot is a big arcade button in the slot's colour with the trap's icon; an empty slot is an empty socket.
const SLOT_PAL = ['red', 'blue', 'yellow'];
function slotArt(b, i, t, state = 'empty', cd = 0) {
  const down = b.classList.contains('down'), sig = `${t ? t.kind : ''}|${state}|${Math.round(cd * 32)}|${down}`;
  if (b.sig === sig) return; b.sig = sig;
  const c = b.querySelector('canvas.knob');
  drawKnob(c, { r: 11, pal: SLOT_PAL[i], icon: t && SPR.icon[t.kind], iconScale: 2, empty: !t, pressed: down || state === 'burn' || state === 'sent', cd: state === 'burn' ? cd : state === 'cool' ? cd : 0, spent: state === 'jam' || state === 'lock' });
  sizeArt(c);
}
function etaOfTrap(w, t) {
  const p = w.player, px = p.x + 5, dir = Math.sign(w.goal.x - px) || 1, ahead = ((t.x0 + t.x1 + 1) * TILE / 2 - px) * dir;
  return ahead < -TILE * 2 ? null : Math.max(0, ahead) / PHYS.maxRun;
}

// ---------- gadgets: the trapper's (left column) and the runner's (above the jump button / bottom left on PC)
// Each map hands out its own small set (see loadout.js). Keys go by slot: trapper 7 8 9 0, runner Shift Q E R.
// With a gamepad plugged in, the labels show its buttons instead: trap slots on B X Y (red, blue, yellow, like the
// slot colours), trapper gadgets on the shoulders, runner gadgets on X Y B RB (A jumps).
const T_KEYS = ['7', '8', '9', '0'], R_KEYS = ['Shift', 'Q', 'E', 'R'];
const PAD_T = ['LB', 'RB', 'LT', 'RT'], PAD_R = ['X', 'Y', 'B', 'RB'], PAD_SLOT = ['B', 'X', 'Y'];
let padOn = false;
const runnerKeyed = () => run.world.loadout.runner.filter(id => !GADGETS.runner[id].passive);
const keyOf = (side, id) => side === 'trapper' ? (padOn ? PAD_T : T_KEYS)[run.world.loadout.trapper.indexOf(id)] : (padOn ? PAD_R : R_KEYS)[runnerKeyed().indexOf(id)];
const slotKey = i => padOn ? PAD_SLOT[i] : touchDevice ? '' : String(i + 1);
function gadgetButton(id, side, onPress) {
  const b = document.createElement('button');
  b.className = 'gbtn ' + side; b.dataset.id = id;
  const key = keyOf(side, id), showKey = key && (!touchDevice || padOn);
  b.innerHTML = `<span class="kw"><canvas class="pix knob"></canvas><span class="secs"></span>${showKey ? `<i class="kc">${key}</i>` : ''}</span><small></small>`;
  b.querySelector('small').textContent = GADGETS[side][id].name;
  b.sig = '';
  { const c = b.querySelector('canvas.knob'); drawKnob(c, { r: 8, pal: side, icon: SPR.icon[id] }); sizeArt(c); }
  if (onPress) b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); unlockAudio(); if (run) onPress(id); });
  return b;
}
function buildGadgets() {
  const gb = $('gadbar'), rb = $('rgad');
  gb.innerHTML = ''; rb.innerHTML = '';
  const lo = run.world.loadout;
  if (run.trapperHere) for (const id of lo.trapper) gb.appendChild(gadgetButton(id, 'trapper', id => useTrapperGadget(id)));
  if (run.runnerHere) for (const id of lo.runner) rb.appendChild(gadgetButton(id, 'runner', GADGETS.runner[id].passive ? null : useRunnerGadget));
}
function updateGadgets() {
  const w = run.world;
  $('pad').classList.toggle('frozen', run.runnerHere && w.player.frost > 0);
  for (const [bar, side] of [['gadbar', 'trapper'], ['rgad', 'runner']]) for (const b of $(bar).children) {
    const id = b.dataset.id, g = w.gad[side][id], def = GADGETS[side][id];
    const state = g.n === 0 ? 'none' : side === 'trapper' && w.jam > 0 ? 'jam' : run.aim && run.aim.id === id ? 'aim' : g.cd > 0 ? 'cool' : def.passive ? 'passive' : 'ready';
    if (b.dataset.state !== state) { if (state === 'ready' && b.dataset.state === 'cool') flashReady(b); b.dataset.state = state; }
    b.style.setProperty('--cd', g.cd > 0 && def.cd ? Math.min(1, g.cd / def.cd).toFixed(3) : 0);
    const secs = g.cd > 0 && g.n !== 0 ? Math.ceil(g.cd) : '', secsEl = b.querySelector('.secs');
    if (secsEl.textContent != secs) secsEl.textContent = secs;
    const cd = g.cd > 0 && def.cd ? Math.min(1, g.cd / def.cd) : 0, down = b.classList.contains('down');
    const sig = `${state}|${Math.round(cd * 32)}|${g.n}|${down}`;
    if (b.sig !== sig) {
      b.sig = sig;
      const c = b.querySelector('canvas.knob');
      drawKnob(c, { r: 8, pal: state === 'aim' ? 'aim' : state === 'jam' ? 'grey' : side, icon: SPR.icon[id], pressed: down || state === 'aim', cd: state === 'jam' ? 1 : cd, spent: state === 'none', pips: g.n > 0 ? g.n : 0 });
      sizeArt(c);
    }
  }
}
function useTrapperGadget(id, at) {
  const w = run.world, def = GADGETS.trapper[id], g = w.gad.trapper[id];
  if (run.phase !== 'play' || g.n === 0 || g.cd > 0 || w.jam > 0) { deny(gadEl('gadbar', id)); return; }
  if (def.aim && !at) {   // pick a spot: the next tap / click on the map
    if (run.aim && run.aim.id === id) { run.aim = null; return; }
    run.aim = { id, x: w.player.x + 40 * (w.player.face || 1), y: w.player.y };
    $('hint').textContent = touchDevice ? `Tap where the ${def.name.toLowerCase()} should go` : `Click where the ${def.name.toLowerCase()} should go`;
    $('hint').classList.remove('hidden'); run.hintT = 2.5; sfx.click();
    return;
  }
  run.aim = null;
  const x = at ? Math.round(at.x) : 0, y = at ? Math.round(at.y) : 0;
  if (run.simOwner) { if (!w.useGadget('trapper', id, x, y)) deny(gadEl('gadbar', id)); }
  else { net.send({ t: 'gad', id, x, y, lead: net.lag }); g.cd = def.cd; if (g.n > 0) g.n--; sfx.click(); }
}
const gadNames = side => run.world.loadout[side].map(id => GADGETS[side][id].name.toLowerCase()).join(', ');
function useRunnerGadget(id) {
  if (!run.runnerHere || run.phase !== 'play') return;
  if (!run.world.useGadget('runner', id)) deny(gadEl('rgad', id));
}

// ---------- where the controls go. The bottom panel holds whoever plays on this device; on a shared touch screen
// the trapper gets a panel at the top. The game view is whatever space is left, so nothing covers it.
// Tell the renderer which parts of the screen the bars cover, so the camera keeps the action between them.
// The runner's gadgets on a circle around JUMP: they start low on its left and climb over its top, spaced so the
// sockets just touch, the whole arc centred on the upper left (where the thumb reaches from the corner).
function placeRing() {
  const pr = $('padR'); if (!pr.classList.contains('ring')) return;
  const btns = [...$('rgad').children], jc = $('tJump').querySelector('canvas.knob');
  if (!btns.length || !jc) return;
  $('tJump').style.marginRight = '';
  for (let pass = 0; pass < 2; pass++) {
    const P = uiRect(pr), J = uiRect(jc), g = uiRect(btns[0].querySelector('canvas.knob'));
    const cx = J.left + J.width / 2 - P.left, cy = J.top + J.width / 2 - P.top, gr = g.width / 2, Rr = J.width / 2 + gr - 2;
    const step = 2 * Math.asin(Math.min(1, (gr + 2) / Rr)), mid = 112 * Math.PI / 180;
    const start = Math.min(190 * Math.PI / 180, mid + (btns.length - 1) * step / 2);
    let right = 0;
    btns.forEach((b, i) => {
      const a = start - i * step, x = cx + Math.cos(a) * Rr, y = cy - Math.sin(a) * Rr;
      b.style.left = Math.round(x - gr) + 'px'; b.style.top = Math.round(y - gr) + 'px';
      right = Math.max(right, x + gr);
    });
    const over = right - (UI.w - P.left - 6);
    if (over <= 0) break;
    $('tJump').style.marginRight = Math.ceil(over) + 'px';
  }
}
function updateInsets() {
  if (!run) { R.setInsets(0, 0); R.resize(); return; }
  R.resize();   // measure the app frame first (it may have turned)
  placeRing();
  const hud = uiRect($('hud')), top = $('padTop'), pad = $('pad');
  let t = hud.bottom, b = 0;
  if (!top.classList.contains('hidden')) t = Math.max(t, uiRect(top).bottom);
  if (!pad.classList.contains('hidden')) b = viewH() - uiRect(pad).top;
  R.setInsets(t, b); R.resize();
}
function layoutControls() {
  const parts = $('parts');
  for (const id of ['arrows', 'tJump', 'trapbar', 'gadbar', 'rgad']) parts.appendChild($(id));
  for (const id of ['padL', 'padM', 'padR', 'padTL', 'padTM', 'padTR']) $(id).innerHTML = '';
  const bottom = { L: [], M: [], R: [] }, top = { L: [], M: [], R: [] };
  // Touch: gadgets sit right next to JUMP, under the same thumb (portrait phones: in a row above it).
  // Touch: the gadgets sit in a ring around JUMP, all under the same thumb (placeRing positions them).
  $('padR').classList.toggle('ring', run.runnerHere && touchDevice);
  if (run.runnerHere && touchDevice) { bottom.L.push('arrows'); bottom.R.push('tJump', 'rgad'); }
  else if (run.runnerHere) bottom.L.push('rgad');
  if (run.trapperHere) {
    const where = run.runnerHere && touchDevice ? top : bottom;
    where.M.push('trapbar'); where.R.push('gadbar');
  }
  const fill = (spec, prefix) => { let any = false; for (const k of ['L', 'M', 'R']) for (const id of spec[k]) { $(prefix + k).appendChild($(id)); any = true; } return any; };
  const hasBottom = fill(bottom, 'pad'), hasTop = fill(top, 'padT');
  lookSig = ''; touchLooks();
  document.body.classList.toggle('ringpad', run.runnerHere && touchDevice);
  $('pad').classList.toggle('hidden', !hasBottom);
  $('padTop').classList.toggle('hidden', !hasTop);
  document.body.classList.add('playing');
  document.body.classList.toggle('dualpad', hasTop);
  document.body.classList.toggle('nopad', !hasBottom);
  updateInsets();
}

// ---------- a run
// ---------- training: a guided level for each role
function startTutorial(role) {
  unlockAudio(); hidePanel();
  mode = 'tutorial'; isHost = true;
  players = { a: { name: me.name, char: me.char }, b: { name: 'Coach Bot', char: otherChar(me.char) } };
  score = { a: 0, b: 0 }; runs = [];
  startRun(TRAINING, role === 'runner' ? 'a' : 'b', 1, null, role);
}
function updateTutorial() {
  const t = run.tut, before = t.text;
  if (t.role === 'runner') t.runner(run.world, 1 / 60); else t.trapper(run.world, 1 / 60, run.tutCaught);
  run.tutCaught = false;
  if (t.text !== before && run.phase !== 'preview') { const h = $('hint'); h.textContent = t.text; h.classList.remove('hidden'); h.style.animation = 'none'; void h.offsetWidth; h.style.animation = ''; }
}

function startRun(level, runner, n, endless = null, tutRole = null) {
  forgetTyping();
  hidePanel();
  show(null);
  const world = new World(levelOf(level));
  const online = mode === 'online';
  const runnerHere = mode === 'tutorial' ? tutRole === 'runner' : !online || runner === mySide();
  run = {
    level, runner, n, world, phase: 'count', countT: 3.2, previewT: 0, lastCount: 4, acc: 0, steps: 0, outbox: [], snaps: [], pending: {}, hover: -1,
    runnerHere, trapperHere: mode === 'local' || (online && !runnerHere) || (mode === 'tutorial' && !runnerHere), simOwner: runnerHere || mode === 'tutorial', held: new Map(),
    bot: mode === 'practice' ? new Bot(0.35) : null, colors: charOf(players[runner].char), paused: false, endT: 0, hintT: 5, endless,
  };
  if (endless && endless.stage > 1) { run.countT = 1; run.hintT = 0; }
  if (tutRole) { run.tut = new Tutorial(tutRole, touchDevice, kind => { const i = (run.slots || []).findIndex(t => t && t.kind === kind); return i < 0 ? '' : i + 1; }); run.countT = 1.5; }
  run.score = new TrapScore(); run.closes = 0;
  if (endless && runnerHere) run.nextGen = genAsync(endless.stars);
  const Lv = levelOf(level);
  if (Lv.random && !endless && (mode !== 'online' || isHost)) prefetch(Lv.stars);
  if (endless && endless.stage >= 5) achieve('endless5');
  if (endless && endless.stage >= 10) achieve('endless10');
  run.trail = [];
  run.ghost = settings.ghost && lastGhost && !endless && lastGhost.key === levelKey(level) ? lastGhost : null;
  run.preview = settings.preview && !(endless && endless.stage > 1) && !tutRole;
  if (endless && endless.score) Object.assign(run.score, endless.score, { kinds: new Set(), lastT: -99, streak: 0 });
  R.parts = []; R.follow(world, 0, run.trapperHere && !runnerHere, true);
  $('hud').classList.remove('hidden');
  const role = $('role');
  if (mode === 'local') { role.textContent = 'RUN'; role.className = 'role'; $('who').textContent = `${players[runner].name}  ·  traps: ${players[other(runner)].name}`; }
  else if (mode === 'practice') { role.textContent = 'RUN'; role.className = 'role'; $('who').textContent = levelOf(level).name; }
  else if (mode === 'tutorial') { role.textContent = runnerHere ? 'RUN' : 'TRAP'; role.className = 'role' + (runnerHere ? '' : ' trap'); $('who').textContent = 'Training Grounds'; }
  else { role.textContent = runnerHere ? 'RUN' : 'TRAP'; role.className = 'role' + (runnerHere ? '' : ' trap'); $('who').textContent = runnerHere ? `${players[other(runner)].name} has the traps` : `${players[runner].name} is running`; }
  if (endless) $('who').textContent = `∞ ${starText(endless.stars)} · Stage ${endless.stage}` + (mode === 'online' ? (runnerHere ? '' : ` · ${players[runner].name} runs`) : mode === 'local' ? ` · ${players[runner].name} runs` : '');
  buildTrapBar();
  buildGadgets();
  layoutControls();
  updateTrapScore(false);
  const hint = mode === 'local' ? `${players[runner].name} runs (${touchDevice ? 'buttons' : 'arrows + Space'}), ${players[other(runner)].name} uses the trap bar${touchDevice ? '' : ' (1-3, gadgets 7-0)'}`
    : runnerHere ? (touchDevice ? `Reach the flag! Your gadgets: ${gadNames('runner')}.` : `Reach the flag! ← → run, Space jump. ${runnerKeyed().map((id, i) => R_KEYS[i] + ' ' + GADGETS.runner[id].name.toLowerCase()).join(', ')}.`)
      : (touchDevice ? `The three coloured buttons fire the traps outlined in the same colour (hold for the flame). Your gadgets: ${gadNames('trapper')}.` : `Keys 1-3 fire the coloured trap buttons, 7-0 gadgets (${gadNames('trapper')}), aimed at your mouse.`);
  $('hint').textContent = (endless ? 'Endless: no clock, new stage at every flag. Swap sides from the II menu. ' : '') + hint + ''; $('hint').classList.remove('hidden');
  if (run.preview) { run.phase = 'preview'; run.previewT = PREVIEW; showPreview(); $('hint').classList.add('hidden'); }
  input.jumpQueued = false;
  startMusic(endless ? 'endless' : levelOf(level).theme);
}

// Every game event passes through here on both devices: particles, sound, vibration, the trapper's score.
function gameEvent(e) {
  const [k, x, y, extra] = e;
  R.onEvent(e, run.colors); playEvent(e);
  if (k === 'die') buzz(run.runnerHere ? [60, 40, 90] : 25);
  if ((k === 'stun' || k === 'block') && run.runnerHere) buzz(35);
  if (k === 'catch') { onCatch(extra); run.tutCaught = true; }
  if (k === 'block' && run.runnerHere) achieve('shield_save');
}
R.onClose = () => { sfx.whoosh(); if (run && run.runnerHere) { buzz(12); if (++run.closes >= 5) achieve('close5'); } };

// ---------- achievements: a banner slides in when one unlocks
const achQueue = [];
function achieve(id) {
  const def = unlock(id);
  if (!def) return;
  achQueue.push(def);
  if (achQueue.length === 1) showAch();
}
function showAch() {
  const def = achQueue[0];
  if (!def) return;
  const el = $('achv');
  el.innerHTML = `<span class="achIcon">${medal(def.id)}</span><div><small>Achievement unlocked!</small><b>${esc(def.name)}</b></div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  sfx.achieve();
  setTimeout(() => { el.classList.remove('show'); achQueue.shift(); setTimeout(showAch, 300); }, 3000);
}
function openTrophies() {
  panel(`<h2>Trophies</h2><p class="status">${achCount()} of ${ACHIEVEMENTS.length} unlocked</p>
    <div class="trophies">${ACHIEVEMENTS.map(a => `<div class="tro${has(a.id) ? ' got' : ''}"><span class="achIcon">${medal(a.id, has(a.id))}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}</div>
    <div class="buttons"><button class="big pink" id="troDone">Back</button></div>`);
  $('panelCard').classList.add('wide');
  $('troDone').onclick = () => { sfx.click(); hidePanel(); };
}
$('troBtn').onclick = () => { sfx.click(); openTrophies(); };

// ---------- the item guide: every trap and gadget with a short description, so new players know what the buttons do
const TRAP_DESC = {
  spikes: 'Spikes pop out of the floor for a moment. Hop over them or wait until they drop.',
  flame: 'A column of fire. It burns as long as the trapper holds the button; several flames in a row can be chained.',
  crusher: 'A heavy block slams down from the ceiling. Don\'t stand under it.',
  cannon: 'Shoots a cannonball along the floor. Jump over it.',
  arrows: 'Fires fast arrows. Hard to dodge: watch the rhythm.',
  trapdoor: 'The floor opens up for a moment. Fall in and you lose a life.',
  wall: 'A 3-tile wall pops up for a moment: only a full jump clears it. Fired right in front of the runner, it shoves them back (into whatever is behind them). Never kills by itself.',
  fan: 'Blows the runner upward. Dangerous under ceiling spikes.',
  saw: 'A blade runs along its rail and back. Jump over it as it passes.',
  laser: 'Aims for a moment, then fires a beam across the room.',
  dropper: 'Drops a bomb from the ceiling that blasts where it lands.',
  conveyor: 'The floor runs backwards. Hard to jump far from it.',
  ice: 'The floor freezes over: slippery, hard to stop.',
};
const GAD_LONG = {
  dash: 'A quick burst forward, about two tiles.', blink: 'Teleports you up to 3 tiles forward, even through traps.', haste: 'Run 35% faster for 3 s.',
  feather: 'Jump a second time in mid-air. Used just by jumping again.', boots: 'Jump much higher for 5 s.', glider: 'Hold jump while falling to float down slowly.',
  shield: 'For 2 s, the next hit is blocked and bounces you up.', phase: 'For 2 s, traps and shots pass right through you.', jam: 'Stops every trap and the trapper\'s gadgets for 2 s.',
  slowmo: 'Slows all traps and shots down for 2.5 s.', flag: 'Places a checkpoint where you stand.', decoy: 'Sends a fake runner ahead to fool the trapper.',
  magnet: 'For 3 s nothing can push you: wind, fans, belts.', peek: 'Shows hidden mines and which traps are ready, for 3 s.',
  bolt: 'Aim it: a lightning bolt strikes after a short warning and stuns the runner.', glue: 'Aim it: a sticky puddle on the floor slows the runner and lowers their jumps.',
  mine: 'Aim it: a hidden mine that pops the runner up and stuns them.', bat: 'Aim it: a bat flies at the runner and stuns on contact.',
  gust: 'A strong wind blows the runner back for 1.8 s; jumps fall short.', hex: 'Swaps the runner\'s left and right for 2.6 s.',
  frost: 'Freezes the runner\'s controls for 1.4 s: no running, jumping or gadgets, while the world goes on. Mid-jump, they drop.', fog: 'The runner can only see close around them for 4 s.',
  anvil: 'Makes the runner heavy for 3 s: low jumps, fast falls.', moon: 'Floaty low gravity for 3 s: hard to land precisely.',
  rewind: 'Sends the runner back to where they were 2 s ago.', squash: 'Shrinks the runner for 3 s: slower and lower jumps.',
};
function gadStats(g) {
  const bits = [g.passive ? 'automatic' : g.charges < 0 ? 'unlimited' : `${g.charges} per run`];
  if (g.cd) bits.push(`${g.cd} s cooldown`);
  return bits.join(' · ');
}
function openGuide(back, tab = 'traps') {
  const tabs = [['traps', 'Traps'], ['runner', 'Runner gadgets'], ['trapper', 'Trapper gadgets']];
  const rows = tab === 'traps'
    ? Object.keys(TRAPS).map(k => [k, TRAPS[k].name, TRAP_DESC[k], TRAPS[k].hold ? 'hold the button' : `${TRAPS[k].cd} s cooldown`])
    : Object.keys(GADGETS[tab]).map(id => [id, GADGETS[tab][id].name, GAD_LONG[id], gadStats(GADGETS[tab][id])]);
  panel(`<h2>Items</h2>
    <p class="status">${tab === 'traps' ? 'The trapper fires these from the coloured buttons.' : tab === 'runner' ? 'Each map gives the runner four of these.' : 'Each map gives the trapper four of these.'}</p>
    <div class="seg guideTabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="guide">${rows.map(([id, name, desc, stat]) => `<div class="gRow ${tab}"><canvas class="pix" width="7" height="7" data-icon="${id}"></canvas><div><b>${esc(name)}</b><small>${esc(desc || '')}</small><i>${esc(stat)}</i></div></div>`).join('')}</div>
    <div class="buttons"><button class="big pink" id="guideDone">Back</button></div>`);
  $('panelCard').classList.add('wide');
  for (const c of $('panelCard').querySelectorAll('canvas[data-icon]')) c.getContext('2d').drawImage(SPR.icon[c.dataset.icon], 0, 0);
  for (const b of $('panelCard').querySelectorAll('[data-tab]')) b.onclick = () => { sfx.click(); openGuide(back, b.dataset.tab); };
  $('guideDone').onclick = () => { sfx.click(); back(); };
}
$('itemsBtn').onclick = () => { sfx.click(); openGuide(hidePanel); };

// ---------- the trapper's score: a big gold popup for every catch, combos stack up
function onCatch(credit) {
  const r = run.score.catch(credit, run.world.time), mine = run.trapperHere;
  if (mine && run.bot == null) {
    achieve('first_catch');
    if (credit === 'assist') achieve('assist');
    if (r.streak >= 3) achieve('combo');
    if (run.score.catches >= 5) achieve('catch5');
    if (run.score.kinds.size >= 4) achieve('variety');
    if (run.score.pts >= 900) achieve('trap_master');
  }
  const pop = $('catchPop');
  pop.className = 'catchPop' + (mine ? ' mine' : '') + (r.streak > 1 ? ' combo' : '');
  pop.innerHTML = `<b>+${r.gain}</b>${r.lines.map(t => `<small>${t}</small>`).join('')}`;
  void pop.offsetWidth; pop.classList.add('show');
  clearTimeout(pop.hideT); pop.hideT = setTimeout(() => pop.classList.remove('show'), 1300);
  updateTrapScore(true);
  if (mine) { sfx.kaching(r.streak); buzz(r.streak > 1 ? [30, 30, 30, 30, 60] : [40, 30, 50]); R.flash = 0.08; }
}
function updateTrapScore(bump) {
  const el = $('tscore'), s = run.score;
  el.textContent = s.pts;
  el.title = run.trapperHere ? 'Your trap score' : 'Trapper score';
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

// ---------- level preview: the camera flies to the flag and back while a banner shows the level and the gadgets
const PREVIEW = 16;   // seconds; skipping needs both players online (hold Space on PC, the Skip button on phones)
// One line per gadget, for the preview banner.
const GAD_DESC = {
  dash: 'burst forward', blink: 'teleport 3 tiles', haste: 'run faster', feather: 'jump again in the air', boots: 'jump higher', glider: 'hold jump to float',
  shield: 'blocks one hit', phase: 'traps pass through you', jam: 'stops all traps for 2 s', slowmo: 'slows the traps', flag: 'checkpoint where you stand',
  decoy: 'a fake runner', magnet: 'nothing can push you', peek: 'see hidden mines',
  bolt: 'aimed lightning: stuns', glue: 'aimed puddle: slows', mine: 'hidden: pops them up', bat: 'chases the runner', gust: 'wind blows them back',
  hex: 'swaps left and right', frost: 'frozen controls', fog: 'they only see nearby', anvil: 'heavy: low jumps', moon: 'floaty jumps',
  rewind: 'back 2 seconds', squash: 'small and slow',
};
function showPreview() {
  const L = levelOf(run.level), lo = run.world.loadout, el = $('preview');
  const mine = side => (side === 'runner') === run.runnerHere || mode === 'local';
  const icons = side => lo[side].map(id => `<span class="pvGad"><canvas class="pix" width="7" height="7" data-icon="${id}"></canvas><span><b>${esc(GADGETS[side][id].name)}</b><i>${GAD_DESC[id] || ''}</i></span></span>`).join('');
  const stars = L.stars || starsOf(L);
  const kinds = [...new Set(run.world.traps.map(t => t.kind))];
  el.innerHTML = `<div class="pvName">${esc(run.endless ? '∞ ' + L.name : L.name)} <span class="stars">${starText(stars)}</span></div>
    <div class="pvTraps">${kinds.map(k => `<span class="pvTrap"><canvas class="pix" width="7" height="7" data-icon="${k}"></canvas>${esc(TRAPS[k].name)}</span>`).join('')}</div>
    <div class="pvRow${mine('runner') ? ' mine' : ''}"><b class="pvSide run">RUNNER</b>${icons('runner')}</div>
    <div class="pvRow${mine('trapper') ? ' mine' : ''}"><b class="pvSide trap">TRAPPER</b>${icons('trapper')}</div>
    <div class="pvSkip"><small id="pvT"></small>${touchDevice ? '<button class="chip" id="pvSkipBtn">⏭ Skip</button>' : '<div class="pvHold"><span id="pvHoldBar"></span><b>Hold SPACE to skip</b></div>'}</div>`;
  for (const c of el.querySelectorAll('canvas[data-icon]')) c.getContext('2d').drawImage(SPR.icon[c.dataset.icon], 0, 0);
  el.classList.remove('hidden');
  run.meReady = false; run.peerReady = !!run.peerReadyEarly;
}
function endPreview() {
  if (!run || run.phase !== 'preview') return;
  run.phase = 'count'; run.previewT = 0; $('preview').classList.add('hidden'); $('hint').classList.remove('hidden'); run.hintT = 5;
  R.follow(run.world, 0, run.trapperHere && !run.runnerHere, true);
}
// Tap when you've seen enough. Online the round starts once both players are ready (or the time is up).
function readyPreview() {
  if (!run || run.phase !== 'preview' || run.meReady) return;
  run.meReady = true; sfx.click();
  if (mode === 'online') net.send({ t: 'ready' });
  if (mode !== 'online' || run.peerReady) endPreview();
}
$('preview').addEventListener('pointerdown', e => { if (e.target.closest('#pvSkipBtn')) { e.preventDefault(); readyPreview(); } });
const HOLD_SKIP = 0.7;   // seconds a key has to be held to skip on PC
function holdingSkip() { return run && run.phase === 'preview' && !run.meReady && (keys.has('Space') || keys.has('Enter')); }
function panPreview(dt) {
  run.previewT -= dt;
  if (run.previewT <= 0) return endPreview();
  const left = Math.ceil(run.previewT), other = players[mySide() === 'a' ? 'b' : 'a'];
  run.skipHold = holdingSkip() ? (run.skipHold || 0) + dt : 0;
  const bar = $('pvHoldBar'); if (bar) bar.style.width = (run.meReady ? 100 : Math.min(100, run.skipHold / HOLD_SKIP * 100)).toFixed(0) + '%';
  if (run.skipHold >= HOLD_SKIP) readyPreview();
  if (run.phase !== 'preview') return;
  const online = mode === 'online', friend = esc(other ? other.name : 'your friend');
  const txt = run.meReady ? `Skipping… waiting for ${friend} (${left})` : `Starts in ${left}${online && run.peerReady ? ` · ${friend} wants to skip` : ''}`;
  const pv = $('pvT'); if (pv && pv.textContent !== txt) pv.textContent = txt;
  // hold on the start, fly to the flag, look around there, fly back
  const w = run.world, u = 1 - run.previewT / PREVIEW, ease = v => v * v * (3 - 2 * v);
  const even = v => 0.8 * v + 0.2 * ease(v);   // nearly constant speed, so the whole level gets the same attention
  const k = u < 0.06 ? 0 : u < 0.84 ? even((u - 0.06) / 0.78) : u < 0.92 ? 1 : 1 - ease((u - 0.92) / 0.08);
  R.pan(w, w.start.x + (w.goal.x - w.start.x) * k, w.start.y + (w.goal.y - w.start.y) * k, run.trapperHere && !run.runnerHere);
}

function receiveSnap(m) {
  const w = run.world;
  if ((run.phase === 'count' || run.phase === 'preview') && m.tm > 0) { if (run.phase === 'preview') endPreview(); run.phase = 'play'; run.countT = 0; $('count').classList.add('hidden'); }
  w.applySnap(m);
  run.snaps.push({ at: performance.now(), x: m.p[0], y: m.p[1], dead: !!(m.p[5] & 2) });
  if (run.snaps.length > 12) run.snaps.shift();
  for (const e of m.ev) gameEvent(e);
  for (const id in run.pending) if (w.traps[id].state !== 'idle' || w.traps[id].cd > 0) run.pending[id] = 0;
}

let lastGhost = null;
const levelKey = ref => typeof ref === 'number' ? 'L' + ref : ref && ref.id;
function finishRun(res) {
  if (run.phase === 'end') return;
  run.phase = 'end';
  if (run.simOwner && run.trail.length && !run.endless) res.trail = run.trail;
  if (run.runnerHere && res.finished) {
    const L = levelOf(run.level);
    achieve('first_flag');
    if (res.deaths === 0) achieve('flawless');
    if (L.id === 'hills' && res.time < 15) achieve('speedster');
    if (L.id === 'gauntlet') achieve('gauntlet');
    if (L.random && L.stars === 3) achieve('daredevil');
    if (run.ghost && res.time < run.ghost.trail.length / 30) achieve('ghostbuster');
  }
  if (res.trail) lastGhost = { key: levelKey(run.level), trail: res.trail, charObj: charOf(players[res.runner].char) };
  if (mode === 'online' && run.simOwner) net.send({ t: 'done', res });
  runs.push(res);
  for (const id of ['hint', 'pad', 'padTop']) $(id).classList.add('hidden');
  run.aim = null;
  setTimeout(() => showRunResult(res), res.finished ? 300 : 0);
}

function resultOf(world, runner) {
  const p = world.player, span = Math.max(1, world.goal.x - world.start.x);
  return { runner, time: Math.round(world.time * 10) / 10, deaths: p.deaths, finished: p.finished, tp: run.score.pts, tc: run.score.catches, ts: run.score.bestStreak,
    progress: p.finished ? 100 : Math.max(0, Math.min(99, Math.round((p.best - world.start.x) / span * 100))) };
}
const fmt = r => r.finished ? `${r.time.toFixed(1)}s` : `${r.progress}%`;
function line(r, win) {
  const p = players[r.runner];
  return `<div class="line${win ? ' win' : ''}" data-portrait="${p.char}"><div><b>${esc(p.name)}${win ? ' ' + PI('crown') : ''}</b><small>${r.finished ? 'reached the flag' : 'ran out of time'} · ${r.deaths} ${r.deaths === 1 ? 'fall' : 'falls'}</small></div><span class="t">${fmt(r)}</span></div>`;
}
// Who trapped best this level: the trapper of each run is the other player.
function trapKing(r1, r2) {
  if (!r1 || !r2 || r1.tp == null) return '';
  const a = { who: other(r1.runner), pts: r1.tp || 0, c: r1.tc || 0 }, b = { who: other(r2.runner), pts: r2.tp || 0, c: r2.tc || 0 };
  const k = a.pts === b.pts ? null : a.pts > b.pts ? a : b;
  const best = store.get('bestTrap', 0), mine = [a, b].find(t => t.who === mySideOrA());
  let pb = '';
  if (mine && mine.pts > best && mode === 'online') { store.set('bestTrap', mine.pts); pb = '<div class="pb">New personal best!</div>'; }
  return `<div class="trapKing"><div class="tkTitle">${PI('spikes')} Trap points</div>${[a, b].map(t => `<div class="tkRow${t === k ? ' king' : ''}"><span>${esc(players[t.who].name)}${t === k ? ' ' + PI('crown') : ''}</span><small>${t.c} ${t.c === 1 ? 'catch' : 'catches'} · ${titleFor(t.pts)}</small><b>${t.pts}</b></div>`).join('')}${pb}</div>`;
}
const mySideOrA = () => mode === 'online' ? mySide() : 'a';
const better = (x, y) => x.finished !== y.finished ? x.finished : x.finished ? x.time < y.time : x.progress > y.progress;

function showRunResult(res) {
  if (!run) return;
  const name = players[res.runner].name, L = levelOf(run.level);
  const controls = mode !== 'online' || isHost;
  if (mode === 'tutorial') {
    const trap = run.tut.role === 'trapper', other = trap ? 'runner' : 'trapper';
    panel(`<div class="big-emoji">${PI('trophy', 'bigpi')}</div><h2>Training complete!</h2>
      <p>${trap ? `You caught the Coach Bot ${run.score.catches} ${run.score.catches === 1 ? 'time' : 'times'} (${run.score.pts} points).` : `You reached the flag in ${res.time.toFixed(1)}s with ${res.deaths} ${res.deaths === 1 ? 'fall' : 'falls'}.`}</p>
      <p>Now grab a friend: host a party, or play on the same screen.</p>
      <div class="buttons"><button class="big pink" id="tutNext">${trap ? PIW('dash') + ' Runner training' : PIW('spikes') + ' Trapper training'}</button>
      <div class="row"><button class="mid" id="tutAgain">Again</button><button class="mid" id="tutDone">Main menu</button></div></div>`);
    $('tutNext').onclick = () => { sfx.click(); startTutorial(other); };
    $('tutAgain').onclick = () => { sfx.click(); startTutorial(run.tut.role); };
    $('tutDone').onclick = () => { sfx.click(); nav('title'); };
    return;
  }
  if (mode === 'practice') {
    const best = store.get('best', {}), prev = L.random ? null : best[L.id];
    const record = res.finished && (!prev || res.time < prev);
    if (record && !L.random) { best[L.id] = res.time; store.set('best', best); }
    panel(`<div class="big-emoji">${PI(res.finished ? 'flag' : 'clock', 'bigpi')}</div><h2>${res.finished ? 'You made it!' : 'Out of time'}</h2>
      <div class="result">${line(res, false)}</div>
      <p>${record ? 'New best time!' : prev ? `Best: ${prev.toFixed(1)}s` : ''}</p>
      <div class="buttons"><button class="big pink" id="again">Try again</button>
      <div class="row"><button class="mid" id="nextLv">Next level</button><button class="mid" id="toLobby">Levels</button></div></div>`);
    $('again').onclick = () => { sfx.click(); startRun(run.level, 'a', 1); };
    $('nextLv').onclick = () => { sfx.click(); lobby.level = nextOf(run.level); startRun(lobby.level, 'a', 1); };
    $('toLobby').onclick = () => { sfx.click(); endRunView(); openLobby(); };
    return;
  }
  if (run.n === 1) {
    const next = other(res.runner);
    panel(`<div class="big-emoji">${PI(res.finished ? 'flag' : 'clock', 'bigpi')}</div><h2>${esc(name)} ${res.finished ? 'made it!' : 'ran out of time'}</h2>
      <div class="result">${line(res, false)}</div>
      <p><b>Swap!</b> Now ${esc(players[next].name)} runs and ${esc(name)} gets the traps.</p>
      <div class="buttons">${controls ? `<button class="big pink" id="go2">Go!</button>` : `<p class="status">Waiting for the host…</p>`}</div>`);
    if (controls) $('go2').onclick = () => { sfx.click(); hostStart(run.level, next, 2); };
    return;
  }
  const [r1, r2] = runs.slice(-2);
  const tie = r1 && r2 && !better(r1, r2) && !better(r2, r1);
  const win = tie ? null : better(r1, r2) ? r1 : r2;
  if (win && !run.scored) { score[win.runner]++; run.scored = true; }
  if (!run.counted) { run.counted = true; if (bump('levels') >= 10) achieve('rivals'); }
  if (lobby.bo3 && win && score[win.runner] >= 2) return trophyScreen(win.runner, r1, r2);
  const nextLevel = controls ? nextOf(run.level) : null;
  panel(`<div class="big-emoji">${PI(tie ? 'flag' : 'trophy', 'bigpi')}</div><h2>${tie ? "It's a tie!" : esc(players[win.runner].name) + ' wins ' + esc(L.name) + '!'}</h2>
    <div class="result">${[r1, r2].map(r => line(r, r === win)).join('')}</div>
    ${trapKing(r1, r2)}
    <p>Score: ${esc(players.a.name)} <b>${score.a}</b> – <b>${score.b}</b> ${esc(players.b.name)}</p>
    <div class="buttons">${controls ? `<button class="big pink" id="nextLv">Next: ${esc(nextLevel.name || levelOf(nextLevel).name)}</button>
      <div class="row"><button class="mid" id="again">Rematch</button><button class="mid" id="toLobby">Lobby</button></div>` : `<p class="status">Waiting for the host…</p>`}</div>`);
  if (!controls) return;
  const firstNext = other(r1.runner);   // whoever ran second this time runs first next time
  $('nextLv').onclick = () => { sfx.click(); lobby.level = nextLevel; lobby.first = firstNext; runs = []; syncLobby(); hostStart(nextLevel, firstNext, 1); };
  $('again').onclick = () => { sfx.click(); lobby.first = firstNext; runs = []; syncLobby(); hostStart(run.level, firstNext, 1); };
  $('toLobby').onclick = () => { sfx.click(); if (mode === 'online') net.send({ t: 'toLobby' }); endRunView(); syncLobby(); openLobby(); };
}

// ---------- best of 3: the first to win two levels takes the trophy
function trophyScreen(winner, r1, r2) {
  const controls = mode !== 'online' || isHost, loser = other(winner);
  sfx.goal(); buzz([60, 40, 60, 40, 120]);
  if (mode !== 'online' || winner === mySide()) achieve('champion');
  panel(`<div class="trophy">${PI('trophy', 'bigpi')}</div><h2>${esc(players[winner].name)} wins the match!</h2>
    <div class="champ" data-portrait="${players[winner].char}"></div>
    <p class="matchScore"><b>${score[winner]}</b> – <b>${score[loser]}</b></p>
    ${trapKing(r1, r2)}
    <div class="buttons">${controls ? `<button class="big pink" id="newMatch">New match</button><button class="mid" id="toLobby">Lobby</button>` : `<p class="status">Waiting for the host…</p>`}</div>`);
  confetti();
  if (!controls) return;
  $('newMatch').onclick = () => { sfx.click(); score = { a: 0, b: 0 }; runs = []; lobby.level = nextOf(run.level); lobby.first = other(lobby.first); syncLobby(); hostStart(lobby.level, lobby.first, 1); };
  $('toLobby').onclick = () => { sfx.click(); score = { a: 0, b: 0 }; if (mode === 'online') net.send({ t: 'toLobby' }); endRunView(); syncLobby(); openLobby(); };
}
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#f08a3a', '#f0be4a', '#4aa3b2', '#7fb04e', '#d9663f', '#fdf6e6'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.5).toFixed(2)}s;--dx:${Math.round((Math.random() - 0.5) * 120)}px`;
    box.appendChild(c);
  }
  $('app').appendChild(box); setTimeout(() => box.remove(), 4500);
}

function endRunView() {
  run = null; hidePanel(); R.setInsets(0, 0);
  for (const id of ['hud', 'hint', 'count', 'rotate', 'pad', 'padTop', 'preview']) $(id).classList.add('hidden');
  document.body.classList.remove('playing', 'dualpad');
}

function panel(html) {
  $('panelCard').innerHTML = html; $('panel').classList.remove('hidden'); $('panelCard').classList.remove('wide');
  for (const el of $('panelCard').querySelectorAll('[data-portrait]')) el.prepend(portrait(el.dataset.portrait));
}
function hidePanel() { $('panel').classList.add('hidden'); }

function togglePause() {
  if (!run || run.phase === 'end') return;
  if (!$('panel').classList.contains('hidden')) { hidePanel(); run.paused = false; return; }
  const online = mode === 'online';
  run.paused = !online;
  const E = run.endless, canLobby = E && online && isHost;
  panel(`<h2>${online ? 'Menu' : 'Paused'}</h2>${E ? `<p>∞ ${starText(E.stars)} · stage ${E.stage} · ${(E.total + run.world.time).toFixed(0)}s · ${E.deaths + run.world.player.deaths === 1 ? '1 fall' : (E.deaths + run.world.player.deaths) + ' falls'}</p>` : ''}<div class="buttons">
    <button class="big pink" id="resume">${online ? 'Back to the game' : 'Resume'}</button>
    ${E && mode !== 'practice' ? `<button class="big blue" id="swapBtn">Swap sides (new level)</button>` : ''}
    ${canLobby ? `<button class="mid" id="endBtn">End run · lobby</button>` : ''}
    <button class="mid" id="quitRun">${online ? 'Leave the party' : 'Quit to lobby'}</button>
    <div class="row"><button class="chip" id="pItems">${PIW('book')} Items</button><button class="chip" id="pSet">${PIW('gear')} Settings</button></div></div>`);
  $('resume').onclick = () => { sfx.click(); hidePanel(); if (run) run.paused = false; };
  if ($('swapBtn')) $('swapBtn').onclick = () => { sfx.click(); swapSides(); };
  if ($('endBtn')) $('endBtn').onclick = () => { sfx.click(); if (online) net.send({ t: 'toLobby' }); endRunView(); syncLobby(); openLobby(); };
  $('quitRun').onclick = () => { sfx.click(); if (online || mode === 'tutorial') nav('title'); else { endRunView(); openLobby(); } };
  $('pSet').onclick = () => { sfx.click(); openSettings(() => { hidePanel(); togglePause(); }); };
  $('pItems').onclick = () => { sfx.click(); openGuide(() => { hidePanel(); togglePause(); }); };
}
$('pauseBtn').onclick = () => { sfx.click(); togglePause(); };
// Landscape only: the app frame turns itself on a phone held upright (see layoutApp in render.js). Where the browser
// allows a real lock (an installed Android app, fullscreen), ask for it too on the first touch.
addEventListener('pointerdown', () => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* not allowed here */ } }, { once: true });
{ const c = document.createElement('canvas'); c.className = 'pix knob'; drawKnob(c, { r: 5, pal: 'dark', icon: KICON.pause }); sizeArt(c); $('pauseBtn').textContent = ''; $('pauseBtn').append(c); }

// ---------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // rAF time can trail performance.now() on the first frame
  watchSpeed(dt);
  try { tick(dt, now); } catch (e) { console.error(e); showError(e); }
}
function showError(e) { if (DEBUG) toast('Error: ' + e.message); }

function tick(dt, now) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  if (innerWidth !== UI.iw || innerHeight !== UI.ih || dpr !== R.dpr) updateInsets();
  paintEdges();
  readPads(dt);
  if (!run) { drawMenuScene(dt); animateTitle(dt); return; }
  const w = run.world;
  readInput();
  if (run.phase === 'preview' && !run.paused) panPreview(dt);
  // countdown (both devices count on their own; the trapper also switches to 'play' when the first moving snapshot lands)
  if (run.phase === 'count' && !run.paused) {
    run.countT -= dt;
    const n = Math.ceil(run.countT);
    if (n !== run.lastCount && n <= 3) {
      run.lastCount = n; const c = $('count'); c.classList.remove('hidden'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
      c.textContent = n > 0 ? n : 'GO!'; c.dataset.n = n > 0 ? n : 'go'; (n > 0 ? sfx.count : sfx.go)();
    }
    if (run.countT <= 0) { run.phase = 'play'; input.jumpQueued = false; setTimeout(() => $('count').classList.add('hidden'), 450); }
  }
  if (run.tut) { if (run.phase === 'play') updateTutorial(); run.hintT = 99; }
  $('hint').classList.toggle('tut', !!run.tut);
  run.hintT -= dt; if (run.hintT <= 0) $('hint').classList.add('hidden');
  for (const id in run.pending) run.pending[id] -= dt;

  if (run.simOwner && !run.paused && run.phase !== 'end') {
    run.acc += dt;
    while (run.acc >= DT) {
      run.acc -= DT;
      if (run.phase === 'play') {
        w.step(DT, run.tut && run.tut.role === 'trapper' ? run.tut.botInput(w, DT) : { left: input.left, right: input.right, jump: input.jump, jumpPressed: input.jumpQueued });
        input.jumpQueued = false;
        if (run.bot) run.bot.think(w, DT);
        if (run.steps % 6 === 0 && !run.endless) { const p = w.player; run.trail.push(Math.round(p.x), Math.round(p.y), (p.face > 0 ? 1 : 0) | (p.onGround ? 2 : 0) | (p.dead ? 4 : 0)); }
      }
      for (const e of w.events) { gameEvent(e); if (mode === 'online') run.outbox.push(e); }
      w.events.length = 0;
      run.steps++;
      if (mode === 'online' && run.steps % 2 === 0) { const s = w.snapshot(); s.ev = run.outbox; run.outbox = []; net.send(s); }
      if (run.phase === 'play') {
        if (w.player.finished) { run.endT += DT; if (run.endT > 1.1) { if (run.endless) nextStage(); else finishRun(resultOf(w, run.runner)); break; } }
        else if (w.time >= TIME_LIMIT && !run.endless) { finishRun(resultOf(w, run.runner)); break; }
      }
    }
    if (run && run.phase === 'end' && mode === 'online') { const s = w.snapshot(); s.ev = run.outbox; run.outbox = []; net.send(s); }
  }
  if (!run || run.world !== w) return;   // ended, or the next endless stage just started
  if (!run.simOwner) {
    // smooth the runner between snapshots, ~90 ms behind
    const t = performance.now() - 60, S = run.snaps;
    let i = S.length - 1; while (i > 0 && S[i - 1].at > t) i--;
    const a = S[i - 1], b = S[i];
    if (a && b && !a.dead && !b.dead && b.at > a.at && Math.hypot(b.x - a.x, b.y - a.y) < 40) {
      const k = Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at)));
      w.player.x = a.x + (b.x - a.x) * k; w.player.y = a.y + (b.y - a.y) * k;
    }
    for (const shot of w.shots) shot.x += shot.vx * dt;
    w.rtime = w.rtime == null || Math.abs(w.rtime - (w.time - 0.06)) > 0.25 ? w.time - 0.06 : w.rtime + dt;   // smooth clock for moving platforms
  }
  if (run.phase !== 'preview') R.follow(w, dt, run.trapperHere && !run.runnerHere);
  // footsteps while running, and now and then a bird (by day) or a cricket (at night)
  const pl = w.player;
  if (pl.onGround && !pl.dead && Math.abs(pl.vx) > 40 && run.phase === 'play') { run.stepAcc = (run.stepAcc || 0) + Math.abs(pl.vx) * dt; if (run.stepAcc > 30) { run.stepAcc = 0; run.stepAlt = !run.stepAlt; sfx.step(run.stepAlt); } }
  run.ambT = (run.ambT ?? 3) - dt;
  if (run.ambT <= 0) { run.ambT = 3 + Math.random() * 6; const th = w.level.theme; (th === 'night' || th === 'dusk' || th === 'haunted' ? sfx.cricket : th === 'lava' || th === 'ice' ? sfx.drip : sfx.chirp)(); }
  updateGadgets();
  if (run.trapperHere) updateTrapBar();
  R.draw(w, { dt, colors: run.colors, trapper: run.trapperHere, hover: run.hover, pending: run.pending, aim: run.aim, slots: run.trapperHere ? run.slots : null, slotColors: SLOT_COLORS, runnerView: run.runnerHere, ghost: run.ghost && run.phase !== 'preview' ? run.ghost : null, debug: DEBUG });
  const left = run.endless ? 1e9 : TIME_LIMIT - w.time, E = run.endless;
  $('timer').textContent = (E ? E.total + w.time : w.time).toFixed(1); $('timer').classList.toggle('low', left < 15);
  $('deaths').textContent = (E ? E.deaths : 0) + w.player.deaths;
}

// Safari tints the strip it keeps at the bottom of the screen with the page background: match what's at the bottom.
let edgeCol = '';
function paintEdges() {
  const th = run && (THEMES[run.world.level.theme] || THEMES.day);
  const col = !run ? '#3f6a24' : !$('pad').classList.contains('hidden') ? '#2e1c12' : th.dirt[1];
  if (col !== edgeCol) { edgeCol = col; document.documentElement.style.backgroundColor = col; document.body.style.backgroundColor = col; }
}

// Behind the title and every menu: the menu world (src/scene.js), a living landscape, not a level.
const scene = new Scene();
function drawMenuScene(dt) {
  const kk = Math.max(1, Math.round(R.devH / 190)), W = Math.ceil(R.devW / kk), H = Math.ceil(R.devH / kk);
  if (R.lo.width !== W || R.lo.height !== H) { R.lo.width = W; R.lo.height = H; R.l.imageSmoothingEnabled = false; }
  R.wide = 'scene';   // the game sets its own zoom again when a round starts
  scene.draw(R.l, W, H, dt, R.lite);
}

// ---------- staying up to date. A home-screen app is often resumed from memory instead of reloaded, so it could run
// an old version for days. When the app comes back to the front (or a new version takes over), it compares the
// version it booted with against the server's and reloads itself if it's behind, but never in the middle of a round.
let bootVersion = null, wantReload = false;
const serverVersion = () => fetch('sw.js', { cache: 'no-store' }).then(r => r.text()).then(t => (/VERSION = '([^']+)'/.exec(t) || [])[1] || null).catch(() => null);
serverVersion().then(v => { bootVersion = v; const el = $('appVersion'); if (el && v) el.textContent = v.replace('trap-dash-', ''); });
const reloadWhenIdle = () => { if (!run || run.phase === 'end') location.reload(); else wantReload = true; };
async function checkForUpdate() {
  if (!bootVersion || (location.protocol !== 'https:' && location.hostname !== 'localhost')) return;
  const v = await serverVersion();
  if (v && v !== bootVersion) reloadWhenIdle();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkForUpdate(); navigator.serviceWorker?.getRegistration().then(r => r && r.update()).catch(() => {}); } });
setInterval(() => { if (!document.hidden) checkForUpdate(); }, 5 * 60 * 1000);
if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', reloadWhenIdle);
setInterval(() => { if (wantReload && (!run || run.phase === 'end')) location.reload(); }, 2000);

// the long title entrance plays once, on launch; after that, coming back to the title is quick
setTimeout(() => $('title').classList.remove('intro'), 3300);

// ---------- boot
R.resize(); addEventListener('resize', () => updateInsets());
buildTitle();
const q = new URLSearchParams(location.search);
const session = store.get('session', null);
if (q.get('join')) { $('code').value = cleanCode(q.get('join')); show('join'); }
else if (session && Date.now() - session.t < 5 * 60 * 1000) {   // the app was closed mid-party: go straight back in
  rejoinParty(session, true);
}
else show('title');
requestAnimationFrame(frame);
window.__td = { scene, get run() { return run; }, get mode() { return mode; }, get players() { return players; }, get score() { return score; }, nav, startRun, fireTrap, R };

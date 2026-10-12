// Screens, the party flow and the game loop.
// A match is played level by level: each player gets one run as the runner while the other works the traps,
// then the faster runner wins the level. Online, the runner's device runs the world and streams it to the trapper.
import { DT, TIME_LIMIT, TILE, TRAPS, GADGETS, PHYS } from './config.js';
import { CHARS, charOf, charFrame, SPR } from './sprites.js';
import { World } from './sim.js';
import { LEVELS, THEMES } from './levels.js';
import { Renderer } from './render.js';
import { Net, cleanCode } from './net.js';
import { Bot } from './bot.js';
import { rateLevel } from './rating.js';
import { generate } from './gen.js';
const levelOf = ref => (typeof ref === 'number' ? LEVELS[ref] : ref);   // a level index, or a generated level object
const STARS = new Map();   // level id -> 1..3
const starsOf = L => { if (L.stars) return L.stars; if (!STARS.has(L.id)) STARS.set(L.id, rateLevel(L).stars); return STARS.get(L.id); };
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
import { sfx, playEvent, unlockAudio, audio, setMuted, setMusic, startMusic, stopMusic } from './audio.js';

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
// The logo letters bob in a wave, and your runner runs along beside it.
(function dressTitle() {
  const logo = document.querySelector('.logo');
  let n = 0;
  for (const word of logo.querySelectorAll('span')) word.innerHTML = [...word.textContent].map(ch => `<i style="--i:${n++}">${ch}</i>`).join('');
  const run = document.createElement('canvas'); run.width = 16; run.height = 18; run.className = 'pix logoRun'; run.id = 'logoRun';
  logo.appendChild(run);
  const ICONS = { host: 'flag', join: 'blink', local: 'decoy', practice: 'shield' };
  for (const [go, icon] of Object.entries(ICONS)) {
    const b = document.querySelector(`#title [data-go="${go}"]`), c = document.createElement('canvas');
    c.width = c.height = 7; c.className = 'pix bicon'; c.getContext('2d').drawImage(SPR.icon[icon], 0, 0); b.prepend(c);
  }
})();
let titleAnimT = 0;
function animateTitle(dt) {
  if ($('title').classList.contains('hidden')) return;
  titleAnimT += dt;
  const f = ['run0', 'run1', 'run2', 'run1'][Math.floor(titleAnimT * 10) % 4];
  const c = $('logoRun'), x = c.getContext('2d'); x.clearRect(0, 0, 16, 18); x.drawImage(charFrame(charOf(me.char), f, 1, 0), 2, 1);
  const on = document.querySelector('.swatch.on canvas');
  if (on) { const y = on.getContext('2d'); y.clearRect(0, 0, 16, 18); y.drawImage(charFrame(charOf(me.char), f, 1, 0), 2, 1); }
}
// On iPhone Safari the browser keeps a strip at the bottom; the home-screen app is true full screen.
if (/iP(hone|od)/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches)
  setTimeout(() => toast('Tip: Share → Add to Home Screen plays in full screen'), 1500);

function buildTitle() {
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
  $('soundBtn').textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
  $('musicBtn').textContent = 'Music: ' + (audio.music ? 'on' : 'off');
}
$('soundBtn').onclick = () => { setMuted(!audio.muted); buildTitle(); };
$('musicBtn').onclick = () => { setMusic(!audio.music); if (audio.music) startMusic(); buildTitle(); };
$('howBtn').onclick = () => panel(`
  <h2>How to play</h2>
  <ul class="help">
    <li><b>The runner</b> dashes from the start to the checkered flag. Move with <b>← →</b> or <b>A D</b>, jump with <b>Space</b>, <b>W</b> or <b>↑</b> (hold for higher). On a phone, use the buttons.</li>
    <li><b>The trapper</b> uses the trap bar (or keys 1-6) to fire the nearest trap of each kind: spikes, trapdoors, walls, cannons, arrows, crushers, flames, fans, saws, lasers, bombs, conveyor belts and ice.</li>
    <li>Every trap has a <b>cooldown</b> (the dial fills up), and traps can't be fired back to back. The runner sees the dials too, so dash while they're recharging!</li>
    <li><b>Gadgets</b> never kill on their own. There are 12 for each side (lightning, glue, mines, bats, fog, frost, an anvil, rewind… and dash, shield, blink, glider, slow-mo, decoy, phase…), but <b>each map deals 4 to each player</b>, picked to suit its traps and layout. Small numbers show how many uses are left this run.</li>
    <li>Then you <b>swap</b>. Whoever reaches the flag faster wins the level. Dying sends you back to the last flag, so it costs time.</li>
    <li>Levels have ★ to ★★★ difficulty. 🎲 builds a random level of the difficulty you pick.</li>
    <li><b>∞ Endless</b>: stage after stage of new levels, no clock. Swap sides whenever you like from the <b>II</b> menu.</li>
  </ul>
  <div class="buttons"><button class="big pink" data-close>Got it</button></div>`);

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

net.onMessage = m => {
  if (m.t === 'hi' && isHost) {
    const char = charOf(m.char).id === players.a.char ? otherChar(players.a.char) : charOf(m.char).id;
    players.b = { name: String(m.name || 'Friend').slice(0, 12), char };
    score = { a: 0, b: 0 }; runs = [];
    syncLobby(); if (!run) openLobby();
    toast(players.b.name + ' joined!');
  } else if (m.t === 'lobby' && !isHost) {
    players = m.players; lobby = m.lobby; score = m.score;
    if (!run) openLobby();
  } else if (m.t === 'full') {
    toast('That party is already full.'); nav('title');
  } else if (m.t === 'start' && !isHost) {
    lobby.level = m.level; runs = m.n === 1 ? [] : runs;
    startRun(m.level, m.runner, m.n);
  } else if (m.t === 'stage') {          // endless: the next stage (from the runner) or a fresh run after a swap (from the host)
    lobby.level = m.level; startRun(m.level, m.runner, 0, m.endless);
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
net.onLost = () => friendLeft();

function friendLeft() {
  if (mode !== 'online') return;
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
  if (mode === 'online') net.close();
  mode = null; players = { a: null, b: null }; endRunView();
}

function syncLobby() { if (mode === 'online' && isHost) net.send({ t: 'lobby', players, lobby, score }); }

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
  // Random levels: pick a difficulty, the host's device builds one and shares it.
  const rr = $('randRow'); rr.innerHTML = '';
  const cur = typeof lobby.level === 'object' ? lobby.level : null;
  const lab = document.createElement('span');
  lab.innerHTML = cur ? `🎲 <b>${esc(cur.name)}</b> <span class="stars">${starText(cur.stars)}</span>` : '🎲 Random level:';
  rr.appendChild(lab);
  for (const n of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'chip' + (cur && cur.stars === n ? ' on' : ''); b.textContent = starText(n);
    b.title = ['Easy', 'Medium', 'Hard'][n - 1] + ' random level';
    b.disabled = online && !isHost;
    b.onclick = () => { sfx.click(); lobby.level = randomLevel(n); syncLobby(); openLobby(); };
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

$('startBtn').onclick = () => { unlockAudio(); sfx.click(); runs = []; hostStart(lobby.level, mode === 'practice' ? 'a' : lobby.first, 1); };
$('leaveBtn').onclick = () => { sfx.click(); nav('title'); };
$('shareBtn').onclick = async () => {
  const url = `${location.origin}${location.pathname}?join=${roomCode}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Trap Dash', text: `Join my Trap Dash party! Code ${roomCode}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied!'); }
  } catch { /* cancelled */ }
};

function randomLevel(stars) { return generate((Math.random() * 1e9) >>> 0, stars); }
const nextOf = ref => (typeof ref === 'number' ? (ref + 1) % LEVELS.length : randomLevel(ref.stars));

// ---------- endless: generated stages one after another, totals carry over
const endlessLevel = e => ({ ...randomLevel(e.stars), name: `Stage ${e.stage}` });
function startEndless(stars, runner) {
  const e = { stars, stage: 1, total: 0, deaths: 0 }, level = endlessLevel(e);
  if (mode === 'online') net.send({ t: 'stage', level, runner, endless: e });
  lobby.level = level; startRun(level, runner, 0, e);
}
function nextStage() {   // only on the runner's device, which owns the simulation
  const e = run.endless, w = run.world;
  const ne = { ...e, stage: e.stage + 1, total: e.total + w.time, deaths: e.deaths + w.player.deaths };
  const level = endlessLevel(ne);
  if (mode === 'online') net.send({ t: 'stage', level, runner: run.runner, endless: ne });
  startRun(level, run.runner, 0, ne);
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
    if (d >= 1 && d <= 6 && run.kinds[d - 1]) fireKind(run.kinds[d - 1], e.code);
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
const touchLooks = () => { for (const k in TOUCH_BTN) $(TOUCH_BTN[k]).classList.toggle('down', touchHeld[k].size > 0); };
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
// Sliding a thumb from ◀ to ▶ should switch direction without lifting.
$('arrows').addEventListener('pointermove', e => {
  if (!touchHeld.left.has(e.pointerId) && !touchHeld.right.has(e.pointerId)) return;
  const r = $('tRight').getBoundingClientRect(), onRight = e.clientX >= r.left - 7;
  const to = onRight ? 'right' : 'left', from = onRight ? 'left' : 'right';
  if (touchHeld[from].delete(e.pointerId)) { touchHeld[to].add(e.pointerId); touchLooks(); }
});
function readInput() {
  input.left = keys.has('ArrowLeft') || keys.has('KeyA') || touchHeld.left.size > 0;
  input.right = keys.has('ArrowRight') || keys.has('KeyD') || touchHeld.right.size > 0;
  input.jump = JUMP_KEYS.some(k => keys.has(k)) || touchHeld.jump.size > 0;
}

// Trapper: click / tap a trap.
function trapAt(cx, cy) {
  if (!run) return -1;
  const w = R.toWorld(cx, cy);
  let best = -1, bd = 1e9;
  for (const t of run.world.traps) {
    const b = R.trapButton(run.world, t), d = Math.hypot(b.x - w.x, b.y - w.y);
    const inRect = w.x > t.x0 * 16 - 4 && w.x < (t.x1 + 1) * 16 + 4 && w.y > t.y * 16 - 6 + (t.kind === 'crusher' ? t.oy : 0) && w.y < (t.y + 1) * 16 + 6 + (t.kind === 'crusher' ? t.oy : 0);
    if ((d < b.r + 9 || inRect) && d < bd) { bd = d; best = t.id; }
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

// holdKey: what will let go of it (a pointer id or a key code). Traps that burn while held (the flame) stop on release.
function fireTrap(id, holdKey) {
  const w = run.world, t = w.traps[id];
  const ready = t.state === 'idle' && t.cd <= 0 && w.lock <= 0 && !(run.pending[id] > 0);
  if (!ready) { sfx.denied(); return; }
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

// ---------- the trap bar: one fixed button per kind of trap, aimed at the runner
// Each button fires the trap of its kind that is on screen and closest to the runner (preferring traps ahead).
const KIND_ORDER = ['spikes', 'trapdoor', 'wall', 'ice', 'conveyor', 'cannon', 'arrows', 'dropper', 'laser', 'saw', 'crusher', 'flame', 'fan'];
function pickTarget(world, kind) {
  const p = world.player, px = p.x + 5, py = p.y + 6, W = R.lo.width, H = R.lo.height;
  let best = null, bestReady = null, bs = 1e9, brs = 1e9;
  for (const t of world.traps) {
    if (t.kind !== kind) continue;
    const tx = (t.x0 + t.x1 + 1) * TILE / 2, ty = t.y * TILE + 8;
    if (tx < R.camX - 24 || tx > R.camX + W + 24 || ty < R.camY - 40 || ty > R.camY + H + 40) continue;
    const dx = tx - px;
    let score = Math.abs(dx) + Math.abs(ty - py) * 0.6;
    if (dx * (p.face || 1) < -28) score += 300;           // behind the runner: rarely useful
    if (score < bs) { bs = score; best = t; }
    const ready = t.state === 'idle' && t.cd <= 0;
    if (ready && score < brs) { brs = score; bestReady = t; }
  }
  return bestReady || best;
}
function fireKind(kind, holdKey) {
  const t = run.targets[kind];
  if (!t || run.phase !== 'play') { sfx.denied(); return; }
  fireTrap(t.id, holdKey);
}
function buildTrapBar() {
  const bar = $('trapbar'); bar.innerHTML = '';
  run.kinds = KIND_ORDER.filter(k => run.world.traps.some(t => t.kind === k));
  run.targets = {};
  run.kinds.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = 'tbtn'; b.dataset.kind = k;
    const ic = document.createElement('canvas'); ic.width = ic.height = 7; ic.className = 'pix';
    ic.getContext('2d').drawImage(SPR.icon[k], 0, 0);
    b.innerHTML = `<i class="eta"></i><span class="cool"></span><span class="secs"></span>`;
    b.prepend(ic);
    const lab = document.createElement('small'); lab.textContent = (touchDevice || i > 5 ? '' : (i + 1) + ' ') + TRAPS[k].name; b.appendChild(lab);
    b.addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); if (run) fireKind(k, 'p' + e.pointerId); });
    bar.appendChild(b);
  });
  bar.classList.toggle('hidden', !run.trapperHere);
}
function updateTrapBar() {
  const w = run.world;
  for (const b of $('trapbar').children) {
    const k = b.dataset.kind, t = pickTarget(w, k), C = TRAPS[k];
    run.targets[k] = t;
    const ready = t && t.state === 'idle' && t.cd <= 0, pend = t && run.pending[t.id] > 0;
    const burning = t && TRAPS[k].hold && t.state === 'active';
    const eta = etaOf(w, k);
    const state = !t ? (eta != null ? 'soon' : 'none') : w.jam > 0 ? 'jam' : burning ? 'burn' : pend ? 'sent' : ready ? (w.lock > 0 ? 'lock' : 'ready') : 'cool';
    if (b.dataset.state !== state) b.dataset.state = state;
    b.style.setProperty('--cd', burning ? Math.min(1, t.t / C.tank).toFixed(3) : t && !ready && t.state === 'idle' ? Math.min(1, t.cd / C.cd).toFixed(3) : 0);
    const secs = t && !ready && t.state === 'idle' && t.cd > 0 ? Math.ceil(t.cd) : '';
    if (b.lastChild.previousSibling.textContent != secs) b.lastChild.previousSibling.textContent = secs;
    const etaText = eta == null ? '' : eta < 0.5 ? 'now' : `in ${Math.ceil(eta)}s`, el = b.querySelector('.eta');
    if (el.textContent !== etaText) el.textContent = etaText;
  }
}
// Seconds until the runner reaches the next trap of this kind ahead (toward the flag), or null if none is near.
function etaOf(w, kind) {
  const p = w.player, px = p.x + 5, dir = Math.sign(w.goal.x - px) || 1;
  let best = null;
  for (const t of w.traps) {
    if (t.kind !== kind) continue;
    const ahead = ((t.x0 + t.x1 + 1) * TILE / 2 - px) * dir;
    if (ahead < -TILE * 2 || ahead > TILE * 60) continue;
    const s = Math.max(0, ahead) / PHYS.maxRun;
    if (best == null || s < best) best = s;
  }
  return best;
}

// ---------- gadgets: the trapper's (left column) and the runner's (above the jump button / bottom left on PC)
// Each map hands out its own small set (see loadout.js). Keys go by slot: trapper 7 8 9 0, runner Shift Q E R.
const T_KEYS = ['7', '8', '9', '0'], R_KEYS = ['Shift', 'Q', 'E', 'R'];
const runnerKeyed = () => run.world.loadout.runner.filter(id => !GADGETS.runner[id].passive);
const keyOf = (side, id) => side === 'trapper' ? T_KEYS[run.world.loadout.trapper.indexOf(id)] : R_KEYS[runnerKeyed().indexOf(id)];
function gadgetButton(id, side, onPress) {
  const b = document.createElement('button');
  b.className = 'gbtn ' + side; b.dataset.id = id;
  const ic = document.createElement('canvas'); ic.width = ic.height = 7; ic.className = 'pix';
  ic.getContext('2d').drawImage(SPR.icon[id], 0, 0);
  b.innerHTML = '<span class="cool"></span><span class="secs"></span><i class="badge"></i>';
  b.prepend(ic);
  const lab = document.createElement('small');
  const key = keyOf(side, id);
  lab.textContent = (touchDevice || !key ? '' : key + ' ') + GADGETS[side][id].name;
  b.appendChild(lab);
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
  for (const [bar, side] of [['gadbar', 'trapper'], ['rgad', 'runner']]) for (const b of $(bar).children) {
    const id = b.dataset.id, g = w.gad[side][id], def = GADGETS[side][id];
    const state = g.n === 0 ? 'none' : side === 'trapper' && w.jam > 0 ? 'jam' : run.aim && run.aim.id === id ? 'aim' : g.cd > 0 ? 'cool' : def.passive ? 'passive' : 'ready';
    if (b.dataset.state !== state) b.dataset.state = state;
    b.style.setProperty('--cd', g.cd > 0 && def.cd ? Math.min(1, g.cd / def.cd).toFixed(3) : 0);
    const secs = g.cd > 0 && g.n !== 0 ? Math.ceil(g.cd) : '', badge = g.n < 0 ? '' : g.n;
    const [cool, secsEl, badgeEl] = b.querySelectorAll('.cool, .secs, .badge');
    if (secsEl.textContent != secs) secsEl.textContent = secs;
    if (badgeEl.textContent != badge) badgeEl.textContent = badge;
  }
}
function useTrapperGadget(id, at) {
  const w = run.world, def = GADGETS.trapper[id], g = w.gad.trapper[id];
  if (run.phase !== 'play' || g.n === 0 || g.cd > 0 || w.jam > 0) { sfx.denied(); return; }
  if (def.aim && !at) {   // pick a spot: the next tap / click on the map
    if (run.aim && run.aim.id === id) { run.aim = null; return; }
    run.aim = { id, x: w.player.x + 40 * (w.player.face || 1), y: w.player.y };
    $('hint').textContent = touchDevice ? `Tap where the ${def.name.toLowerCase()} should go` : `Click where the ${def.name.toLowerCase()} should go`;
    $('hint').classList.remove('hidden'); run.hintT = 2.5; sfx.click();
    return;
  }
  run.aim = null;
  const x = at ? Math.round(at.x) : 0, y = at ? Math.round(at.y) : 0;
  if (run.simOwner) { if (!w.useGadget('trapper', id, x, y)) sfx.denied(); }
  else { net.send({ t: 'gad', id, x, y, lead: net.lag }); g.cd = def.cd; if (g.n > 0) g.n--; sfx.click(); }
}
const gadNames = side => run.world.loadout[side].map(id => GADGETS[side][id].name.toLowerCase()).join(', ');
function useRunnerGadget(id) {
  if (!run.runnerHere || run.phase !== 'play') return;
  if (!run.world.useGadget('runner', id)) sfx.denied();
}

// ---------- where the controls go. The bottom panel holds whoever plays on this device; on a shared touch screen
// the trapper gets a panel at the top. The game view is whatever space is left, so nothing covers it.
function layoutControls() {
  const parts = $('parts');
  for (const id of ['arrows', 'tJump', 'trapbar', 'gadbar', 'rgad']) parts.appendChild($(id));
  for (const id of ['padL', 'padM', 'padR', 'padTL', 'padTM', 'padTR']) $(id).innerHTML = '';
  const bottom = { L: [], M: [], R: [] }, top = { L: [], M: [], R: [] };
  if (run.runnerHere && touchDevice) { bottom.L.push('arrows'); bottom.M.push('rgad'); bottom.R.push('tJump'); }
  else if (run.runnerHere) bottom.L.push('rgad');
  if (run.trapperHere) {
    const where = run.runnerHere && touchDevice ? top : bottom;
    where.M.push('trapbar'); where.R.push('gadbar');
  }
  const fill = (spec, prefix) => { let any = false; for (const k of ['L', 'M', 'R']) for (const id of spec[k]) { $(prefix + k).appendChild($(id)); any = true; } return any; };
  const hasBottom = fill(bottom, 'pad'), hasTop = fill(top, 'padT');
  $('pad').classList.toggle('hidden', !hasBottom);
  $('padTop').classList.toggle('hidden', !hasTop);
  document.body.classList.add('playing');
  document.body.classList.toggle('dualpad', hasTop);
  document.body.classList.toggle('nopad', !hasBottom);
  R.resize();
}

// ---------- a run
function startRun(level, runner, n, endless = null) {
  forgetTyping();
  hidePanel();
  show(null);
  const world = new World(levelOf(level));
  const online = mode === 'online';
  const runnerHere = !online || runner === mySide();
  run = {
    level, runner, n, world, phase: 'count', countT: 3.2, lastCount: 4, acc: 0, steps: 0, outbox: [], snaps: [], pending: {}, hover: -1,
    runnerHere, trapperHere: mode === 'local' || (online && !runnerHere), simOwner: runnerHere, held: new Map(),
    bot: mode === 'practice' ? new Bot(0.35) : null, colors: charOf(players[runner].char), paused: false, endT: 0, hintT: 5, endless,
  };
  if (endless && endless.stage > 1) { run.countT = 1; run.hintT = 0; }
  R.parts = []; R.follow(world, 0, run.trapperHere && !runnerHere, true);
  $('hud').classList.remove('hidden');
  const role = $('role');
  if (mode === 'local') { role.textContent = 'RUN'; role.className = 'role'; $('who').textContent = `${players[runner].name}  ·  traps: ${players[other(runner)].name}`; }
  else if (mode === 'practice') { role.textContent = 'RUN'; role.className = 'role'; $('who').textContent = levelOf(level).name; }
  else { role.textContent = runnerHere ? 'RUN' : 'TRAP'; role.className = 'role' + (runnerHere ? '' : ' trap'); $('who').textContent = runnerHere ? `${players[other(runner)].name} has the traps` : `${players[runner].name} is running`; }
  if (endless) $('who').textContent = `∞ ${starText(endless.stars)} · Stage ${endless.stage}` + (mode === 'online' ? (runnerHere ? '' : ` · ${players[runner].name} runs`) : mode === 'local' ? ` · ${players[runner].name} runs` : '');
  buildTrapBar();
  buildGadgets();
  layoutControls();
  const hint = mode === 'local' ? `${players[runner].name} runs (${touchDevice ? 'buttons' : 'arrows + Space'}), ${players[other(runner)].name} uses the trap bar${touchDevice ? '' : ' (1-6, gadgets 7-0)'}`
    : runnerHere ? (touchDevice ? `Reach the flag! Your gadgets: ${gadNames('runner')}.` : `Reach the flag! ← → run, Space jump. ${runnerKeyed().map((id, i) => R_KEYS[i] + ' ' + GADGETS.runner[id].name.toLowerCase()).join(', ')}.`)
      : (touchDevice ? `Red buttons fire the nearest trap (hold for the flame). Your gadgets: ${gadNames('trapper')}.` : `Keys 1-6 fire traps, 7-0 gadgets (${gadNames('trapper')}), aimed at your mouse.`);
  $('hint').textContent = (endless ? 'Endless: no clock, new stage at every flag. Swap sides from the II menu. ' : '') + hint + (touchDevice && innerHeight > innerWidth ? ' (Tip: turn your phone sideways for a wider view.)' : ''); $('hint').classList.remove('hidden');
  input.jumpQueued = false;
  startMusic();
}

function receiveSnap(m) {
  const w = run.world;
  if (run.phase === 'count' && m.tm > 0) { run.phase = 'play'; run.countT = 0; $('count').classList.add('hidden'); }
  w.applySnap(m);
  run.snaps.push({ at: performance.now(), x: m.p[0], y: m.p[1], dead: !!(m.p[5] & 2) });
  if (run.snaps.length > 12) run.snaps.shift();
  for (const e of m.ev) { R.onEvent(e, run.colors); playEvent(e); }
  for (const id in run.pending) if (w.traps[id].state !== 'idle' || w.traps[id].cd > 0) run.pending[id] = 0;
}

function finishRun(res) {
  if (run.phase === 'end') return;
  run.phase = 'end';
  if (mode === 'online' && run.simOwner) net.send({ t: 'done', res });
  runs.push(res);
  for (const id of ['hint', 'pad', 'padTop']) $(id).classList.add('hidden');
  run.aim = null;
  setTimeout(() => showRunResult(res), res.finished ? 300 : 0);
}

function resultOf(world, runner) {
  const p = world.player, span = Math.max(1, world.goal.x - world.start.x);
  return { runner, time: Math.round(world.time * 10) / 10, deaths: p.deaths, finished: p.finished,
    progress: p.finished ? 100 : Math.max(0, Math.min(99, Math.round((p.best - world.start.x) / span * 100))) };
}
const fmt = r => r.finished ? `${r.time.toFixed(1)}s` : `${r.progress}%`;
function line(r, win) {
  const p = players[r.runner];
  return `<div class="line${win ? ' win' : ''}" data-portrait="${p.char}"><div><b>${esc(p.name)}${win ? ' 👑' : ''}</b><small>${r.finished ? 'reached the flag' : 'ran out of time'} · ${r.deaths} ${r.deaths === 1 ? 'fall' : 'falls'}</small></div><span class="t">${fmt(r)}</span></div>`;
}
const better = (x, y) => x.finished !== y.finished ? x.finished : x.finished ? x.time < y.time : x.progress > y.progress;

function showRunResult(res) {
  if (!run) return;
  const name = players[res.runner].name, L = levelOf(run.level);
  const controls = mode !== 'online' || isHost;
  if (mode === 'practice') {
    const best = store.get('best', {}), prev = L.random ? null : best[L.id];
    const record = res.finished && (!prev || res.time < prev);
    if (record && !L.random) { best[L.id] = res.time; store.set('best', best); }
    panel(`<div class="big-emoji">${res.finished ? '🏁' : '⏰'}</div><h2>${res.finished ? 'You made it!' : 'Out of time'}</h2>
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
    panel(`<div class="big-emoji">${res.finished ? '🏁' : '⏰'}</div><h2>${esc(name)} ${res.finished ? 'made it!' : 'ran out of time'}</h2>
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
  const nextLevel = controls ? nextOf(run.level) : null;
  panel(`<div class="big-emoji">${tie ? '🤝' : '🏆'}</div><h2>${tie ? "It's a tie!" : esc(players[win.runner].name) + ' wins ' + esc(L.name) + '!'}</h2>
    <div class="result">${[r1, r2].map(r => line(r, r === win)).join('')}</div>
    <p>Score: ${esc(players.a.name)} <b>${score.a}</b> – <b>${score.b}</b> ${esc(players.b.name)}</p>
    <div class="buttons">${controls ? `<button class="big pink" id="nextLv">Next: ${esc(nextLevel.name || levelOf(nextLevel).name)}</button>
      <div class="row"><button class="mid" id="again">Rematch</button><button class="mid" id="toLobby">Lobby</button></div>` : `<p class="status">Waiting for the host…</p>`}</div>`);
  if (!controls) return;
  const firstNext = other(r1.runner);   // whoever ran second this time runs first next time
  $('nextLv').onclick = () => { sfx.click(); lobby.level = nextLevel; lobby.first = firstNext; runs = []; syncLobby(); hostStart(nextLevel, firstNext, 1); };
  $('again').onclick = () => { sfx.click(); lobby.first = firstNext; runs = []; syncLobby(); hostStart(run.level, firstNext, 1); };
  $('toLobby').onclick = () => { sfx.click(); if (mode === 'online') net.send({ t: 'toLobby' }); endRunView(); syncLobby(); openLobby(); };
}

function endRunView() {
  run = null; hidePanel();
  for (const id of ['hud', 'hint', 'count', 'rotate', 'pad', 'padTop']) $(id).classList.add('hidden');
  document.body.classList.remove('playing', 'dualpad');
}

function panel(html) {
  $('panelCard').innerHTML = html; $('panel').classList.remove('hidden');
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
    <div class="row"><button class="chip" id="pSound">Sound: ${audio.muted ? 'off' : 'on'}</button><button class="chip" id="pMusic">Music: ${audio.music ? 'on' : 'off'}</button></div></div>`);
  $('resume').onclick = () => { sfx.click(); hidePanel(); if (run) run.paused = false; };
  if ($('swapBtn')) $('swapBtn').onclick = () => { sfx.click(); swapSides(); };
  if ($('endBtn')) $('endBtn').onclick = () => { sfx.click(); if (online) net.send({ t: 'toLobby' }); endRunView(); syncLobby(); openLobby(); };
  $('quitRun').onclick = () => { sfx.click(); if (online) nav('title'); else { endRunView(); openLobby(); } };
  $('pSound').onclick = () => { setMuted(!audio.muted); togglePause(); togglePause(); };
  $('pMusic').onclick = () => { setMusic(!audio.music); if (audio.music) startMusic(); togglePause(); togglePause(); };
}
$('pauseBtn').onclick = () => { sfx.click(); togglePause(); };

// ---------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // rAF time can trail performance.now() on the first frame
  try { tick(dt, now); } catch (e) { console.error(e); showError(e); }
}
function showError(e) { if (DEBUG) toast('Error: ' + e.message); }

function tick(dt, now) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  if (canvas.width !== Math.round(canvas.clientWidth * dpr) || canvas.height !== Math.round(canvas.clientHeight * dpr)) R.resize();
  paintEdges();
  if (!run) { drawAttract(dt); animateTitle(dt); return; }
  const w = run.world;
  readInput();
  // countdown (both devices count on their own; the trapper also switches to 'play' when the first moving snapshot lands)
  if (run.phase === 'count' && !run.paused) {
    run.countT -= dt;
    const n = Math.ceil(run.countT);
    if (n !== run.lastCount && n <= 3) {
      run.lastCount = n; const c = $('count'); c.classList.remove('hidden'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
      c.textContent = n > 0 ? n : 'GO!'; (n > 0 ? sfx.count : sfx.go)();
    }
    if (run.countT <= 0) { run.phase = 'play'; input.jumpQueued = false; setTimeout(() => $('count').classList.add('hidden'), 450); }
  }
  run.hintT -= dt; if (run.hintT <= 0) $('hint').classList.add('hidden');
  for (const id in run.pending) run.pending[id] -= dt;

  if (run.simOwner && !run.paused && run.phase !== 'end') {
    run.acc += dt;
    while (run.acc >= DT) {
      run.acc -= DT;
      if (run.phase === 'play') {
        w.step(DT, { left: input.left, right: input.right, jump: input.jump, jumpPressed: input.jumpQueued });
        input.jumpQueued = false;
        if (run.bot) run.bot.think(w, DT);
      }
      for (const e of w.events) { R.onEvent(e, run.colors); playEvent(e); if (mode === 'online') run.outbox.push(e); }
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
  }
  R.follow(w, dt, run.trapperHere && !run.runnerHere);
  updateGadgets();
  if (run.trapperHere) updateTrapBar();
  R.draw(w, { dt, colors: run.colors, trapper: run.trapperHere, hover: run.hover, pending: run.pending, aim: run.aim, targets: run.trapperHere ? run.targets : null, kinds: run.kinds, runnerView: run.runnerHere, debug: DEBUG });
  const left = run.endless ? 1e9 : TIME_LIMIT - w.time, E = run.endless;
  $('timer').textContent = (E ? E.total + w.time : w.time).toFixed(1); $('timer').classList.toggle('low', left < 15);
  $('deaths').textContent = (E ? E.deaths : 0) + w.player.deaths;
}

// Safari tints the strip it keeps at the bottom of the screen with the page background: match what's at the bottom.
let edgeCol = '';
function paintEdges() {
  const th = THEMES[(run ? run.world : attract ? attract.world : { level: LEVELS[0] }).level.theme] || THEMES.day;
  const col = run && !$('pad').classList.contains('hidden') ? '#241a30' : th.dirt[1];
  if (col !== edgeCol) { edgeCol = col; document.documentElement.style.backgroundColor = col; document.body.style.backgroundColor = col; }
}

// Behind the menus: a little demo of the first level with the bot.
let attract = null;
function drawAttract(dt) {
  if (!attract) attract = { world: new World(LEVELS[0]), bot: new Bot(0.3), t: 0, acc: 0 };
  const a = attract, w = a.world;
  a.acc += dt;
  while (a.acc >= DT) {
    a.acc -= DT; a.t += DT;
    const p = w.player;
    const blocked = w.solidAt(Math.floor((p.x + 14) / 16), Math.floor((p.y + 6) / 16)) || !w.solidAt(Math.floor((p.x + 20) / 16), Math.floor((p.y + 20) / 16));
    w.step(DT, { right: true, jump: true, jumpPressed: blocked && p.onGround });
    a.bot.think(w, DT);
    for (const e of w.events) R.onEvent(e, charOf(me.char));
    w.events.length = 0;
    if (p.finished || a.t > 40) { attract = null; return; }
  }
  R.follow(w, dt, false);
  R.draw(w, { dt, colors: charOf(me.char), trapper: false });
}

// ---------- boot
R.resize(); addEventListener('resize', () => R.resize());
buildTitle();
const q = new URLSearchParams(location.search);
if (q.get('join')) { $('code').value = cleanCode(q.get('join')); show('join'); }
else show('title');
requestAnimationFrame(frame);
window.__td = { get run() { return run; }, get mode() { return mode; }, get players() { return players; }, get score() { return score; }, nav, startRun, fireTrap, R };

// Training Grounds: a guided level for each role. The runner gets a coach that fires traps on cue;
// the trapper gets a Coach Bot that runs the course and pauses before each trap so there's time to practise.
import { TILE, PHYS } from './config.js';

const H = 18, W = 90;
function map() {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => { g[y][x] = c; }, rect = (x0, y0, x1, y1, c = '#') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const ground = (a, b, t) => rect(a, t, b, H - 1);
  rect(0, 0, 0, H - 1); rect(W - 1, 0, W - 1, H - 1);
  ground(1, 10, 14); set(3, 13, 'S');
  ground(11, 14, 14); set(12, 13, '#'); ground(17, 24, 14); set(21, 13, 'C');
  ground(25, 34, 14); rect(27, 13, 29, 13, 'P');
  ground(40, 48, 14); set(42, 13, 'C'); set(46, 14, 'F');
  ground(49, 88, 14); set(82, 13, 'G'); set(87, 13, '<');
  return g.map(r => r.join(''));
}
export const TRAINING = { id: 'training', name: 'Training Grounds', theme: 'day', map: map(),
  loadout: { runner: ['dash', 'feather', 'shield', 'jam'], trapper: ['glue', 'bolt', 'gust', 'hex'] } };

const tx = x => x * TILE;
export class Tutorial {
  constructor(role, touch, keyOf) {
    this.role = role; this.touch = touch; this.keyOf = keyOf; this.step = 0; this.t = 0; this.catches = 0; this.wait = 0; this.waited = {}; this.text = '';
  }
  say(text) { this.text = text; }
  // runner training: hints by position, and a coach that fires the traps
  runner(w, dt) {
    const p = w.player, T = this.touch, x = p.x;
    const spikes = w.traps.find(t => t.kind === 'spikes'), cannon = w.traps.find(t => t.kind === 'cannon');
    if (this.step === 0) { this.say(T ? 'Welcome to training! Hold ▶ to run.' : 'Welcome to training! Run right with → (or D).'); if (x > tx(9)) this.step++; }
    if (this.step === 1) { this.say(T ? 'Tap JUMP to jump over the block and the gap. Hold it to jump higher.' : 'Press Space to jump over the block and the gap. Hold it to jump higher.'); if (x > tx(18)) this.step++; }
    if (this.step === 2) { this.say('That flag is a checkpoint: if you fall, you come back to the last one.'); if (x > tx(23)) this.step++; }
    if (this.step === 3) {
      if (spikes.state === 'idle' && spikes.cd <= 0 && x > tx(24.5) && x < tx(27)) { w.lock = 0; w.trigger(spikes.id); this.fired = true; }
      this.say(this.fired && spikes.cd > 0 ? 'Now! The spikes are recharging (see the dial) — GO!' : 'Spikes! Your friend fires them when you come close. Walk up, let them fire, then cross while they recharge.');
      if (x > tx(34)) this.step++;
    }
    if (this.step === 4) { this.say(T ? 'A wide gap: jump, then tap JUMP again in the air (air jump)!' : 'A wide gap: jump, then press Space again in the air (air jump)!'); if (x > tx(41) && p.onGround) this.step++; }
    if (this.step === 5) { this.say(T ? 'Your gadgets are next to JUMP. Try Dash and Shield!' : 'Gadgets: Shift dashes, E shields you. Try them!'); if (x > tx(60)) this.step++; }
    if (this.step === 6) {
      if (cannon.state === 'idle' && cannon.cd <= 0 && x > tx(64)) { w.lock = 0; w.trigger(cannon.id); }
      this.say('Cannonballs! Jump over them and reach the checkered flag.');
    }
  }
  // trapper training: the bot runner, and hints
  trapper(w, dt, caught) {
    const p = w.player, x = p.x, k = this.keyOf, T = this.touch;
    if (caught) this.catches++;
    if (this.step === 0) { this.say('You are the trapper! The Coach Bot is running. Your traps are in the red bar.'); if ((this.t += dt) > 3) this.step++; }
    if (this.step === 1) {
      this.say(caught || this.gotcha ? 'Gotcha! That is how you catch a runner. (+100)' : `Spikes ahead! Fire SPIKES${T ? '' : ` (key ${k('spikes')})`} just as the runner steps on them.`);
      if (caught) this.gotcha = true;
      if (x > tx(36)) { this.step++; this.gotcha = false; }
    }
    if (this.step === 2) {
      this.say(caught || this.gotcha ? 'Burnt! Nice timing.' : `The FLAME burns as long as you hold it${T ? '' : ` (key ${k('flame')})`}. Hold it while the runner passes!`);
      if (caught) this.gotcha = true;
      if (x > tx(49)) { this.step++; this.gotcha = false; }
    }
    if (this.step === 3) {
      this.say(T ? 'Gadgets go anywhere: tap GLUE (purple), then tap the floor in front of the runner.' : 'Gadgets go anywhere: press 7 (Glue) with the mouse in front of the runner, or click it and then the floor.');
      if (w.fx.some(f => f.k === 'glue')) this.glued = true;
      if (this.glued || x > tx(62)) this.step++;
    }
    if (this.step === 4) this.say(`Last one: fire the CANNON${T ? '' : ` (key ${k('cannon')})`} so the ball meets the runner!`);
  }
  // The Coach Bot's buttons: run right, jump obstacles and gaps (with an air jump), pause before each trap.
  botInput(w, dt) {
    const p = w.player, cx = p.x + PHYS.w / 2, solid = (x, y) => w.solidAt(Math.floor(x / TILE), Math.floor(y / TILE));
    const stops = { 1: 24, 2: 37, 4: 70 };
    const stop = stops[this.step];
    if (stop != null && !this.waited[this.step] && p.onGround && cx > tx(stop) && cx < tx(stop + 1.2)) { this.wait = 1.6; this.waited[this.step] = true; }
    if (this.wait > 0) { this.wait -= dt; return { left: false, right: false, jump: false, jumpPressed: false }; }
    const slow = this.step >= 1 && this.step <= 3 && Math.floor(w.time * 6) % 3 === 0;   // walk a bit slower near the traps
    const feet = p.y + PHYS.h, wall = solid(cx + 10, p.y + 4), gapAhead = !solid(cx + 14, feet + 4) && !solid(cx + 22, feet + 4);
    const jumpNow = p.onGround && (wall || gapAhead);
    const airJump = !p.onGround && p.vy > 40 && !solid(cx, feet + 40) && !solid(cx + 20, feet + 40) && !this.usedAir;
    if (p.onGround) this.usedAir = false;
    if (airJump) this.usedAir = true;
    return { left: false, right: !slow, jump: !p.onGround || jumpNow, jumpPressed: jumpNow || airJump };
  }
}

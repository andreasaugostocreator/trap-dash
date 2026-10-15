// Gamepad support with a fake pad: menus (d-pad + A), runner (stick, A, X), same-screen trapper on pad 2 (B fires the red slot).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.addInitScript(() => {
  const mk = i => ({ index: i, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  window.__pads = [mk(0), mk(1)]; window.__padN = 1;
  navigator.getGamepads = () => window.__pads.slice(0, window.__padN);
  window.__btn = (i, k, on) => { window.__pads[i].buttons[k] = { pressed: on, value: on ? 1 : 0 }; };
});
await p.goto('http://localhost:8080/'); await p.waitForTimeout(600);
const tap = async (i, k, ms = 120) => { await p.evaluate(([i, k]) => window.__btn(i, k, true), [i, k]); await p.waitForTimeout(ms); await p.evaluate(([i, k]) => window.__btn(i, k, false), [i, k]); await p.waitForTimeout(120); };
// menus: d-pad down a few times, then A on "Practice"
for (let n = 0; n < 12; n++) { const f = await p.evaluate(() => document.querySelector('.padfocus')?.textContent.trim()); if (/Practice/.test(f || '')) break; await tap(0, 13, 60); }
console.log('focused:', await p.evaluate(() => document.querySelector('.padfocus')?.textContent.trim()));
await tap(0, 0); await p.waitForTimeout(500);
console.log('screen after A:', await p.evaluate(() => [...document.querySelectorAll('.screen')].find(s => !s.classList.contains('hidden'))?.id));
await p.click('#startBtn'); await p.waitForTimeout(4200);
const st = () => p.evaluate(() => { const w = window.__td.run.world; return { x: Math.round(w.player.x), y: Math.round(w.player.y), gad: JSON.stringify(Object.fromEntries(Object.entries(w.gad.runner).map(([k, g]) => [k, g.n]))), label: document.querySelector('#rgad small')?.textContent }; });
const a = await st();
await p.evaluate(() => { window.__pads[0].axes[0] = 1; }); await p.waitForTimeout(600);
await tap(0, 0, 200);
const bAfterJump = await st();
await tap(0, 2);   // X: first runner gadget
await p.evaluate(() => { window.__pads[0].axes[0] = 0; });
const c = await st();
console.log('runner start', JSON.stringify(a)); console.log('after stick+A', JSON.stringify(bAfterJump)); console.log('after X', JSON.stringify(c));
const moved = bAfterJump.x > a.x + 30, gadUsed = a.gad !== c.gad;
// pause with Start, resume with Start
await tap(0, 9); const paused = await p.evaluate(() => window.__td.run.paused); await tap(0, 9); const resumed = !(await p.evaluate(() => window.__td.run.paused));
console.log('Start pauses:', paused, '| Start resumes:', resumed);
// same screen: pad 2 traps
await p.evaluate(() => window.__td.nav('title')); await p.waitForTimeout(400);
await p.evaluate(() => { window.__padN = 2; });
await p.click('text=Same screen'); await p.waitForTimeout(300); await p.click('#levels button:has-text("Windy Works")'); await p.click('#startBtn'); await p.waitForTimeout(4200);
await p.evaluate(() => { const w = window.__td.run.world, t = w.traps.find(q => q.kind === 'wall'); w.player.x = t.x0 * 16 - 60; });
await p.waitForTimeout(300);
const slot0 = await p.evaluate(() => document.querySelector('#trapbar .tbtn').dataset.kind + ' / key ' + document.querySelector('#trapbar .skey').textContent);
await tap(1, 1);
const fired = await p.evaluate(() => { const t = window.__td.run.slots[0]; return t ? t.state + ' cd ' + t.cd.toFixed(1) : 'none'; });
console.log('pad 2 red slot', slot0, '->', fired);
await p.screenshot({ path: 'shots/107-gamepad-same-screen.png' });
const ok = moved && gadUsed && paused && resumed && fired !== 'none' && !/^idle cd 0.0/.test(fired);
console.log(ok ? 'gamepad ok' : 'FAIL');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

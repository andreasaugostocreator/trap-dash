// A phone held upright (or with rotation lock on): the app turns itself to landscape. Joystick, JUMP, near-miss taps
// and tapping traps on the map must all still work with real touch coordinates. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(3400);
await p.tap('text=Same screen'); await p.waitForTimeout(300); await p.tap('#levels button:has-text("Windy Works")'); await p.tap('#startBtn'); await p.waitForTimeout(4200);
const cdp = await p.context().newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const center = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const st = () => p.evaluate(() => { const w = window.__td.run.world; return { x: Math.round(w.player.x), y: Math.round(w.player.y), rot: document.documentElement.classList.contains('rot') }; });
const a = await st();
const R = await center('#tRight');
await touch('touchStart', [{ x: R.x, y: R.y, id: 1 }]); await p.waitForTimeout(700); await touch('touchEnd', []); await p.waitForTimeout(100);
const b1 = await st();
const J = await center('#tJump');
await touch('touchStart', [{ x: J.x, y: J.y, id: 2 }]); await p.waitForTimeout(150);
const b2 = await st(); await touch('touchEnd', []);
console.log('turned:', a.rot, '| hold joystick right: moved', b1.x - a.x, 'px | JUMP: rose', b1.y - b2.y, 'px');
// slide on the joystick from right to left without lifting
const L = await center('#tLeft');
await p.waitForTimeout(600); const c0 = await st();
await touch('touchStart', [{ x: R.x, y: R.y, id: 3 }]); await p.waitForTimeout(250); await touch('touchMove', [{ x: L.x, y: L.y, id: 3 }]); await p.waitForTimeout(500); await touch('touchEnd', []);
const c1 = await st();
console.log('slide right -> left: ended moving left:', c1.x < c0.x + 20);
// tap the wall trap on the map (screen point from its spot in the world)
const spot = await p.evaluate(() => { const R = window.__td.R, w = window.__td.run.world, t = w.traps.find(q => q.kind === 'wall'), bt = R.trapButton(w, t);
  const ux = (bt.x - R.camX) * R.k / R.dpr + R.ox, uy = (bt.y - R.camY) * R.k / R.dpr + R.oy, H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--uiH'));
  return { x: H - uy, y: ux, id: t.id }; });
await touch('touchStart', [{ x: spot.x, y: spot.y, id: 4 }]); await p.waitForTimeout(80); await touch('touchEnd', []); await p.waitForTimeout(100);
const fired = await p.evaluate(id => window.__td.run.world.traps[id].state !== 'idle' || window.__td.run.world.traps[id].cd > 0, spot.id);
console.log('tapped the wall on the map: fired', fired);
await p.screenshot({ path: 'shots/111-rotated-game.png' });
const ok = a.rot && b1.x - a.x > 30 && b1.y - b2.y > 2 && c1.x < c0.x + 20 && fired;
console.log(ok ? 'rotation ok' : 'FAIL');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

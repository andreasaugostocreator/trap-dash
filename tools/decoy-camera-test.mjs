// The trapper's camera chases the runner's decoy while it is out, then glides back to the real runner. Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p; };
const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
const h = await page({ viewport: { width: 1280, height: 720 } }), g = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(400);
await h.click('#levels button:has-text("Sunny Hills")'); await h.click('#startBtn'); await h.waitForTimeout(4200);
// where the trapper's view is centred, in tiles, relative to the real runner and to the decoy
const view = () => g.evaluate(() => { const R = window.__td.R, w = window.__td.run.world, mid = R.camX + R.lo.width / 2;
  return { visible: !w.player.dead, runner: +((w.player.x - mid) / 16).toFixed(1), decoy: w.decoy ? +((w.decoy.x - mid) / 16).toFixed(1) : null }; });
const before = await view();
// the runner (host) throws a long-lived decoy that runs right while they stand still
await h.evaluate(() => { const w = window.__td.run.world, p = w.player; p.face = 1; w.decoy = { x: p.x, y: p.y, vx: 110, vy: 0, face: 1, t: 4, onGround: p.onGround }; });
await h.waitForTimeout(3000);
const during = await view();
await g.screenshot({ path: 'shots/105-trapper-decoy.png' });
await h.waitForTimeout(3500);
const after = await view();
console.log('before', JSON.stringify(before)); console.log('during', JSON.stringify(during)); console.log('after ', JSON.stringify(after));
const ok = during.decoy !== null && Math.abs(during.decoy) < Math.abs(during.runner) && during.visible && after.decoy === null && Math.abs(after.runner) < Math.abs(during.runner);
console.log(ok ? 'camera follows the decoy, then returns to the runner' : 'FAIL');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

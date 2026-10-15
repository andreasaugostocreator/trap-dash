// Forgiving touch: taps that just miss a button still press it. Needs :8080 (and the relay broker for the trapper part).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const phone = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const p = await b.newPage(phone); p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400); await p.tap('text=Practice'); await p.tap('#startBtn'); await p.waitForTimeout(3800);
const box = id => p.locator(id).boundingBox();
const cdp = await p.context().newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const held = () => p.evaluate(() => ({ L: document.getElementById('tLeft').classList.contains('down'), R: document.getElementById('tRight').classList.contains('down'), J: document.getElementById('tJump').classList.contains('down') }));
const R = await box('#tRight'), J = await box('#tJump'), L = await box('#tLeft');
// 1. press 12 px to the right of ▶ (between the arrows and the gadgets) and hold
await touch('touchStart', [{ x: R.x + R.width + 12, y: R.y + R.height / 2, id: 1 }]); await p.waitForTimeout(400);
const x0 = await p.evaluate(() => window.__td.run.world.player.x);
console.log('12 px right of ▶:', JSON.stringify(await held()), 'runner moved', (await p.evaluate(() => window.__td.run.world.player.x)) > x0 - 1 ? 'right' : 'no');
await touch('touchEnd', []); await p.waitForTimeout(200);
console.log('after release:', JSON.stringify(await held()));
// 2. press 15 px above JUMP
const y0 = await p.evaluate(() => window.__td.run.world.player.y);
await touch('touchStart', [{ x: J.x + J.width / 2, y: J.y - 15, id: 2 }]); await p.waitForTimeout(150);
const y1 = await p.evaluate(() => window.__td.run.world.player.y);
await touch('touchEnd', []);
console.log('15 px above JUMP: jumped', y1 < y0 - 2);
// 3. a press far from everything (in the empty middle of the panel) does nothing
const D = await box('.rgad');
await touch('touchStart', [{ x: (R.x + R.width + D.x) / 2, y: R.y + 4, id: 3 }]); await p.waitForTimeout(100);
console.log('middle gap (should follow nearest only if within 56px):', JSON.stringify(await held()));
await touch('touchEnd', []);
// 4. a gadget button: a tap 6 px above it (it sits at the bottom edge now)
const S = await p.locator('.gbtn[data-id="shield"]').boundingBox();
await touch('touchStart', [{ x: S.x + S.width / 2, y: S.y - 6, id: 4 }]); await p.waitForTimeout(100); await touch('touchEnd', []);
console.log('6 px above Shield: shield on', await p.evaluate(() => window.__td.run.world.player.shield > 0));
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await b.close();

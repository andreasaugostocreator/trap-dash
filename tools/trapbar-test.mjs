// Needs the relay broker (node tools/relay-broker.mjs) and the site on :8080.
// The trapper gets three coloured slots for the next traps ahead. A phone trapper fires a crusher from its slot,
// holds a flame; same-screen on PC uses key 1.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); return p; };
const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
const h = await page({ viewport: { width: 1280, height: 720 } });
const g = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b);
await h.click('#levels button:has-text("Midnight Meadow")'); await h.click('#startBtn'); await h.waitForTimeout(3800);
await h.keyboard.down('ArrowRight'); await h.waitForTimeout(500);
console.log('slots at the start:', await g.evaluate(() => [...document.querySelectorAll('.tbtn')].map(b => (b.dataset.kind || '-') + ':' + b.dataset.state).join('  ')));
await h.evaluate(() => { const w = window.__td.run.world, c = w.traps.find(t => t.kind === 'crusher'); w.player.x = c.x0 * 16 - 60; });
await g.waitForTimeout(500);
console.log('slots near the crushers:', await g.evaluate(() => [...document.querySelectorAll('.tbtn')].map(b => (b.dataset.kind || '-') + ':' + b.dataset.state).join('  ')));
const before = await g.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'crusher').map(t => t.state).join());
await g.tap('.tbtn[data-kind="crusher"] >> nth=0'); await g.waitForTimeout(350);
await g.screenshot({ path: 'shots/40-trapbar-phone.png' });
const after = await h.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'crusher').map(t => t.state).join());
console.log('crushers before', before, '| after tapping bar (runner device)', after);
await h.keyboard.up('ArrowRight');
// hold the flame button on the phone: the flame on the runner's device burns until the finger lifts
await h.evaluate(() => { const w = window.__td.run.world; w.player.x = 36 * 16; w.player.y = 14 * 16 - 13; });
await g.waitForTimeout(600);
const fb = await g.locator('.tbtn[data-kind="flame"]').first().boundingBox();
const cdp = await g.context().newCDPSession(g);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 }] });
await g.waitForTimeout(1100);
const fDuring = await h.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'flame').map(t => t.state).join());
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await g.waitForTimeout(400);
const fAfter = await h.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'flame').map(t => t.state + ' cd ' + t.cd.toFixed(1)).join(', '));
console.log('flame held 1.1 s on the phone -> runner device during:', fDuring, '| after release:', fAfter);
// same screen on PC: key 1 fires spikes
const l = await page({ viewport: { width: 1280, height: 720 } });
await l.goto('http://localhost:8080/'); await l.waitForTimeout(400);
await l.click('text=Same screen'); await l.click('#startBtn'); await l.waitForTimeout(3700);
await l.keyboard.down('ArrowRight'); await l.waitForTimeout(450); await l.keyboard.press('Digit1'); await l.waitForTimeout(250);
await l.screenshot({ path: 'shots/41-trapbar-pc.png' });
console.log('spikes after key 1:', await l.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'spikes').map(t => t.state).join()));
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await b.close();

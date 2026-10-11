// Needs the relay broker (node tools/relay-broker.mjs) and the site on :8080.
// Trapper on a phone fires the crusher with the fixed trap bar; same-screen on PC uses key 1.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); return p; };
const q = '?nop2p&relay=ws://127.0.0.1:8883';
const h = await page({ viewport: { width: 1280, height: 720 } });
const g = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b);
await h.click('#levels button:has-text("Midnight Meadow")'); await h.click('#startBtn'); await h.waitForTimeout(3800);
await h.keyboard.down('ArrowRight'); await h.waitForTimeout(500);
const before = await g.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'crusher').map(t => t.state).join());
await g.tap('.tbtn[data-kind="crusher"]'); await g.waitForTimeout(350);
await g.screenshot({ path: 'shots/40-trapbar-phone.png' });
const after = await h.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'crusher').map(t => t.state).join());
console.log('crushers before', before, '| after tapping bar (runner device)', after);
await h.keyboard.up('ArrowRight');
// same screen on PC: key 1 fires spikes
const l = await page({ viewport: { width: 1280, height: 720 } });
await l.goto('http://localhost:8080/'); await l.waitForTimeout(400);
await l.click('text=Same screen'); await l.click('#startBtn'); await l.waitForTimeout(3700);
await l.keyboard.down('ArrowRight'); await l.waitForTimeout(450); await l.keyboard.press('Digit1'); await l.waitForTimeout(250);
await l.screenshot({ path: 'shots/41-trapbar-pc.png' });
console.log('spikes after key 1:', await l.evaluate(() => window.__td.run.world.traps.filter(t => t.kind === 'spikes').map(t => t.state).join()));
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await b.close();

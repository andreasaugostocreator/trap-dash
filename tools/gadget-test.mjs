// Gadgets end to end. Needs the site on :8080 and the relay broker (node tools/relay-broker.mjs).
import { chromium } from 'playwright-core';
import { LEVELS } from '../src/levels.js';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p; };
const st = p => p.evaluate(() => { const w = window.__td.run.world, q = w.player; return { x: Math.round(q.x), stun: +q.stun.toFixed(2), shield: +q.shield.toFixed(2), rev: +q.rev.toFixed(1), dead: q.deaths, jam: +w.jam.toFixed(1), fx: w.fx.map(f => f.k).join(), tg: Object.values(w.gad.trapper).map(g => g.n).join(), rg: Object.values(w.gad.runner).map(g => g.n).join() }; });

// 1. Same screen on PC: trapper keys + mouse aim, runner keys.
const l = await page({ viewport: { width: 1280, height: 720 } });
await l.goto('http://localhost:8080/'); await l.waitForTimeout(400);
// Each map deals its own gadgets; this part forces the classic set so the keys are known (7 bolt, 8 glue, 9 gust, 0 hex; Shift dash, Q shield, E jammer).
await l.click('text=Same screen');
await l.evaluate(lv => window.__td.startRun({ ...lv, loadout: { runner: ['dash', 'shield', 'jam', 'feather'], trapper: ['bolt', 'glue', 'gust', 'hex'] } }, 'a', 1), LEVELS.find(v => v.id === 'windy'));
await l.waitForTimeout(3700);
const scr = await l.evaluate(() => { const R = window.__td.R, p = window.__td.run.world.player; return { x: (p.x + 5 - R.camX) * R.k / R.dpr + R.ox, y: (p.y - R.camY) * R.k / R.dpr + R.oy }; });
await l.mouse.move(scr.x, scr.y); await l.keyboard.press('Digit7'); await l.waitForTimeout(200);
await l.screenshot({ path: 'shots/50-bolt-warning.png' });
await l.waitForTimeout(600);
console.log('after lightning on the runner:', JSON.stringify(await st(l)));
await l.screenshot({ path: 'shots/51-stunned.png' });
await l.waitForTimeout(1200);
await l.waitForTimeout(3200); await l.keyboard.press('KeyQ'); await l.waitForTimeout(100);
await l.mouse.move(scr.x + 30, scr.y); await l.keyboard.press('Digit7'); await l.waitForTimeout(900);
console.log('shield then lightning (should be blocked):', JSON.stringify(await st(l)));
await l.keyboard.press('Digit0'); await l.waitForTimeout(100);
await l.keyboard.down('ArrowRight'); await l.waitForTimeout(500); await l.keyboard.up('ArrowRight');
console.log('hex then holding right (should walk left):', JSON.stringify(await st(l)));
await l.keyboard.press('KeyE'); await l.waitForTimeout(100); await l.keyboard.press('Digit1'); await l.waitForTimeout(100);
console.log('jammer then trap key (traps should not fire):', JSON.stringify(await st(l)), await l.evaluate(() => window.__td.run.world.traps.map(t => t.state[0]).join('')));
await l.mouse.move(scr.x + 120, scr.y); await l.keyboard.press('Digit8'); await l.waitForTimeout(3200);
await l.keyboard.press('Digit8');
await l.keyboard.down('ArrowRight'); await l.keyboard.press('ShiftLeft'); await l.waitForTimeout(150);
await l.screenshot({ path: 'shots/52-pc-gadgets.png' }); await l.keyboard.up('ArrowRight');
console.log('dash + glue:', JSON.stringify(await st(l)));

// 2. Online: phone trapper aims lightning by tapping the button then the map.
const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
const h = await page({ viewport: { width: 1280, height: 720 } });
const g = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b);
await h.click('#levels button:has-text("Pirate Cove")'); await h.click('#startBtn'); await h.waitForTimeout(3800);
await g.tap('.gbtn[data-id="bolt"]'); await g.waitForTimeout(150);
await h.keyboard.down('ArrowRight'); await h.waitForTimeout(900); await h.keyboard.up('ArrowRight'); await h.waitForTimeout(150);
const gp = await g.evaluate(() => { const R = window.__td.R, p = window.__td.run.world.player; return { x: (p.x + 5 - R.camX) * R.k / R.dpr + R.ox, y: (p.y - R.camY) * R.k / R.dpr + R.oy }; });
await g.touchscreen.tap(gp.x, gp.y); await g.waitForTimeout(250);
await g.screenshot({ path: 'shots/53-phone-trapper-gadgets.png' });
await h.waitForTimeout(700);
console.log('online: runner device after phone lightning:', JSON.stringify(await st(h)));
// 3. Phone runner layout
const pr = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await pr.goto('http://localhost:8080/'); await pr.waitForTimeout(400); await pr.tap('text=Practice'); await pr.tap('#startBtn'); await pr.waitForTimeout(3700);
await pr.tap('.gbtn[data-id="shield"]'); await pr.waitForTimeout(200);
await pr.screenshot({ path: 'shots/54-phone-runner-gadgets.png' });
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'no errors');
await b.close();

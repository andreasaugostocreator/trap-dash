// Endless mode: stages chain on, totals carry over, swap sides works on one screen and online.
// Needs the site on :8080 and the relay broker (node tools/relay-broker.mjs).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p; };
const info = p => p.evaluate(() => { const r = window.__td.run; return r ? { stage: r.endless?.stage, total: +(r.endless?.total ?? 0).toFixed(1), runner: r.runner, here: r.runnerHere, who: document.getElementById('who').textContent, timer: document.getElementById('timer').textContent, map: r.world.w + 'x' + r.world.h } : null; });
const warpToGoal = p => p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });

const l = await page({ viewport: { width: 1280, height: 720 } });
await l.goto('http://localhost:8080/'); await l.waitForTimeout(400);
await l.click('text=Same screen');
await l.screenshot({ path: 'shots/80-lobby-endless.png' });
await l.click('#endRow button >> nth=1'); await l.waitForTimeout(3800);
console.log('local start:', JSON.stringify(await info(l)));
await l.keyboard.down('ArrowRight'); await l.waitForTimeout(1500); await l.keyboard.up('ArrowRight');
await warpToGoal(l); await l.waitForTimeout(2600);
console.log('after the flag:', JSON.stringify(await info(l)));
await l.screenshot({ path: 'shots/81-stage2.png' });
await l.click('#pauseBtn'); await l.waitForTimeout(200);
await l.screenshot({ path: 'shots/82-endless-menu.png' });
await l.click('#swapBtn'); await l.waitForTimeout(3800);
console.log('after swap:', JSON.stringify(await info(l)));

// online: the guest runs stage 1, reaches the flag, both move to stage 2; the guest asks to swap.
const q = '?nop2p&relay=ws://127.0.0.1:8883';
const h = await page({ viewport: { width: 1280, height: 720 } });
const g = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b);
await h.waitForTimeout(500);
await h.click('#firstSeg button >> nth=1');
await h.waitForTimeout(200);
await h.click('#endRow button >> nth=2'); await h.waitForTimeout(4000);
console.log('online host:', JSON.stringify(await info(h)), ' guest:', JSON.stringify(await info(g)));
await warpToGoal(g); await g.waitForTimeout(2800);
console.log('online after the flag: host', JSON.stringify(await info(h)), ' guest', JSON.stringify(await info(g)));
await g.screenshot({ path: 'shots/83-online-stage2-guest.png' });
await h.screenshot({ path: 'shots/84-online-stage2-host.png' });
await g.tap('#pauseBtn'); await g.waitForTimeout(200); await g.tap('#swapBtn'); await g.waitForTimeout(3800);
console.log('online after swap: host', JSON.stringify(await info(h)), ' guest', JSON.stringify(await info(g)));
await h.screenshot({ path: 'shots/85-online-swapped-host.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

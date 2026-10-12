// Reconnect: the guest loses the network mid-run and comes back; then the guest's page reloads mid-run.
// Needs the site on :8080 and the relay broker (node tools/relay-broker.mjs).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const q = '?nop2p&relay=ws://127.0.0.1:8883';
const hc = await b.newContext({ viewport: { width: 1280, height: 720 } }), gc = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const h = await hc.newPage(), g = await gc.newPage();
for (const p of [h, g]) { p.on('pageerror', e => errs.push(e.message)); }
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(400);
await h.click('#startBtn'); await h.waitForTimeout(4000);
await h.evaluate(() => { window.__td.score.a = 1; });   // pretend there's a score to keep
console.log('playing:', await h.evaluate(() => window.__td.run.phase), await g.evaluate(() => window.__td.run.phase));
await gc.setOffline(true);
await h.waitForTimeout(12500);
console.log('host banner:', (await h.textContent('#netWait')).replace(/\s+/g, ' '), '| guest banner:', (await g.textContent('#netWait')).replace(/\s+/g, ' '));
await gc.setOffline(false);
await h.waitForFunction(() => document.getElementById('netWait').classList.contains('hidden'), null, { timeout: 20000 });
await h.waitForTimeout(4500);
console.log('after reconnect: host', await h.evaluate(() => [window.__td.run && window.__td.run.phase, JSON.stringify(window.__td.score)].join(' ')), '| guest', await g.evaluate(() => window.__td.run && window.__td.run.phase));
// the guest's page reloads mid-run (the phone killed the tab)
await g.reload(); await g.waitForTimeout(500);
await g.waitForFunction(() => window.__td.run, null, { timeout: 20000 });
await g.waitForTimeout(4500);
console.log('after reload: guest', await g.evaluate(() => [window.__td.run.phase, window.__td.mode, JSON.stringify(window.__td.score)].join(' ')), '| host', await h.evaluate(() => window.__td.run.phase));
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

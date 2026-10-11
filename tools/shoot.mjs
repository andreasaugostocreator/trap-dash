// Plays through the game in headless Chromium and saves screenshots to shots/.
// Serve the repo on :8080 first. For the online test also run a local broker: npx peerjs --port 9000
// Usage: node tools/shoot.mjs [local|practice|online|all]
import { chromium } from 'playwright-core';
import fs from 'fs';
const what = process.argv[2] || 'all';
const BASE = process.env.URL || 'http://localhost:8080/';
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errors = [];
async function open(url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForTimeout(600);
  return page;
}
const wait = (p, ms) => p.waitForTimeout(ms);
const state = p => p.evaluate(() => { const r = window.__td.run; if (!r) return null; const w = r.world, pl = w.player; return { phase: r.phase, x: Math.round(pl.x), y: Math.round(pl.y), t: +w.time.toFixed(1), deaths: pl.deaths, traps: w.traps.map(t => t.state[0] + (t.cd > 0 ? '*' : '')).join('') }; });

if (what === 'all' || what === 'local') {
  const p = await open(BASE + '?debug');
  await p.screenshot({ path: 'shots/01-title.png' });
  await p.click('text=How to play'); await wait(p, 200); await p.screenshot({ path: 'shots/02-howto.png' }); await p.click('text=Got it');
  await p.click('text=Same screen'); await wait(p, 300); await p.screenshot({ path: 'shots/03-lobby-local.png' });
  await p.click('#startBtn'); await wait(p, 1200); await p.screenshot({ path: 'shots/04-countdown.png' });
  await wait(p, 2600);
  await p.keyboard.down('ArrowRight'); await wait(p, 400);
  await p.keyboard.down('Space'); await wait(p, 300); await p.keyboard.up('Space');
  await wait(p, 300);
  // fire the first spike trap by clicking its button on screen
  const btn = await p.evaluate(() => { const r = window.__td.run, R = window.__td.R, t = r.world.traps.find(t => t.kind === 'spikes'); const b = R.trapButton(r.world, t); return { x: (b.x - R.camX) * R.k / R.dpr, y: (b.y - R.camY) * R.k / R.dpr }; });
  await p.mouse.click(btn.x, btn.y); await wait(p, 330);
  await p.screenshot({ path: 'shots/05-local-spikes.png' });
  console.log('local', JSON.stringify(await state(p)));
  await wait(p, 1500); await p.keyboard.up('ArrowRight');
  console.log('local later', JSON.stringify(await state(p)));
  // jump to the crusher and drop it
  await p.evaluate(() => { const w = window.__td.run.world; w.player.x = 52 * 16; w.player.y = 13 * 16 - 13; });
  await wait(p, 600);
  await p.evaluate(() => { const w = window.__td.run.world; window.__td.fireTrap(w.traps.find(t => t.kind === 'crusher').id); });
  await wait(p, 380); await p.screenshot({ path: 'shots/06-crusher.png' });
  await p.evaluate(() => { const w = window.__td.run.world; w.player.x = 64 * 16; w.player.y = 12 * 16 - 13; window.__td.fireTrap(w.traps.find(t => t.kind === 'flame').id); });
  await wait(p, 500); await p.screenshot({ path: 'shots/07-flame.png' });
  await p.evaluate(() => { const w = window.__td.run.world; w.player.dead = false; w.player.x = 96 * 16; w.player.y = 13 * 16 - 13; });
  await p.keyboard.down('ArrowRight'); await wait(p, 1800); await p.keyboard.up('ArrowRight');
  await p.screenshot({ path: 'shots/08-run1-result.png' });
  await p.click('#go2'); await wait(p, 3600);
  await p.evaluate(() => { const w = window.__td.run.world; w.time = 40; w.player.dead = false; w.player.x = 96 * 16; w.player.y = 13 * 16 - 13; });
  await p.keyboard.down('ArrowRight'); await wait(p, 1800); await p.keyboard.up('ArrowRight');
  await p.screenshot({ path: 'shots/09-level-result.png' });
  console.log('score', JSON.stringify(await p.evaluate(() => window.__td.score)));
  await p.click('#nextLv'); await wait(p, 4000); await p.screenshot({ path: 'shots/10-level2.png' });
  for (const [i, x, y] of [[3, 60, 13], [1, 10, 40], [5, 60, 9]]) {
    await p.evaluate(i => { window.__td.startRun(i, 'a', 1); }, i); await wait(p, 3800);
    await p.evaluate(([x, y]) => { const w = window.__td.run.world; w.player.x = x * 16; w.player.y = y * 16 - 13; }, [x, y]);
    await wait(p, 700); await p.screenshot({ path: `shots/11-level${i + 1}.png` });
  }
}

if (what === 'all' || what === 'practice') {
  const p = await open(BASE, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.screenshot({ path: 'shots/20-phone-title.png' });
  await p.tap('text=Practice'); await wait(p, 300); await p.screenshot({ path: 'shots/21-phone-lobby.png' });
  await p.tap('#startBtn'); await wait(p, 3600);
  const right = await p.locator('#tRight').boundingBox(), jump = await p.locator('#tJump').boundingBox();
  const cdp = await p.context().newCDPSession(p);
  const touches = pts => cdp.send('Input.dispatchTouchEvent', { type: pts.length ? 'touchStart' : 'touchEnd', touchPoints: pts });
  await touches([{ x: right.x + 30, y: right.y + 30, id: 1 }]);
  for (let i = 0; i < 6; i++) {
    await wait(p, 500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x + 30, y: right.y + 30, id: 1 }, { x: jump.x + 40, y: jump.y + 40, id: 2 }] });
    await wait(p, 250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: right.x + 30, y: right.y + 30, id: 1 }] });
  }
  await p.screenshot({ path: 'shots/22-phone-practice.png' });
  await touches([]);
  console.log('practice', JSON.stringify(await state(p)));
  const pp = await open(BASE, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pp.screenshot({ path: 'shots/23-portrait-title.png' });
  await pp.tap('text=Practice'); await pp.tap('#startBtn'); await wait(pp, 3800); await pp.screenshot({ path: 'shots/24-portrait-play.png' });
}

if (what === 'all' || what === 'online') {
  const q = process.env.Q || '?peerhost=127.0.0.1&peerport=9000&relay=ws://127.0.0.1:8883';
  const host = await open(BASE + q), guest = await open(BASE + q, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await host.click('text=Host a party');
  await host.waitForFunction(() => document.getElementById('roomCode').textContent !== '----', null, { timeout: 8000 });
  const code = await host.textContent('#roomCode');
  console.log('room', code);
  await guest.tap('text=Join a party'); await guest.fill('#code', code); await guest.tap('#joinGo');
  await host.waitForFunction(() => window.__td.players.b, null, { timeout: 8000 });
  await wait(host, 400);
  await host.screenshot({ path: 'shots/30-host-lobby.png' }); await guest.screenshot({ path: 'shots/31-guest-lobby.png' });
  await host.click('#levels button:has-text("Midnight Meadow")'); await wait(host, 300);
  await host.click('#startBtn'); await wait(host, 3800);
  await host.keyboard.down('ArrowRight'); await wait(host, 700);
  // guest is the trapper: drop the first crusher with a real tap
  const btn = await guest.evaluate(() => { const r = window.__td.run, R = window.__td.R, t = r.world.traps.find(t => t.kind === 'crusher'); const b = R.trapButton(r.world, t); return { x: (b.x - R.camX) * R.k / R.dpr, y: (b.y - R.camY) * R.k / R.dpr }; });
  await guest.touchscreen.tap(btn.x, btn.y); await wait(guest, 350);
  await host.screenshot({ path: 'shots/32-host-running.png' }); await guest.screenshot({ path: 'shots/33-guest-trapping.png' });
  console.log('host', JSON.stringify(await state(host)));
  console.log('guest', JSON.stringify(await state(guest)));
  await host.keyboard.up('ArrowRight');
  await host.evaluate(() => { const w = window.__td.run.world; w.player.x = 110 * 16; w.player.y = 13 * 16 - 13; });
  await host.keyboard.down('ArrowRight'); await wait(host, 1800); await host.keyboard.up('ArrowRight');
  await host.screenshot({ path: 'shots/34-host-result1.png' }); await guest.screenshot({ path: 'shots/35-guest-result1.png' });
  await host.click('#go2'); await wait(host, 3800);
  // now the guest runs (touch) and the host traps (mouse)
  const gr = await guest.locator('#tRight').boundingBox();
  const cdp = await guest.context().newCDPSession(guest);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gr.x + 30, y: gr.y + 30 }] });
  await wait(guest, 1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('guest runs', JSON.stringify(await state(guest)), 'host sees', JSON.stringify(await state(host)));
  await guest.evaluate(() => { const w = window.__td.run.world; w.time = 55; w.player.x = 110 * 16; w.player.y = 13 * 16 - 13; w.player.vx = 120; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gr.x + 30, y: gr.y + 30 }] });
  await wait(guest, 1800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await host.screenshot({ path: 'shots/36-host-final.png' }); await guest.screenshot({ path: 'shots/37-guest-final.png' });
  console.log('scores', JSON.stringify(await host.evaluate(() => window.__td.score)), JSON.stringify(await guest.evaluate(() => window.__td.score)));
  await host.click('#toLobby'); await wait(host, 500);
  await guest.screenshot({ path: 'shots/38-guest-back-in-lobby.png' });
  await guest.tap('#leaveBtn'); await wait(host, 1500);
  console.log('host after guest left: players.b =', JSON.stringify(await host.evaluate(() => window.__td.players.b)));
}

console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();

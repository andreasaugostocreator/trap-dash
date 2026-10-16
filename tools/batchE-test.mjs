// Batch E: gems on risky lines (time bonus, mirrored online), the online ready check, connection bars.
// Needs :8080 + relay broker. (No autoready here: the real ready check.)
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const hook = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/WebSocket|ERR_/.test(m.text()) && errs.push(m.text())); };
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); hook(p);
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
  const counts = await p.evaluate(async () => { const { LEVELS } = await import('./src/levels.js'); const { World } = await import('./src/sim.js'); return LEVELS.map(L => L.name + ' ' + new World(L).gems.length); });
  console.log('gems per level:', counts.join(', '));
  ok.placed = counts.every(c => +c.split(' ').pop() >= 1);
  await p.click('text=Practice'); await p.click('#startBtn');
  await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
  await p.evaluate(() => { window.__td.run.bot = null; });
  const got = await p.evaluate(async () => { const w = window.__td.run.world, g = w.gems[0]; w.player.x = g.x - 5; w.player.y = g.y - 6; w.player.vy = 0; await new Promise(r => setTimeout(r, 120)); return [w.gemsGot, document.getElementById('gemsHud').textContent]; });
  await p.screenshot({ path: 'shots/160-gem.png' });
  await p.evaluate(() => { const w = window.__td.run.world; w.time = 20; w.player.x = w.goal.x; w.player.y = w.goal.y; });
  await p.waitForFunction(() => window.__td.run.phase === 'end', null, { timeout: 9000 });
  const res = await p.evaluate(() => { const r = window.__td.run; return r && JSON.stringify(window.__lastRes || null); });
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('trapdash-stats')).gems);
  ok.gem = got[0] === 1 && /^1\//.test(got[1]) && st === 1;
  console.log('picked a gem:', JSON.stringify(got), '| stats gems', st);
  await p.close();
}
{
  const q = '?nop2p&relay=ws://127.0.0.1:8883';
  const ch = await b.newContext({ viewport: { width: 1000, height: 600 } }), cg = await b.newContext({ viewport: { width: 1000, height: 600 } });
  const h = await ch.newPage(), g = await cg.newPage(); hook(h); hook(g);
  await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
  await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
  const code = await h.textContent('#roomCode');
  await g.click('text=Join a party'); await g.fill('#code', code); await g.click('#joinGo');
  await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(2500);
  const bars = await h.evaluate(() => document.getElementById('sigLobby').dataset.n);
  await h.click('#startBtn'); await h.waitForTimeout(600);
  const hostWaits = await h.textContent('#startBtn'), guestSees = await g.textContent('#startBtn'), notYet = !(await h.evaluate(() => window.__td.run));
  await g.screenshot({ path: 'shots/161-ready-guest.png' });
  await g.click('#startBtn');
  await h.waitForFunction(() => window.__td.run, null, { timeout: 8000 }).catch(() => {});
  const started = await h.evaluate(() => !!window.__td.run) && await g.waitForFunction(() => window.__td.run, null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok.ready = /Ready ✓/.test(hostWaits) && /is ready/.test(guestSees) && notYet && started;
  console.log('ready check: host button', JSON.stringify(hostWaits), '| guest sees', JSON.stringify(guestSees), '| started after both:', started);
  await h.waitForTimeout(1500);
  const hudBars = await g.evaluate(() => { const e = document.getElementById('sigHud'); return !e.classList.contains('hidden') && e.dataset.n; });
  ok.bars = +bars >= 1 && +hudBars >= 1;
  console.log('signal bars: lobby', bars, '| in game', hudBars);
  // gems online: the runner picks one, the trapper's screen shows it gone
  await h.waitForFunction(() => window.__td.run.phase === 'play', null, { timeout: 15000 });
  await h.evaluate(async () => { const w = window.__td.run.world, gm = w.gems[0]; w.player.x = gm.x - 5; w.player.y = gm.y - 6; });
  await g.waitForTimeout(600);
  const mirrored = await g.evaluate(() => window.__td.run.world.gemsGot);
  ok.gemOnline = mirrored === 1;
  console.log('trapper sees the gem taken:', mirrored);
  await ch.close(); await cg.close();
}
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

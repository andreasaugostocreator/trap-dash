// Bigger parties: three players (1 runner, 2 trappers), four (2 runners racing, 2 trappers) and a spectator.
// Everyone plays at once; catches are credited to the trapper who fired; the host tallies the level. Needs :8080 + broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
const open = async () => { const c = await b.newContext({ viewport: { width: 1000, height: 560 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/WebSocket|ERR_/.test(m.text()) && errs.push(m.text())); await p.goto('http://localhost:8080/' + q); return p; };
const td = (p, f, a) => p.evaluate(f, a);
const h = await open(), g1 = await open(), g2 = await open();
await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
const code = await h.textContent('#roomCode');
const join = async (p, watch) => { await p.click('text=Join a party'); await p.fill('#code', code); await p.click(watch ? '#joinWatch' : '#joinGo'); await p.waitForTimeout(1200); };
await join(g1); await join(g2);
await h.waitForFunction(() => window.__td.players.c, null, { timeout: 10000 });
await h.waitForTimeout(600);
const lob = await td(h, () => ({ sides: Object.keys(window.__td.players).filter(s => window.__td.players[s]), roles: window.__td.lobbyRoles() }));
console.log('3-player lobby:', JSON.stringify(lob));
await h.screenshot({ path: 'shots/190-lobby3.png' });
const g2side = await td(g2, () => window.__td.mySide());
ok.three = lob.sides.length === 3 && g2side === 'c';
// round 1: a runs, b and c trap. c fires a trap that catches a.
await h.click('#startBtn');
for (const p of [h, g1, g2]) await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 15000 });
const roles = await Promise.all([h, g1, g2].map(p => td(p, () => [window.__td.run.runnerHere, window.__td.run.trapperHere, window.__td.run.multi && window.__td.run.multi.runners.join('')])));
console.log('roles (run, trap, runners):', JSON.stringify(roles));
// put the runner on spikes and let c fire them
const trapId = await td(h, () => { const w = window.__td.run.world, t = w.traps.find(t => t.kind === 'spikes'); w.player.x = (t.x0 + t.x1) * 8 - 4; w.player.y = t.y * 16 - 12; w.player.vx = 0; return t.id; });
await g2.waitForTimeout(300);
await td(g2, id => window.__td.fireTrap(id), trapId);
await h.waitForTimeout(1500);
const credit = await td(h, () => Object.fromEntries(Object.entries(window.__td.run.multi.tscores).map(([k, v]) => [k, v.pts])));
console.log('trap points by trapper (host tally):', JSON.stringify(credit));
ok.credit = credit.c > 0 && !credit.b;
await td(h, () => { const w = window.__td.run.world; w.player.dead = false; w.player.x = w.goal.x; w.player.y = w.goal.y; });
await h.waitForFunction(() => document.querySelector('.partyScore'), null, { timeout: 10000 });
await g2.waitForFunction(() => document.querySelector('.partyScore'), null, { timeout: 10000 });
await h.waitForTimeout(500); await h.screenshot({ path: 'shots/191-result3.png' });
const sc3 = await td(h, () => window.__td.score);
console.log('score after level 1:', JSON.stringify(sc3));
ok.tally3 = sc3.a === 1 && sc3.c === 1;
await h.click('#toLobby'); await h.waitForTimeout(800);
// a fourth player and a spectator
const g3 = await open(), w = await open(); await g3.waitForTimeout(400);
await join(g3); await join(w, true);
await h.waitForFunction(() => window.__td.players.d, null, { timeout: 10000 }); await h.waitForTimeout(800);
const lob4 = await td(h, () => window.__td.lobbyRoles());
console.log('4-player roles:', JSON.stringify(lob4), '| watcher side', await td(w, () => window.__td.mySide()));
await h.screenshot({ path: 'shots/192-lobby4.png' });
for (const [W, H] of [[844, 390], [667, 375], [1000, 560]]) {
  await h.setViewportSize({ width: W, height: H }); await h.waitForTimeout(300); await td(h, () => window.__td.refreshLobby());
  const fit = await td(h, () => { const c = document.querySelector('#lobby .card'); return c.scrollHeight - c.clientHeight; });
  console.log(`4-player lobby at ${W}x${H}: overflow ${fit}px`); if (W === 844) await h.screenshot({ path: 'shots/196-lobby4-phone.png' });
  ok['fit' + H] = fit <= 2;
}
await h.setViewportSize({ width: 1000, height: 560 });
ok.four = Object.values(lob4).filter(r => r === 'run').length === 2;
await h.click('#startBtn');
for (const p of [h, g1, g2, g3, w]) await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 15000 });
await h.waitForTimeout(1200);
const view = await td(w, () => ({ runner: window.__td.run.runnerHere, trap: window.__td.run.trapperHere, focus: window.__td.run.multi.focus, rivals: Object.keys(window.__td.run.multi.rivals) }));
const hostRivals = await td(h, () => Object.keys(window.__td.run.multi.rivals));
console.log('spectator view:', JSON.stringify(view), '| host (runner a) sees rivals', JSON.stringify(hostRivals));
await w.screenshot({ path: 'shots/193-spectator.png' }); await h.screenshot({ path: 'shots/194-race.png' });
ok.watch = !view.runner && !view.trap && view.rivals.length === 1 && hostRivals.includes('b');
// both runners finish: b first, then a
await td(g1, () => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
await h.waitForTimeout(1200);
await td(h, () => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
await w.waitForFunction(() => document.querySelector('.partyScore'), null, { timeout: 10000 }).catch(() => {});
await h.waitForTimeout(800); await h.screenshot({ path: 'shots/195-result4.png' });
const res4 = await td(w, () => ({ title: document.querySelector('#panelCard h2')?.textContent, again: !!document.getElementById('again') }));
console.log('spectator sees the result:', JSON.stringify(res4));
ok.race = /wins the race/.test(res4.title || '') && !res4.again;
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

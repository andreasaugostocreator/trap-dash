// Batch C: wardrobe (cosmetics unlocked by trophies), stats, the podium result, cosmetics over the network.
// Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const hook = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/WebSocket|ERR_/.test(m.text()) && errs.push(m.text())); };
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); hook(p);
  await p.addInitScript(() => { if (!localStorage.getItem('trapdash-achievements')) localStorage.setItem('trapdash-achievements', JSON.stringify({ champion: 1, first_catch: 1, close5: 1, first_flag: 1 })); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
  await p.click('#profileBtn'); await p.click('[data-ptab="wardrobe"]'); await p.waitForTimeout(100);
  const locked = await p.$$eval('.ward.locked', l => l.length);
  await p.click('.wardRow >> nth=0 >> .ward >> nth=8');   // crown (None, straw, flower, cap, band, party, witch, antlers, crown)
  await p.click('.wardRow >> nth=1 >> .ward >> nth=1');   // red scarf
  await p.click('.wardRow >> nth=2 >> .ward >> nth=1');   // moss shirt
  await p.click('.wardRow >> nth=0 >> .ward >> nth=6');   // witch hat: locked
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/140-wardrobe.png' });
  const cos = await p.evaluate(() => JSON.parse(localStorage.getItem('trapdash-me2')).cos);
  ok.wardrobe = cos.hat === 'crown' && cos.scarf === 'brick' && cos.tint === 'moss' && locked > 5;
  console.log('wardrobe:', JSON.stringify(cos), 'locked items', locked);
  await p.click('#profileDone');
  // a same-screen level, both runs, to see the podium and the stats
  await p.click('text=Same screen'); await p.click('#startBtn');
  for (let n = 0; n < 2; n++) {
    await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
    await p.waitForTimeout(n ? 1500 : 500);
    await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
    await p.waitForFunction(() => window.__td.run.phase === 'end', null, { timeout: 9000 }); await p.waitForTimeout(700);
    if (n === 0) await p.click('#go2');
  }
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'shots/141-podium.png' });
  ok.podium = (await p.$$('.pod canvas')).length === 2 && (await p.$$('.podCard')).length === 2;
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('trapdash-stats')));
  ok.stats = st.runs === 1 && st.flags === 1 && st.recent.length === 1 && st.recent[0].outcome === 'win';
  console.log('stats:', JSON.stringify({ runs: st.runs, flags: st.flags, trapPts: st.trapPts, won: st.levelsWon, recent: st.recent[0] }));
  await p.click('#toLobby'); await p.click('#leaveBtn'); await p.click('#profileBtn'); await p.click('[data-ptab="stats"]'); await p.waitForTimeout(600);
  await p.screenshot({ path: 'shots/142-stats.png' });
  await p.close();
}
// phone sizes of the same screens
{
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); hook(p);
  await p.addInitScript(() => { localStorage.setItem('trapdash-achievements', JSON.stringify({ champion: 1 })); localStorage.setItem('trapdash-me2', JSON.stringify({ name: 'Phoney', char: 'pirate', cos: { hat: 'crown' } })); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
  await p.tap('#profileBtn'); await p.tap('[data-ptab="wardrobe"]'); await p.waitForTimeout(600); await p.screenshot({ path: 'shots/143-wardrobe-phone.png' });
  const fits = await p.evaluate(() => { const c = document.querySelector('#profile .card'); return c.scrollHeight <= c.clientHeight + 2; });
  console.log('wardrobe fits the phone without scrolling:', fits);
  await p.tap('#profileDone'); await p.tap('text=Same screen'); await p.tap('#startBtn');
  for (let n = 0; n < 2; n++) {
    await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
    await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
    await p.waitForFunction(() => window.__td.run.phase === 'end', null, { timeout: 9000 }); await p.waitForTimeout(700);
    if (n === 0) await p.tap('#go2');
  }
  await p.waitForTimeout(900); await p.screenshot({ path: 'shots/144-podium-phone.png' });
  await p.close();
}
// cosmetics travel with the player online
{
  const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
  const ch = await b.newContext({ viewport: { width: 1000, height: 600 } }), cg = await b.newContext({ viewport: { width: 1000, height: 600 } });
  await cg.addInitScript(() => { localStorage.setItem('trapdash-achievements', JSON.stringify({ champion: 1, combo: 1 })); localStorage.setItem('trapdash-me2', JSON.stringify({ name: 'Guesty', char: 'robot', cos: { hat: 'crown', scarf: 'teal' } })); });
  const h = await ch.newPage(), g = await cg.newPage(); hook(h); hook(g);
  await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
  await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
  const code = await h.textContent('#roomCode');
  await g.click('text=Join a party'); await g.fill('#code', code); await g.click('#joinGo');
  await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(300);
  const seen = await h.evaluate(() => window.__td.players.b.cos);
  ok.online = seen && seen.hat === 'crown' && seen.scarf === 'teal';
  console.log('host sees guest cosmetics:', JSON.stringify(seen));
  await h.screenshot({ path: 'shots/145-lobby-cos.png' });
  await ch.close(); await cg.close();
}
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

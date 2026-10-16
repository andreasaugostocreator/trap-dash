// Batch A (UX): settings sliders + vibration strength, remembered lobby choices, pause menu + 3-2-1 resume,
// first-time tips, left-handed ring, button size, first launch, online rematch (both tap). Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const hook = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/WebSocket|ERR_/.test(m.text()) && errs.push(m.text())); };
// 1. settings + lobby memory + pause/resume + tips (desktop)
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); hook(p);
  await p.goto('http://localhost:8080/?tips'); await p.waitForTimeout(500);
  await p.click('#setBtn'); await p.waitForTimeout(150);
  await p.$eval('#volMusic', el => { el.value = 30; el.dispatchEvent(new Event('input')); });
  await p.$eval('#volSfx', el => { el.value = 0; el.dispatchEvent(new Event('input')); });
  await p.click('#vibSeg button >> nth=2');
  await p.screenshot({ path: 'shots/120-settings.png' });
  await p.click('#setDone');
  const saved = await p.evaluate(() => ({ a: JSON.parse(localStorage.getItem('trapdash-audio')), s: JSON.parse(localStorage.getItem('trapdash-settings')) }));
  ok.sliders = saved.a.musicVol === 0.3 && saved.a.sfxVol === 0 && saved.s.vib === 2;
  console.log('sliders saved:', JSON.stringify(saved.a), 'vib', saved.s.vib);
  await p.click('text=Same screen'); await p.click('#levels button >> nth=3'); await p.click('#matchSeg button >> nth=1'); await p.click('#firstSeg button >> nth=1');
  await p.click('#leaveBtn'); await p.click('text=Same screen');
  const lob = await p.evaluate(() => ({ lv: [...document.querySelectorAll('#levels button')].findIndex(b => b.classList.contains('on')), bo3: document.querySelector('#matchSeg .on').textContent, first: [...document.querySelectorAll('#firstSeg button')].findIndex(b => b.classList.contains('on')) }));
  ok.lobby = lob.lv === 3 && lob.bo3 === 'Best of 3' && lob.first === 1;
  console.log('lobby remembered:', JSON.stringify(lob));
  await p.click('#leaveBtn'); await p.click('text=Practice'); await p.click('#levels button >> nth=0'); await p.click('#startBtn');
  await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
  await p.waitForTimeout(300);
  const tip = await p.evaluate(() => document.getElementById('tip').classList.contains('show') && document.getElementById('tip').textContent);
  ok.tip = !!tip; console.log('first-time tip:', tip);
  await p.screenshot({ path: 'shots/121-tip.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.screenshot({ path: 'shots/122-pause.png' });
  const info = await p.textContent('.pInfo'); const ctl = await p.textContent('.pCtls');
  await p.click('#resume'); await p.waitForTimeout(400);
  const during = await p.evaluate(() => ({ paused: window.__td.run.paused, count: document.getElementById('count').textContent }));
  await p.waitForTimeout(3000);
  const after = await p.evaluate(() => window.__td.run.paused);
  ok.pause = /Spring|Hills|s/.test(info) && /RUN/.test(ctl) && during.paused && during.count === '3' && !after;
  console.log('pause info:', info.replace(/\s+/g, ' ').trim(), '| resume count shows', during.count, 'paused during:', during.paused, 'after:', after);
  await p.close();
}
// 2. left-handed ring + button size on a phone
{
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); hook(p);
  await p.addInitScript(() => localStorage.setItem('trapdash-settings', JSON.stringify({ preview: false, lefty: true, btnSize: 1.2 })));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
  await p.tap('text=Practice'); await p.tap('#startBtn'); await p.waitForTimeout(600);
  const g = await p.evaluate(() => { const r = el => el.getBoundingClientRect(); const j = r(document.querySelector('#tJump canvas')), s = r(document.querySelector('#arrows canvas')), gs = [...document.querySelectorAll('#rgad .gbtn')].map(r);
    return { jumpX: j.left, stickX: s.left, ringRightOfJump: gs.reduce((a, x) => a + x.left + x.width / 2, 0) / gs.length > j.left + j.width / 2, inside: gs.every(x => x.left >= 0 && x.right <= innerWidth), jw: j.width }; });
  ok.lefty = g.jumpX < g.stickX && g.ringRightOfJump && g.inside && g.jw > 60;
  console.log('left-handed:', JSON.stringify(g));
  await p.screenshot({ path: 'shots/123-lefty.png' });
  await p.close();
}
// 3. first launch: name + runner, then the training offer
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); hook(p);
  await p.goto('http://localhost:8080/?firstrun'); await p.waitForTimeout(3800);
  const step1 = await p.isVisible('#profile') && await p.textContent('#profileDone');
  await p.screenshot({ path: 'shots/124-welcome1.png' });
  await p.click('#profileDone'); await p.waitForTimeout(200);
  const step2 = await p.isVisible('#wRun');
  await p.screenshot({ path: 'shots/125-welcome2.png' });
  await p.click('#wSkip'); await p.waitForTimeout(100);
  ok.first = step1 === 'Next' && step2 && await p.isVisible('#title');
  console.log('first launch: step1 button', step1, '| step2 shown', step2);
  await p.reload(); await p.waitForTimeout(3800);
  ok.firstOnce = !(await p.isVisible('#profile')); console.log('not shown again:', ok.firstOnce);
  await p.close();
}
// 4. online rematch: both have to tap
{
  const q = '?nop2p&relay=ws://127.0.0.1:8883';
  const ch = await b.newContext({ viewport: { width: 1280, height: 720 } }), cg = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const h = await ch.newPage(), g = await cg.newPage(); hook(h); hook(g);
  await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
  await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
  const code = await h.textContent('#roomCode');
  await g.click('text=Join a party'); await g.fill('#code', code); await g.click('#joinGo');
  await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(300);
  await h.click('#startBtn');
  for (let n = 0; n < 2; n++) {
    const runner = n === 0 ? h : g;   // host runs first
    await runner.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 15000 });
    await runner.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
    await h.waitForFunction(() => window.__td.run && window.__td.run.phase === 'end', null, { timeout: 15000 }); await h.waitForTimeout(600);
    if (n === 0) { await h.click('#go2'); }
  }
  await g.waitForSelector('#again', { timeout: 8000 });
  await g.click('#again'); await h.waitForTimeout(500);
  const hostSees = await h.textContent('#rmState'), stillEnd = await h.evaluate(() => window.__td.run.phase === 'end');
  await h.screenshot({ path: 'shots/126-rematch-wait.png' });
  await h.click('#again');
  await h.waitForFunction(() => window.__td.run && window.__td.run.n === 1 && window.__td.run.phase !== 'end', null, { timeout: 8000 }).catch(() => {});
  const st = await h.evaluate(() => ({ phase: window.__td.run.phase, runner: window.__td.run.runner, n: window.__td.run.n }));
  const gst = await g.evaluate(() => window.__td.run && window.__td.run.phase);
  ok.rematch = /wants a rematch/.test(hostSees) && stillEnd && st.runner === 'b' && st.phase !== 'end' && gst !== 'end';
  console.log('rematch: host saw', JSON.stringify(hostSees), '| after both:', JSON.stringify(st), 'guest', gst);
  await ch.close(); await cg.close();
}
console.log(JSON.stringify(ok));
console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

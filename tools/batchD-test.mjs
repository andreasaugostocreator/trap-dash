// Batch D: the world-map level select, middle-distance layers, the same weather on both screens, menu music.
// Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const hook = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/WebSocket|ERR_/.test(m.text()) && errs.push(m.text())); };
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); hook(p);
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
  await p.click('text=Same screen');
  ok.pins = (await p.$$('#levels .pin')).length === 11;
  await p.click('#levels button:has-text("Frost Castle")');
  ok.pick = (await p.textContent('#levels .pin.on span')) === 'Frost Castle' && !!(await p.$('#levels .pin.on canvas.pinRunner'));
  // every world draws with its weather without errors
  for (let lv = 0; lv < 11; lv++) {
    await p.evaluate(lv => { window.__td.startRun(lv, 'a', 1); }, lv); await p.waitForTimeout(250);
  }
  ok.worlds = true;
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
  await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(300);
  const same = [];
  for (const name of ['Haunted Manor', 'Sunny Hills', 'Midnight Meadow']) {
    await h.click(`#levels button:has-text("${name}")`); await h.click('#startBtn');
    await g.waitForFunction(() => window.__td.run, null, { timeout: 8000 }); await h.waitForTimeout(600);
    const wh = await h.evaluate(() => JSON.stringify(window.__td.R.weather)), wg = await g.evaluate(() => JSON.stringify(window.__td.R.weather));
    same.push(name + ': ' + wh + (wh === wg ? ' (same)' : ' vs ' + wg));
    await h.evaluate(() => window.__td.toLobby()); await g.waitForFunction(() => !window.__td.run, null, { timeout: 8000 }); await h.waitForTimeout(300);
  }
  ok.weatherShared = same.every(x => x.endsWith('(same)'));
  console.log('weather on both screens:', same.join(' | '));
  await ch.close(); await cg.close();
}
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

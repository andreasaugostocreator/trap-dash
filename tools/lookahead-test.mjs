// The trapper sees ahead: camera lead, edge markers for off-screen traps, "in Ns" on the trap bar. Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p; };
const q = '?nop2p&relay=ws://127.0.0.1:8883';
for (const [name, vp] of [['phone', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['pc', { viewport: { width: 1280, height: 720 } }]]) {
  const h = await page({ viewport: { width: 1280, height: 720 } }), g = await page(vp);
  await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
  await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
  await (name === 'phone' ? g.tap('text=Join a party') : g.click('text=Join a party')); await g.fill('#code', await h.textContent('#roomCode'));
  await (name === 'phone' ? g.tap('#joinGo') : g.click('#joinGo'));
  await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(400);
  await h.click('#levels button:has-text("Sunny Hills")'); await h.click('#startBtn'); await h.waitForTimeout(3800);
  await h.keyboard.down('ArrowRight'); await h.waitForTimeout(700); await h.keyboard.up('ArrowRight'); await h.waitForTimeout(1500);
  const info = await g.evaluate(() => { const R = window.__td.R, w = window.__td.run.world, p = w.player; return { runnerAt: +(((p.x - R.camX) / R.lo.width)).toFixed(2), tilesWide: +(R.lo.width / 16).toFixed(1), bar: [...document.querySelectorAll('.tbtn')].map(b => b.dataset.kind + ':' + b.dataset.state + ':' + b.querySelector('.eta').textContent).join('  ') }; });
  console.log(name, JSON.stringify(info));
  await g.screenshot({ path: `shots/95-trapper-lookahead-${name}.png` });
  await h.close(); await g.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

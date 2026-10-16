// Screenshots of the in-game top bar on a PC, a phone and the same screen. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
for (const [name, o, go] of [['pc', { viewport: { width: 1280, height: 720 } }, 'Practice'], ['phone', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'Same screen']]) {
  const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
  await p.click('text=' + go); await p.click('#startBtn'); await p.waitForTimeout(3800);
  await p.evaluate(() => { const w = window.__td.run.world; w.time = 52.3; w.player.deaths = 3; });
  await p.waitForTimeout(100);
  await p.screenshot({ path: `shots/130-hud-${name}.png`, clip: { x: 0, y: 0, width: o.viewport.width, height: 90 } });
  await p.screenshot({ path: `shots/131-game-${name}.png` });
  await p.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

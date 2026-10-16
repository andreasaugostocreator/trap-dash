// The world-map level select on a PC and a phone. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
for (const [name, o] of [['pc', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
  await p.click('text=Same screen'); await p.waitForTimeout(500);
  await p.screenshot({ path: `shots/155-map-${name}.png` });
  await p.click('#levels button:has-text("Lava Caves")'); await p.waitForTimeout(500);
  await p.screenshot({ path: `shots/156-map-${name}-lava.png` });
  console.log(name, 'selected:', await p.evaluate(() => document.querySelector('#levels .pin.on span').textContent), '| fits:', await p.evaluate(() => { const c = document.querySelector('#lobby .card'); return c.scrollHeight <= c.clientHeight + 2; }));
  await p.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

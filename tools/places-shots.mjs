// Every title place by day and at night (shots/112-*.png). Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(3600);
await p.evaluate(() => document.querySelector('.toast')?.remove());
for (let i = 0; i < 4; i++) for (const [when, d] of [['day', 0.3], ['night', 0.83]]) {
  const t0 = Date.now();
  await p.evaluate(([i, d]) => { const s = window.__td.scene; s.setPlace(i); s.day = d; s.fade = 1; }, [i, d]);
  await p.waitForTimeout(1200);
  const name = await p.evaluate(() => window.__td.scene.placeName);
  await p.screenshot({ path: `shots/112-${i}-${when}.png` });
  console.log(name, when, 'ok');
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

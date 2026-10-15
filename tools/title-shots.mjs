// Screenshots of the title world: different screens and times of day, plus the profile picker and the lobby.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 900 ? 3 : 1, isMobile: w < 900, hasTouch: w < 900 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(3800);
  await p.evaluate(() => document.querySelector('.toast')?.remove());
  await p.screenshot({ path: `shots/110-title-day-${w}x${h}.png` });
  for (const [name, d] of [['sunset', 0.665], ['night', 0.82]]) { await p.evaluate(d => { window.__td.scene.day = d; }, d); await p.waitForTimeout(700); await p.screenshot({ path: `shots/110-title-${name}-${w}x${h}.png` }); }
  await p.evaluate(() => { window.__td.scene.day = 0.3; });
  await p.evaluate(() => document.getElementById('profileBtn').click()); await p.waitForTimeout(600);
  await p.screenshot({ path: `shots/110-profile-${w}x${h}.png` });
  await p.evaluate(() => document.getElementById('profileDone').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('[data-go="local"]').click()); await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/110-lobby-${w}x${h}.png` });
  await p.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

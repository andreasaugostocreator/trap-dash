// The item guide: every trap and gadget with a description, three tabs, from the title and the pause menu. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
for (const [name, vp] of [['phone', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }], ['portrait', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const p = await b.newPage(vp); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
  await p.tap('#itemsBtn'); await p.waitForTimeout(200);
  const counts = [];
  for (const tab of ['traps', 'runner', 'trapper']) { await p.tap(`[data-tab="${tab}"]`); await p.waitForTimeout(120); counts.push(tab + ' ' + await p.locator('.gRow').count() + ' (empty descriptions: ' + await p.evaluate(() => [...document.querySelectorAll('.gRow small')].filter(s => !s.textContent.trim()).length) + ')'); if (tab === 'runner') await p.screenshot({ path: `shots/104-guide-${name}.png` }); }
  console.log(name, counts.join(' | '));
  await p.tap('#guideDone');
  await p.tap('text=Same screen'); await p.tap('#startBtn'); await p.waitForTimeout(3600);
  await p.tap('#pauseBtn'); await p.tap('#pItems'); await p.waitForTimeout(150); await p.tap('#guideDone'); await p.waitForTimeout(150);
  console.log(name, 'guide from the pause menu returns to it:', await p.isVisible('#resume'));
  await p.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

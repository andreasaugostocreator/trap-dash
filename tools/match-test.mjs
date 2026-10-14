// Level preview, ghost of the last run and a best-of-3 match on one screen. Needs the site on :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.addInitScript(() => localStorage.setItem('trapdash-settings', JSON.stringify({ preview: true, ghost: true })));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
await p.tap('text=Same screen'); await p.tap('#matchSeg button >> nth=1'); await p.screenshot({ path: 'shots/99-lobby-bo3.png' });
await p.tap('#startBtn'); await p.waitForTimeout(1200);
const ph = await p.evaluate(() => ({ phase: window.__td.run.phase, camX: Math.round(window.__td.R.camX) }));
await p.screenshot({ path: 'shots/99-preview.png' });
await p.waitForTimeout(800);
console.log('preview:', JSON.stringify(ph), '-> camera moved to', Math.round(await p.evaluate(() => window.__td.R.camX)));
await p.tap('#pvSkipBtn'); await p.waitForTimeout(100);
console.log('tap skips to:', await p.evaluate(() => window.__td.run.phase));
const finish = async () => { await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
  await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; }); await p.waitForTimeout(1900); };
// play a whole match: a always wins by finishing; b times out (we fake it by warping a to the goal faster)
for (let lv = 0; lv < 3; lv++) {
  await finish();                                    // run 1
  if (!(await p.isVisible('#go2'))) break;
  await p.tap('#go2'); await p.waitForTimeout(300);
  if (await p.isVisible('#preview')) await p.tap('#pvSkipBtn');
  await p.waitForFunction(() => window.__td.run.phase === 'play', null, { timeout: 9000 });
  if (lv === 0) { await p.waitForTimeout(400); await p.screenshot({ path: 'shots/99-ghost.png' }); console.log('ghost shown in run 2:', await p.evaluate(() => !!window.__td.run.ghost)); }
  await p.waitForTimeout(lv === 0 ? 600 : 1200);       // run 2 is slower
  await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; }); await p.waitForTimeout(1900);
  const trophy = await p.isVisible('.trophy');
  console.log(`level ${lv + 1}: score`, JSON.stringify(await p.evaluate(() => window.__td.score)), trophy ? '-> TROPHY' : '');
  if (trophy) { await p.waitForTimeout(600); await p.screenshot({ path: 'shots/99-trophy.png' }); break; }
  await p.tap('#nextLv'); await p.waitForTimeout(300); if (await p.isVisible('#preview')) await p.tap('#pvSkipBtn');
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

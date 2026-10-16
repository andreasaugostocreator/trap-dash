// Every world with its middle-distance layer and each kind of weather. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 1000, height: 560 } }); p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
const shots = [[0, 'rain'], [0, 'golden'], [2, 'leaves'], [5, 'fireflies'], [6, null], [7, 'ash'], [8, 'blizzard'], [9, 'golden'], [10, 'fog'], [4, 'petals']];
for (const [lv, kind] of shots) {
  await p.evaluate(([lv, kind]) => { window.__td.nav('practice'); window.__td.startRun(lv, 'a', 1); window.__td.R.weather = kind ? { kind, seed: 3 } : null; window.__td.run.bot = null; }, [lv, kind]);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const w = window.__td.run.world; w.player.x += 300; });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/150-wx-${lv}-${kind || 'clear'}.png` });
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

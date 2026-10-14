// Every menu screen must fit without scrolling on common phone sizes (landscape and portrait).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const sizes = [[844, 390], [932, 430], [667, 375], [640, 360], [780, 360], [915, 412], [390, 844], [375, 667], [360, 640], [360, 780], [412, 915], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [673, 841]];   // iPhones, Galaxy phones, small Androids, iPads, a foldable
const fits = p => p.evaluate(() => { const s = [...document.querySelectorAll('.screen')].find(x => !x.classList.contains('hidden')); const c = s.querySelector('.card'); return { over: Math.max(0, c.scrollHeight - c.clientHeight, s.scrollHeight - s.clientHeight), w: c.scrollWidth > c.clientWidth + 1 }; });
let bad = 0;
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
  const out = [];
  const test = async name => { const r = await fits(p); out.push(`${name}${r.over || r.w ? ` OVERFLOWS ${r.over}px` : ' ok'}`); if (r.over || r.w) bad++; await p.screenshot({ path: `shots/80-${name}-${w}x${h}.png` }); };
  await test('title');
  await p.tap('text=Same screen'); await p.waitForTimeout(200); await test('lobby');
  await p.tap('#leaveBtn'); await p.tap('text=Join a party'); await p.waitForTimeout(200); await test('join');
  await p.tap('text=Back'); await p.tap('#howBtn'); await p.waitForTimeout(200); await test('howto');
  console.log(`${w}x${h}:`, out.join(' | '));
  await p.close();
}
console.log(bad ? `${bad} screens need scrolling` : 'everything fits');
await b.close();

// Every menu screen must fit without scrolling on common phone sizes (landscape: upright phones get the turn screen).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const sizes = [[844, 390], [932, 430], [667, 375], [640, 360], [780, 360], [915, 412], [390, 844], [375, 667], [360, 640], [360, 780], [412, 915], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [673, 841]].filter(([w, h]) => w > h);   // iPhones, Galaxy phones, small Androids, iPads, a foldable
const fits = p => p.evaluate(() => {
  const shown = [...document.querySelectorAll('.screen')].filter(x => !x.classList.contains('hidden')), s = shown.find(x => x.classList.contains('overlay')) || shown[0]; const c = s.querySelector('.card');
  if (c && s.id === 'panel') return { over: Math.max(0, c.getBoundingClientRect().bottom - innerHeight, -c.getBoundingClientRect().top), w: c.scrollWidth > c.clientWidth + 1 };   // panels may scroll inside, but must sit on screen
  if (c) return { over: Math.max(0, c.scrollHeight - c.clientHeight, s.scrollHeight - s.clientHeight), w: c.scrollWidth > c.clientWidth + 1 };
  // the title has no card: its pieces must stay on screen and clear of each other (measured after their entrance)
  const parts = ['.tTop .logo', '.tMenu', '.tCorner', '#profileBtn'].map(q => s.querySelector(q)).filter(Boolean).map(e => e.getBoundingClientRect());
  let over = 0;
  for (const r of parts) over = Math.max(over, Math.ceil(r.bottom - innerHeight), Math.ceil(-r.top), Math.ceil(r.right - innerWidth), Math.ceil(-r.left));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) { const a = parts[i], q = parts[j]; if (a.left < q.right && q.left < a.right && a.top < q.bottom && q.top < a.bottom) over = Math.max(over, Math.ceil(Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top))); }
  return { over, w: false };
});
let bad = 0;
for (const [w, h] of [[390, 844], [820, 1180]]) {   // upright: the app turns itself and still fills the screen in landscape
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(3600);
  const r = await p.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect(); return { rot: document.documentElement.classList.contains('rot'), x: Math.round(a.left), y: Math.round(a.top), w: Math.round(a.width), h: Math.round(a.height) }; });
  const ok = r.rot && r.x === 0 && r.y === 0 && r.w === w && r.h === h;
  console.log(`${w}x${h}: turned ${r.rot}, covers ${r.w}x${r.h} at ${r.x},${r.y} ${ok ? 'ok' : 'WRONG'}`); if (!ok) bad++;
  await p.screenshot({ path: `shots/80-rot-${w}x${h}.png` }); await p.close();
}
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(3600);
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

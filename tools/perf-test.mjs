// Frame-time check on a phone-sized screen with the CPU slowed down (like a cheap phone).
// Usage: node tools/perf-test.mjs [throttle=6]. Needs the site on :8080.
import { chromium } from 'playwright-core';
import { LEVELS } from '../src/levels.js';
const throttle = +(process.argv[2] || 6);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await b.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
const cdp = await p.context().newCDPSession(p);
await p.tap('text=Practice');
for (const id of ['gauntlet', 'lava', 'manor', 'cove']) {
  await p.evaluate(i => window.__td.startRun(i, 'a', 1), LEVELS.findIndex(l => l.id === id));
  await p.waitForTimeout(3600);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const r = await p.evaluate(() => new Promise(res => {
    const R = window.__td.R, draw = R.draw.bind(R), times = [], frames = [];
    let drawMs = 0, n = 0;
    R.draw = (w, o) => { const t = performance.now(); draw(w, o); drawMs += performance.now() - t; n++; };
    let last = performance.now();
    const keyDown = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    keyDown();
    const tick = now => { frames.push(now - last); last = now; if (frames.length < 240) requestAnimationFrame(tick); else { R.draw = draw; dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' })); frames.sort((a, b) => a - b); res({ avg: frames.reduce((a, b) => a + b) / frames.length, p95: frames[Math.floor(frames.length * 0.95)], draw: drawMs / n, canvas: document.getElementById('game').width + 'x' + document.getElementById('game').height, lo: R.lo.width + 'x' + R.lo.height }); } };
    requestAnimationFrame(tick);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(id.padEnd(9), `frame avg ${r.avg.toFixed(1)} ms (p95 ${r.p95.toFixed(1)}), draw ${r.draw.toFixed(1)} ms, canvas ${r.canvas}, low-res ${r.lo}`);
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await b.close();

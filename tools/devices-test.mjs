// The game screen on many devices: the play band must be big enough and no control may cover it or leave the screen.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const devices = [['small android', 360, 640], ['small android', 640, 360], ['galaxy s', 360, 780], ['galaxy s', 780, 360], ['galaxy ultra', 412, 915], ['galaxy ultra', 915, 412],
  ['iphone se', 375, 667], ['iphone se', 667, 375], ['iphone pro max', 430, 932], ['iphone pro max', 932, 430], ['ipad', 820, 1180], ['ipad', 1180, 820], ['fold open', 673, 841]].filter(([, w, h]) => w > h);   // landscape only: upright shows the turn screen
let bad = 0;
for (const [name, w, h] of devices) {
  for (const mode of ['Practice', 'Same screen']) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8080/'); await p.waitForTimeout(300);
    await p.evaluate(go => document.querySelector(`[data-go="${go}"]`).click(), mode === 'Practice' ? 'practice' : 'local');
    await p.waitForTimeout(200); await p.evaluate(() => document.getElementById('startBtn').click()); await p.waitForTimeout(3700);
    const r = await p.evaluate(() => {
      const R = window.__td.R, top = R.insets.top, bottom = innerHeight - R.insets.bottom, out = [];
      for (const el of document.querySelectorAll('.pad:not(.hidden) button, .hud button')) {
        const e = el.getBoundingClientRect();
        if (!e.width) continue;
        const ring = el.closest('#padR.ring') && e.right > innerWidth * 0.72 && e.top > bottom - 70;   // the gadget ring may reach a little into the bottom-right corner
        if (!ring && e.bottom > top + 1 && e.top < bottom - 1) out.push('covers the play area');
        if (e.right > innerWidth + 1 || e.left < -1 || e.bottom > innerHeight + 1) out.push('off screen');
      }
      const band = bottom - top, tiles = band * R.dpr / R.k / 16;
      if (tiles < 7) out.push(`play area only ${tiles.toFixed(1)} tiles tall`);
      return { band: Math.round(band), tiles: tiles.toFixed(1), across: (innerWidth * R.dpr / R.k / 16).toFixed(1), problems: [...new Set(out)] };
    });
    if (r.problems.length || errs.length) bad++;
    console.log(`${(name + ' ' + w + 'x' + h).padEnd(26)} ${mode.padEnd(12)} play area ${r.band}px = ${r.tiles} tiles tall, ${r.across} across ${r.problems.length ? 'PROBLEMS: ' + r.problems.join(', ') : 'ok'} ${errs.join(' ')}`);
    if (mode === 'Same screen') await p.screenshot({ path: `shots/105-${name.replace(/ /g, '-')}-${w}x${h}.png` });
    await p.close();
  }
}
console.log(bad ? bad + ' with problems' : 'all devices ok');
await b.close();

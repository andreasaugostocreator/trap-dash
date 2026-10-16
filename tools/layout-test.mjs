// Screenshots of the in-game layout on phones (landscape and portrait) for runner, trapper and same-screen,
// and a check that no control overlaps the band where the action is (the map itself fills the screen). Needs :8080 and the relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const phone = (portrait) => ({ viewport: portrait ? { width: 390, height: 844 } : { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = async o => { const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message)); return p; };
const check = async (p, name) => {
  const r = await p.evaluate(() => {
    // the map fills the screen; the controls float over it but must stay out of the clear band the camera keeps the action in
    const R = window.__td.R, g = document.getElementById('game').getBoundingClientRect(), bad = [];
    const c = { top: R.insets.top, bottom: innerHeight - R.insets.bottom, width: g.width, height: innerHeight - R.insets.top - R.insets.bottom };
    for (const el of document.querySelectorAll('.pad:not(.hidden) button, .hud button')) {
      const e = el.getBoundingClientRect();
      const ring = el.closest('#padR.ring') && e.right > innerWidth * 0.72 && e.bottom > c.bottom - 70;   // the gadget ring may reach a little into the bottom-right corner
      if (ring && e.top < c.bottom - 1) window.__ringOver = Math.max(window.__ringOver || 0, Math.round(c.bottom - e.top));
      if (e.width && !ring && e.bottom > c.top + 1 && e.top < c.bottom - 1) bad.push((el.id || el.dataset.kind || el.dataset.id) + ' overlaps the play band');
      if (e.right > innerWidth + 1 || e.left < -1) bad.push((el.id || el.dataset.kind || el.dataset.id) + ' off screen ' + Math.round(e.left) + '..' + Math.round(e.right) + '/' + innerWidth);
    }
    // round arcade buttons: compare their caps as circles (the ring packs them edge to edge); others as boxes
    const btns = [...document.querySelectorAll('.pad:not(.hidden) button')].map(el => { const k = el.querySelector('canvas.knob'); return { r: el.getBoundingClientRect(), k: k && k.getBoundingClientRect(), ring: !!el.closest('#padR.ring') || el.id === 'tJump' }; });
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const A = btns[i], Q = btns[j];
      if (A.ring && Q.ring && A.k && Q.k) { const d = Math.hypot(A.k.x + A.k.width / 2 - Q.k.x - Q.k.width / 2, A.k.y + A.k.height / 2 - Q.k.y - Q.k.height / 2); if (d < (A.k.width + Q.k.width) / 2 - 8) bad.push('two buttons overlap'); continue; }
      const a = A.r, q = Q.r; if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) bad.push('two buttons overlap');
    }
    return { view: `${Math.round(c.width)}x${Math.round(c.height)}`, bad: [...new Set(bad)], ring: window.__ringOver || 0 };
  });
  await p.screenshot({ path: `shots/70-${name}.png` });
  console.log(name.padEnd(22), 'play band', r.view, r.bad.length ? 'PROBLEMS: ' + r.bad.join(', ') : 'ok', r.ring ? `(gadget ring reaches ${r.ring}px into the bottom-right corner)` : '');
};
for (const portrait of [false]) {   // landscape only now
  const tag = portrait ? 'portrait' : 'landscape';
  const pr = await page(phone(portrait));
  await pr.goto('http://localhost:8080/'); await pr.waitForTimeout(400); await pr.tap('text=Practice'); await pr.tap('#startBtn'); await pr.waitForTimeout(3800);
  await check(pr, `runner-${tag}`);
  const lo = await page(phone(portrait));
  await lo.goto('http://localhost:8080/'); await lo.waitForTimeout(400); await lo.tap('text=Same screen'); await lo.tap('#levels button:has-text("Windy Works")'); await lo.tap('#startBtn'); await lo.waitForTimeout(3800);
  await check(lo, `same-screen-${tag}`);
  const q = '?nop2p&relay=ws://127.0.0.1:8883';
  const h = await page({ viewport: { width: 1280, height: 720 } }), g = await page(phone(portrait));
  await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(400);
  await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
  await g.tap('text=Join a party'); await g.fill('#code', await h.textContent('#roomCode')); await g.tap('#joinGo');
  await h.waitForFunction(() => window.__td.players.b);
  await h.click('#levels button:has-text("Windy Works")'); await h.click('#startBtn'); await h.waitForTimeout(4000);
  await check(g, `trapper-${tag}`);
  if (!portrait) await check(h, 'runner-pc');
}
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'no errors');
await b.close();

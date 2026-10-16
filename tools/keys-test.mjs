// Gadget keys stay the same on every map, and a trapper's bar follows the runner's decoy. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
await p.click('text=Same screen');
const keys = {};
for (let lv = 0; lv < 11; lv++) {
  await p.evaluate(lv => window.__td.startRun(lv, 'a', 1), lv); await p.waitForTimeout(150);
  const k = await p.evaluate(() => [...document.querySelectorAll('.gbtn')].map(b => [b.dataset.id, b.querySelector('.kc')?.textContent]));
  for (const [id, key] of k) if (key) (keys[id] = keys[id] || new Set()).add(key);
}
const clash = Object.entries(keys).filter(([, s]) => s.size > 1);
console.log('keys:', Object.entries(keys).map(([id, s]) => id + '=' + [...s].join('/')).join(' '));
ok.consistent = clash.length === 0 && [...keys.dash || []][0] === 'Shift';
// the decoy: the trapper's slots come from the decoy's position
await p.evaluate(() => { window.__td.startRun({ ...window.__td.levels[0], loadout: { runner: ['decoy', 'dash', 'shield', 'jam'], trapper: ['bolt', 'glue', 'gust', 'hex'] } }, 'a', 1); });
await p.waitForFunction(() => window.__td.run.phase === 'play', null, { timeout: 8000 });
const r = await p.evaluate(async () => {
  const run = window.__td.run, w = run.world, before = run.slots.filter(Boolean).map(t => t.id);
  w.decoy = { x: w.player.x + 600, y: w.player.y, vx: 0, vy: 0, face: 1, onGround: true, t: 3 };
  await new Promise(r => setTimeout(r, 200));
  const after = run.slots.filter(Boolean).map(t => ({ id: t.id, x: (t.x0 + t.x1) * 8 }));
  return { before, after, decoyX: w.decoy.x };
});
ok.decoy = r.after.length > 0 && r.after.every(t => Math.abs(t.x - r.decoyX) < 22 * 16) && JSON.stringify(r.after.map(t => t.id)) !== JSON.stringify(r.before);
console.log('decoy slots:', JSON.stringify(r));
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

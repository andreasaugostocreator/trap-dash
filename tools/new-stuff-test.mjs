// Every trap kind and every gadget, rendered in the browser, with screenshots. Needs the site on :8080.
import { chromium } from 'playwright-core';
import { LEVELS } from '../src/levels.js';
import { GADGETS } from '../src/config.js';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
await p.click('text=Same screen');
const mill = LEVELS.find(l => l.id === 'mill');
const R = Object.keys(GADGETS.runner), T = Object.keys(GADGETS.trapper);
const groups = [];
for (let i = 0; i < Math.max(R.length, T.length) / 4; i++) groups.push({ runner: R.slice(i * 4, i * 4 + 4), trapper: T.slice(i * 4, i * 4 + 4) });
let n = 0;
for (const lo of groups) {
  await p.evaluate(([lv, lo]) => window.__td.startRun({ ...lv, loadout: lo }, 'a', 0), [mill, lo]);
  await p.waitForTimeout(3600);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(400);
  for (const side of ['trapper', 'runner']) for (const id of lo[side]) {
    const ok = await p.evaluate(([side, id]) => { const w = window.__td.run.world, q = w.player; return w.useGadget(side, id, q.x + 30, q.y); }, [side, id]);
    await p.waitForTimeout(250);
    await p.screenshot({ path: `shots/70-${String(n++).padStart(2, '0')}-${side}-${id}.png` });
    const s = await p.evaluate(() => { const w = window.__td.run.world, q = w.player; return `x ${Math.round(q.x)} dead ${q.deaths} fx ${w.fx.map(f => f.k)} st ${JSON.stringify(w.snapshot().st)}`; });
    console.log(side.padEnd(8), id.padEnd(8), ok ? 'used ' : 'NOPE ', s);
  }
  await p.keyboard.up('ArrowRight');
  // fire every trap
  const kinds = await p.evaluate(() => { const w = window.__td.run.world; for (const t of w.traps) { t.cd = 0; w.lock = 0; w.trigger(t.id, 0, false); } return [...new Set(w.traps.map(t => t.kind))]; });
  for (let k = 0; k < 6; k++) { await p.waitForTimeout(120); await p.screenshot({ path: `shots/71-traps-${n}-${k}.png` }); }
  console.log('fired', kinds.join());
}
// the trap bar on the mill, PC and phone
await p.screenshot({ path: 'shots/72-mill-bar.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

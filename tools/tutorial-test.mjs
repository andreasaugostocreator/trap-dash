// Training: the Coach Bot runs the whole course in trapper training (we fire the spikes on it), and runner training's hints advance.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
await p.tap('#howBtn'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/102-howto.png' });
await p.tap('#tutTrap'); await p.waitForTimeout(2000);
const hints = new Set(); let fired = false;
for (let i = 0; i < 90; i++) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => { const r = window.__td.run; if (!r) return null; const w = r.world, sp = w.traps.find(t => t.kind === 'spikes');
    return { x: Math.round(w.player.x / 16), hint: document.getElementById('hint').textContent, phase: r.phase, onSpikes: w.player.x > sp.x0 * 16 - 4 && w.player.x < (sp.x1 + 1) * 16 && w.player.onGround, step: r.tut && r.tut.step }; });
  if (!s) break;
  hints.add(s.step + ': ' + s.hint);
  if (s.onSpikes && !fired) { fired = true; await p.evaluate(() => { const w = window.__td.run.world; window.__td.fireTrap(w.traps.find(t => t.kind === 'spikes').id); }); }
  if (i === 14) await p.screenshot({ path: 'shots/102-trapper-training.png' });
  if (s.phase === 'end') break;
}
console.log([...hints].join('\n'));
console.log('trapper training ended with:', (await p.textContent('#panelCard')).replace(/\s+/g, ' ').slice(0, 120));
await p.tap('#tutNext'); await p.waitForTimeout(2500);
const steps = [];
for (const x of [5, 12, 20, 26, 38, 45, 65]) {
  await p.evaluate(x => { const w = window.__td.run.world; w.player.x = x * 16; w.player.y = 13 * 16 - 12; w.player.vy = 0; }, x);
  await p.waitForTimeout(400);
  steps.push(await p.evaluate(() => window.__td.run.tut.step + ' ' + document.getElementById('hint').textContent.slice(0, 50)));
}
console.log('runner training steps:\n ' + steps.join('\n '));
await p.screenshot({ path: 'shots/102-runner-training.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

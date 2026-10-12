// Achievements: unlock banner on a catch, the Trophies screen. Needs the site on :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400);
await p.click('text=Same screen'); await p.click('#startBtn'); await p.waitForTimeout(3600);
await p.evaluate(() => { const w = window.__td.run.world, t = w.traps.find(t => t.kind === 'spikes'); w.player.x = (t.x0 + t.x1) * 8 - 4; w.trigger(t.id); });
await p.waitForTimeout(700); await p.screenshot({ path: 'shots/99-achievement.png' });
console.log('banner:', await p.textContent('#achv'));
await p.waitForTimeout(1000); await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; }); await p.waitForTimeout(5000);
await p.goto('http://localhost:8080/'); await p.waitForTimeout(400); await p.click('#troBtn'); await p.waitForTimeout(200);
console.log('trophies:', await p.textContent('#panelCard .status'));
await p.screenshot({ path: 'shots/99-trophies.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();

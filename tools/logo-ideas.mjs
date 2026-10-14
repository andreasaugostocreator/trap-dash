// Renders the app icon ideas to logo-ideas/*.png and a contact sheet. Serve the site on :8080 first.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8080/tools/logo-ideas.html'); await p.waitForFunction(() => window.ready);
const ids = await p.evaluate(() => window.ideas);
await p.setViewportSize({ width: 512, height: 512 });
for (const id of ids) { await p.evaluate(i => window.draw(i, 512), id); await p.locator('canvas').screenshot({ path: `logo-ideas/${id}.png` }); }
console.log(ids.join(', '));
await b.close();

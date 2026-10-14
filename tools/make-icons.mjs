// Renders the app icons from the chosen idea in tools/logo-ideas.html (Sunset Saw). Usage: node tools/make-icons.mjs (serve on :8080 first)
import { chromium } from 'playwright-core';
const ICON = process.env.ICON || 'sunsetSaw';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage();
await page.goto((process.env.URL || 'http://localhost:8080/') + 'tools/logo-ideas.html');
await page.waitForFunction(() => window.ready);
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate(([i, s]) => window.draw(i, s), [ICON, size]);
  await page.locator('canvas').screenshot({ path: `icons/icon2-${size}.png` });
}
await page.setViewportSize({ width: 512, height: 512 });
await page.evaluate(i => window.drawPadded(i, 512), ICON);
await page.locator('canvas').screenshot({ path: 'icons/icon2-maskable-512.png' });
await browser.close();

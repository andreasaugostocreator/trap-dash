// Renders the app icon with the game's own drawing code. Usage: node tools/make-icons.mjs (serve on :8080 first)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage();
await page.goto((process.env.URL || 'http://localhost:8080/') + 'tools/icon.html');
await page.waitForFunction(() => window.ready);
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate(s => window.draw(s), size);
  await page.locator('canvas').screenshot({ path: `icons/icon-${size}.png` });
}
await browser.close();

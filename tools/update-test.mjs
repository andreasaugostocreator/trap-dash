// A resumed app notices a new release and reloads itself (between rounds). Needs :8080; edits sw.js briefly.
import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await b.newPage({ viewport: { width: 844, height: 390 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/'); await p.waitForTimeout(1500);
const before = await p.evaluate(() => { window.__marker = 1; return document.getElementById('appVersion')?.textContent || 'n/a'; });
const sw = fs.readFileSync('sw.js', 'utf8');
try {
  fs.writeFileSync('sw.js', sw.replace(/VERSION = '([^']+)'/, "VERSION = '$1-test'"));
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(2500);
  const reloaded = await p.evaluate(() => window.__marker === undefined);
  console.log('version shown before:', before, '| reloaded after a new release:', reloaded);
  console.log(reloaded ? 'update ok' : 'FAIL');
} finally { fs.writeFileSync('sw.js', sw); }
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
